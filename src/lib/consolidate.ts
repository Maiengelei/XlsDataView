import type { ConsolidationSummary, RowData } from '../types';

interface ConsolidationResult {
  rows: RowData[];
  summary: ConsolidationSummary;
}

function canMergeRows(base: RowData, incoming: RowData, headers: string[]): boolean {
  for (const header of headers) {
    const left = String(base[header] ?? '').trim();
    const right = String(incoming[header] ?? '').trim();

    if (left !== '' && right !== '' && left !== right) {
      return false;
    }
  }

  return true;
}

function mergeInto(base: RowData, incoming: RowData, headers: string[]): void {
  for (const header of headers) {
    const baseValue = String(base[header] ?? '').trim();
    const nextValue = String(incoming[header] ?? '').trim();

    if (baseValue === '' && nextValue !== '') {
      base[header] = nextValue;
    }
  }
}

function cloneRow(row: RowData): RowData {
  return { ...row };
}

export function consolidateRowsByDate(
  rows: RowData[],
  headers: string[],
  dateColumn: string
): ConsolidationResult {
  if (!dateColumn || !headers.includes(dateColumn)) {
    return {
      rows,
      summary: {
        beforeCount: rows.length,
        afterCount: rows.length,
        mergedCount: 0,
        groupCount: 0,
        multiRecordGroupCount: 0,
        emptyDateCount: rows.length
      }
    };
  }

  const dateGroups = new Map<string, RowData[]>();
  const dateOrder: string[] = [];
  const rowsWithoutDate: RowData[] = [];

  rows.forEach((row) => {
    const dateValue = String(row[dateColumn] ?? '').trim();

    if (!dateValue) {
      rowsWithoutDate.push(cloneRow(row));
      return;
    }

    if (!dateGroups.has(dateValue)) {
      dateGroups.set(dateValue, []);
      dateOrder.push(dateValue);
    }

    dateGroups.get(dateValue)?.push(cloneRow(row));
  });

  const output: RowData[] = [];
  let multiRecordGroupCount = 0;

  for (const dateValue of dateOrder) {
    const groupRows = dateGroups.get(dateValue) ?? [];
    const mergedRows: RowData[] = [];

    groupRows.forEach((row) => {
      const candidate = mergedRows.find((existing) => canMergeRows(existing, row, headers));

      if (candidate) {
        mergeInto(candidate, row, headers);
      } else {
        mergedRows.push(row);
      }
    });

    if (mergedRows.length > 1) {
      multiRecordGroupCount += 1;
    }

    output.push(...mergedRows);
  }

  output.push(...rowsWithoutDate);

  return {
    rows: output,
    summary: {
      beforeCount: rows.length,
      afterCount: output.length,
      mergedCount: rows.length - output.length,
      groupCount: dateOrder.length,
      multiRecordGroupCount,
      emptyDateCount: rowsWithoutDate.length
    }
  };
}
