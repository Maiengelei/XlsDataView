import type { ParsedSheet, RowData } from '../types';

type WorkerRequest = {
  type: 'parse';
  fileName: string;
  buffer: ArrayBuffer;
};

type WorkerProgress = {
  type: 'progress';
  progress: number;
  message: string;
};

type WorkerDone = {
  type: 'done';
  result: ParsedSheet;
};

type WorkerError = {
  type: 'error';
  message: string;
};

function postProgress(progress: number, message: string): void {
  const payload: WorkerProgress = {
    type: 'progress',
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    message
  };
  self.postMessage(payload);
}

function makeUniqueHeaders(headers: string[]): string[] {
  const counter = new Map<string, number>();

  return headers.map((header, index) => {
    const normalized = (header || `column_${index + 1}`).trim() || `column_${index + 1}`;
    const nextCount = (counter.get(normalized) ?? 0) + 1;
    counter.set(normalized, nextCount);
    return nextCount > 1 ? `${normalized}_${nextCount}` : normalized;
  });
}

function isRowEmpty(row: unknown[]): boolean {
  return row.every((cell) => String(cell ?? '').trim() === '');
}

function isCsvFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.csv');
}

function decodeWith(encoding: string, bytes: Uint8Array): string | null {
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    return null;
  }
}

function countReplacementChars(text: string): number {
  return (text.match(/�/g) ?? []).length;
}

function countCjkChars(text: string): number {
  return (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
}

function decodeCsvText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  const utf8 = decodeWith('utf-8', bytes) ?? '';
  const gb18030 = decodeWith('gb18030', bytes) ?? utf8;

  const utf8Broken = countReplacementChars(utf8);
  const gbBroken = countReplacementChars(gb18030);

  if (utf8Broken !== gbBroken) {
    return utf8Broken < gbBroken ? utf8 : gb18030;
  }

  const utf8Cjk = countCjkChars(utf8);
  const gbCjk = countCjkChars(gb18030);
  return gbCjk > utf8Cjk ? gb18030 : utf8;
}

async function parseFile(fileName: string, buffer: ArrayBuffer): Promise<ParsedSheet> {
  postProgress(5, '正在加载解析器...');
  const XLSX = await import('xlsx');

  postProgress(15, '正在读取工作表...');
  const workbook = isCsvFile(fileName)
    ? XLSX.read(decodeCsvText(buffer), { type: 'string', raw: false })
    : XLSX.read(buffer, { type: 'array' });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('文件中没有找到任何工作表。');
  }

  const worksheet = workbook.Sheets[sheetName];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: false,
    defval: ''
  });

  postProgress(40, '正在解析表头...');
  const headerRowIndex = grid.findIndex((row) => Array.isArray(row) && !isRowEmpty(row));
  if (headerRowIndex < 0) {
    throw new Error('文件中没有有效的表头。');
  }

  const headerRow = grid[headerRowIndex] ?? [];
  const headers = makeUniqueHeaders(headerRow.map((value) => String(value ?? '').trim()));

  const rows: RowData[] = [];
  let lastProgress = 40;
  const dataStart = headerRowIndex + 1;
  const totalDataRows = Math.max(grid.length - dataStart, 1);

  for (let i = dataStart; i < grid.length; i += 1) {
    const row = grid[i];
    if (!Array.isArray(row) || isRowEmpty(row)) {
      continue;
    }

    const record: RowData = {};
    headers.forEach((header, columnIndex) => {
      record[header] = String(row[columnIndex] ?? '').trim();
    });
    rows.push(record);

    const progress = 40 + ((i - dataStart + 1) / totalDataRows) * 55;
    if (progress - lastProgress >= 2 || i === grid.length - 1) {
      lastProgress = progress;
      postProgress(progress, '正在解析数据行...');
    }
  }

  postProgress(100, '解析完成');
  return {
    headers,
    rows,
    sheetName
  };
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const payload = event.data;
  if (!payload || payload.type !== 'parse') {
    return;
  }

  void parseFile(payload.fileName, payload.buffer)
    .then((result) => {
      const done: WorkerDone = { type: 'done', result };
      self.postMessage(done);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : '文件解析失败';
      const payloadError: WorkerError = { type: 'error', message };
      self.postMessage(payloadError);
    });
};
