import type { RowData } from '../types';

interface ExportSeriesParams {
  series: string;
  headers: string[];
  rows: RowData[];
}

function sanitizeFileName(name: string): string {
  const trimmed = name.trim() || 'series';
  return trimmed.replace(/[\\/:*?"<>|]/g, '_');
}

function sanitizeSheetName(name: string): string {
  const trimmed = name.trim() || 'Sheet1';
  const safe = trimmed.replace(/[:\\/?*\[\]]/g, '_');
  return safe.slice(0, 31) || 'Sheet1';
}

export async function exportSeriesToXlsx(params: ExportSeriesParams): Promise<void> {
  const { series, headers, rows } = params;
  const XLSX = await import('xlsx');

  const sheetRows: string[][] = [
    headers,
    ...rows.map((row) => headers.map((header) => String(row[header] ?? '')))
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(series));
  XLSX.writeFile(workbook, `${sanitizeFileName(series)}.xlsx`, { compression: true });
}
