import { ALL_FIELDS_FILTER_COLUMN, type FilterCondition, type RowData } from '../types';

function asNumber(value: string): number | null {
  const text = value.trim();
  if (!text) {
    return null;
  }

  const parsed = Number(text);
  return Number.isNaN(parsed) ? null : parsed;
}

function asDateTime(value: string): number | null {
  const text = value.trim();
  if (!text) {
    return null;
  }

  const normalized = text.replace(/[.]/g, '/').replace(/-/g, '/');
  const parts = normalized.split('/').map((item) => item.trim());

  if (parts.length !== 3 || parts.some((item) => item === '')) {
    return null;
  }

  const [a, b, c] = parts;
  const n1 = Number(a);
  const n2 = Number(b);
  const n3 = Number(c);

  if ([n1, n2, n3].some((item) => Number.isNaN(item))) {
    return null;
  }

  let year = n1;
  let month = n2;
  let day = n3;

  if (a.length !== 4) {
    year = c.length === 2 ? 2000 + n3 : n3;
    month = n1;
    day = n2;
  }

  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date.getTime();
}

function compareLeftRight(left: string, right: string): number {
  const leftNumber = asNumber(left);
  const rightNumber = asNumber(right);
  if (leftNumber !== null && rightNumber !== null) {
    return leftNumber - rightNumber;
  }

  const leftDate = asDateTime(left);
  const rightDate = asDateTime(right);
  if (leftDate !== null && rightDate !== null) {
    return leftDate - rightDate;
  }

  return left.localeCompare(right, 'zh-CN', { numeric: true, sensitivity: 'base' });
}

function passByValue(left: string, operator: FilterCondition['operator'], right: string): boolean {
  switch (operator) {
    case 'contains':
      return left.toLowerCase().includes(right.toLowerCase());
    case 'notContains':
      return !left.toLowerCase().includes(right.toLowerCase());
    case 'equals':
      return left === right;
    case 'notEquals':
      return left !== right;
    case 'startsWith':
      return left.toLowerCase().startsWith(right.toLowerCase());
    case 'gt':
      return compareLeftRight(left, right) > 0;
    case 'gte':
      return compareLeftRight(left, right) >= 0;
    case 'lt':
      return compareLeftRight(left, right) < 0;
    case 'lte':
      return compareLeftRight(left, right) <= 0;
    default:
      return true;
  }
}

function passCondition(row: RowData, condition: FilterCondition): boolean {
  const right = condition.value.trim();

  if (condition.column === ALL_FIELDS_FILTER_COLUMN) {
    const values = Object.values(row).map((value) => String(value ?? '').trim());

    if (condition.operator === 'notContains' || condition.operator === 'notEquals') {
      return values.every((value) => passByValue(value, condition.operator, right));
    }

    return values.some((value) => passByValue(value, condition.operator, right));
  }

  const left = String(row[condition.column] ?? '').trim();
  return passByValue(left, condition.operator, right);
}

export function applyFilters(rows: RowData[], filters: FilterCondition[]): RowData[] {
  const activeFilters = filters.filter(
    (filter) => filter.column.trim() !== '' && filter.value.trim() !== ''
  );

  if (activeFilters.length === 0) {
    return rows;
  }

  return rows.filter((row) => activeFilters.every((filter) => passCondition(row, filter)));
}
