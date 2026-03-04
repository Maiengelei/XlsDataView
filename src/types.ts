export type RowData = Record<string, string>;

export interface SeriesMeta {
  series: string;
  headers: string[];
  keyColumn: string;
  keyColumns?: string[];
  keyMode?: 'keyed' | 'snapshot';
  rowCount: number;
  updatedAt: number;
  lastFileName: string;
  mergeByDate?: boolean;
  dateColumn?: string;
}

export interface RowRecord {
  series: string;
  rowKey: string;
  data: RowData;
}

export interface ParsedSheet {
  headers: string[];
  rows: RowData[];
  sheetName: string;
}

export interface ImportStats {
  added: number;
  updated: number;
  unchanged: number;
  deleted: number;
  skippedMissingKey: number;
  duplicateKeyOverwritten: number;
  totalIncoming: number;
  totalBefore: number;
  totalAfter: number;
}

export interface ConsolidationSummary {
  beforeCount: number;
  afterCount: number;
  mergedCount: number;
  groupCount: number;
  multiRecordGroupCount: number;
  emptyDateCount: number;
}

export type FilterOperator = 'contains' | 'equals' | 'startsWith' | 'gt' | 'lt';

export interface FilterCondition {
  id: string;
  column: string;
  operator: FilterOperator;
  value: string;
}
