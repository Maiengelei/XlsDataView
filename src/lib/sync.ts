import { db } from './db';
import type { ImportStats, RowData, RowRecord, SeriesMeta } from '../types';

interface SyncParams {
  series: string;
  headers: string[];
  keyColumn?: string;
  keyColumns?: string[];
  keyMode?: 'keyed' | 'snapshot';
  rows: RowData[];
  fileName: string;
  deleteMissing: boolean;
  mergeByDate?: boolean;
  dateColumn?: string;
  onProgress?: (progress: number, message: string) => void;
}

function normalizeKey(value: string): string {
  return value.trim();
}

function headersMatch(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return false;
    }
  }

  return true;
}

function serializeForCompare(row: RowData, headers: string[]): string {
  return headers.map((header) => `${header}:${row[header] ?? ''}`).join('|');
}

function normalizeKeyColumns(keyColumns: string[] | undefined, keyColumn: string | undefined): string[] {
  if (keyColumns && keyColumns.length > 0) {
    return Array.from(new Set(keyColumns.map((item) => item.trim()).filter(Boolean)));
  }

  if (keyColumn && keyColumn.trim()) {
    return [keyColumn.trim()];
  }

  return [];
}

function buildCompositeKey(row: RowData, keyColumns: string[]): string {
  return keyColumns.map((column) => normalizeKey(String(row[column] ?? ''))).join('\u001f');
}

function countUnchangedByContent(oldRows: RowData[], newRows: RowData[], headers: string[]): number {
  const oldCounter = new Map<string, number>();

  oldRows.forEach((row) => {
    const serialized = serializeForCompare(row, headers);
    oldCounter.set(serialized, (oldCounter.get(serialized) ?? 0) + 1);
  });

  let unchanged = 0;

  newRows.forEach((row) => {
    const serialized = serializeForCompare(row, headers);
    const remain = oldCounter.get(serialized) ?? 0;

    if (remain > 0) {
      unchanged += 1;
      oldCounter.set(serialized, remain - 1);
    }
  });

  return unchanged;
}

function reportProgress(
  callback: ((progress: number, message: string) => void) | undefined,
  progress: number,
  message: string
): void {
  callback?.(Math.max(0, Math.min(100, Math.round(progress))), message);
}

async function syncBySnapshot(params: {
  series: string;
  headers: string[];
  rows: RowData[];
  fileName: string;
  mergeByDate?: boolean;
  dateColumn?: string;
  onProgress?: (progress: number, message: string) => void;
}): Promise<ImportStats> {
  const { series, headers, rows, fileName, mergeByDate, dateColumn, onProgress } = params;

  reportProgress(onProgress, 5, '正在检查系列信息...');

  return db.transaction('rw', db.series, db.rows, async () => {
    const existingSeries = await db.series.get(series);

    if (existingSeries && !headersMatch(existingSeries.headers, headers)) {
      throw new Error(`系列 ${series} 的表头与已有数据不一致，已阻止导入。`);
    }

    const oldRecords = await db.rows.where('series').equals(series).toArray();
    const oldRows = oldRecords.map((record) => record.data);
    reportProgress(onProgress, 15, '正在计算变更差异...');

    const unchanged = countUnchangedByContent(oldRows, rows, headers);
    const changedPairs = Math.min(oldRows.length, rows.length) - unchanged;

    await db.rows.where('series').equals(series).delete();
    reportProgress(onProgress, 25, '正在清理旧数据...');

    if (rows.length > 0) {
      const chunkSize = 2000;
      const total = rows.length;

      for (let offset = 0; offset < total; offset += chunkSize) {
        const chunkRows = rows.slice(offset, offset + chunkSize);
        const payload: RowRecord[] = chunkRows.map((row, index) => ({
          series,
          rowKey: String(offset + index + 1),
          data: row
        }));
        await db.rows.bulkPut(payload);

        const written = Math.min(offset + chunkRows.length, total);
        const progress = 25 + (written / total) * 65;
        reportProgress(onProgress, progress, `正在写入数据 (${written}/${total})...`);
      }
    }

    const nextMeta: SeriesMeta = {
      series,
      headers,
      keyColumn: '',
      keyColumns: [],
      keyMode: 'snapshot',
      rowCount: rows.length,
      updatedAt: Date.now(),
      lastFileName: fileName,
      mergeByDate,
      dateColumn
    };

    await db.series.put(nextMeta);
    reportProgress(onProgress, 100, '导入完成');

    return {
      added: Math.max(rows.length - oldRows.length, 0),
      updated: Math.max(changedPairs, 0),
      unchanged,
      deleted: Math.max(oldRows.length - rows.length, 0),
      skippedMissingKey: 0,
      duplicateKeyOverwritten: 0,
      totalIncoming: rows.length,
      totalBefore: oldRows.length,
      totalAfter: rows.length
    };
  });
}

async function syncByKeyed(params: {
  series: string;
  headers: string[];
  rows: RowData[];
  keyColumns: string[];
  fileName: string;
  deleteMissing: boolean;
  mergeByDate?: boolean;
  dateColumn?: string;
  onProgress?: (progress: number, message: string) => void;
}): Promise<ImportStats> {
  const { series, headers, rows, keyColumns, fileName, deleteMissing, mergeByDate, dateColumn, onProgress } =
    params;

  reportProgress(onProgress, 5, '正在准备键控同步...');

  const incomingMap = new Map<string, RowData>();
  let skippedMissingKey = 0;
  let duplicateKeyOverwritten = 0;

  rows.forEach((row) => {
    const rowKey = buildCompositeKey(row, keyColumns);

    if (!rowKey || rowKey.split('\u001f').some((part) => part === '')) {
      skippedMissingKey += 1;
      return;
    }

    if (incomingMap.has(rowKey)) {
      duplicateKeyOverwritten += 1;
      return;
    }

    incomingMap.set(rowKey, row);
  });

  if (duplicateKeyOverwritten > 0) {
    throw new Error(
      `检测到 ${duplicateKeyOverwritten} 行键值重复。为防止丢数据已阻止导入，请增加复合键列，或切换到“快照覆盖（无主键）”。`
    );
  }

  return db.transaction('rw', db.series, db.rows, async () => {
    const existingSeries = await db.series.get(series);

    if (existingSeries) {
      if (!headersMatch(existingSeries.headers, headers)) {
        throw new Error(`系列 ${series} 的表头与已有数据不一致，已阻止导入。`);
      }

      const existingMode = existingSeries.keyMode ?? 'keyed';
      if (existingMode !== 'keyed') {
        throw new Error(`系列 ${series} 当前是“快照覆盖”模式，请保持同一模式导入。`);
      }

      const existingKeyColumns =
        existingSeries.keyColumns && existingSeries.keyColumns.length > 0
          ? existingSeries.keyColumns
          : existingSeries.keyColumn
            ? [existingSeries.keyColumn]
            : [];

      if (existingKeyColumns.join('|') !== keyColumns.join('|')) {
        throw new Error(
          `系列 ${series} 的键列为 [${existingKeyColumns.join(', ')}]，当前为 [${keyColumns.join(
            ', '
          )}]，请保持一致。`
        );
      }
    }

    const oldRows = await db.rows.where('series').equals(series).toArray();
    const oldMap = new Map(oldRows.map((record) => [record.rowKey, record.data]));

    let added = 0;
    let updated = 0;
    let unchanged = 0;
    let deleted = 0;

    const upsertPayload: RowRecord[] = [];

    incomingMap.forEach((rowData, rowKey) => {
      const oldData = oldMap.get(rowKey);

      if (!oldData) {
        added += 1;
      } else {
        const oldSerialized = serializeForCompare(oldData, headers);
        const newSerialized = serializeForCompare(rowData, headers);

        if (oldSerialized === newSerialized) {
          unchanged += 1;
        } else {
          updated += 1;
        }
      }

      upsertPayload.push({
        series,
        rowKey,
        data: rowData
      });
    });

    if (upsertPayload.length > 0) {
      await db.rows.bulkPut(upsertPayload);
    }
    reportProgress(onProgress, 70, '正在应用更新...');

    if (deleteMissing) {
      const keysToDelete = oldRows
        .map((record) => record.rowKey)
        .filter((rowKey) => !incomingMap.has(rowKey));

      if (keysToDelete.length > 0) {
        deleted = keysToDelete.length;
        await db.rows.bulkDelete(keysToDelete.map((rowKey) => [series, rowKey] as [string, string]));
      }
    }

    const totalAfter = await db.rows.where('series').equals(series).count();

    const nextMeta: SeriesMeta = {
      series,
      headers,
      keyColumn: keyColumns[0] ?? '',
      keyColumns,
      keyMode: 'keyed',
      rowCount: totalAfter,
      updatedAt: Date.now(),
      lastFileName: fileName,
      mergeByDate,
      dateColumn
    };

    await db.series.put(nextMeta);
    reportProgress(onProgress, 100, '导入完成');

    return {
      added,
      updated,
      unchanged,
      deleted,
      skippedMissingKey,
      duplicateKeyOverwritten: 0,
      totalIncoming: incomingMap.size,
      totalBefore: oldRows.length,
      totalAfter
    };
  });
}

export async function syncSeriesData(params: SyncParams): Promise<ImportStats> {
  const keyMode = params.keyMode ?? 'snapshot';
  const keyColumns = normalizeKeyColumns(params.keyColumns, params.keyColumn);

  if (keyMode === 'snapshot') {
    return syncBySnapshot({
      series: params.series,
      headers: params.headers,
      rows: params.rows,
      fileName: params.fileName,
      mergeByDate: params.mergeByDate,
      dateColumn: params.dateColumn,
      onProgress: params.onProgress
    });
  }

  if (keyColumns.length === 0) {
    throw new Error('键控更新模式至少需要 1 个键列。');
  }

  return syncByKeyed({
    series: params.series,
    headers: params.headers,
    rows: params.rows,
    keyColumns,
    fileName: params.fileName,
    deleteMissing: params.deleteMissing,
    mergeByDate: params.mergeByDate,
    dateColumn: params.dateColumn,
    onProgress: params.onProgress
  });
}

export async function clearAllData(): Promise<void> {
  await db.transaction('rw', db.series, db.rows, async () => {
    await db.rows.clear();
    await db.series.clear();
  });
}

export async function listSeriesMeta(): Promise<SeriesMeta[]> {
  return db.series.orderBy('updatedAt').reverse().toArray();
}

export async function getSeriesRows(series: string): Promise<RowData[]> {
  const rows = await db.rows.where('series').equals(series).sortBy('rowKey');
  return rows.map((item) => item.data);
}
