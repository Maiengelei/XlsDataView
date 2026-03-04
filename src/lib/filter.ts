import type { FilterCondition, RowData } from '../types';

function asNumber(value: string): number | null {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function passCondition(row: RowData, condition: FilterCondition): boolean {
  const left = String(row[condition.column] ?? '');
  const right = condition.value;

  switch (condition.operator) {
    case 'contains':
      return left.toLowerCase().includes(right.toLowerCase());
    case 'equals':
      return left === right;
    case 'startsWith':
      return left.toLowerCase().startsWith(right.toLowerCase());
    case 'gt': {
      const leftNumber = asNumber(left);
      const rightNumber = asNumber(right);
      if (leftNumber !== null && rightNumber !== null) {
        return leftNumber > rightNumber;
      }
      return left > right;
    }
    case 'lt': {
      const leftNumber = asNumber(left);
      const rightNumber = asNumber(right);
      if (leftNumber !== null && rightNumber !== null) {
        return leftNumber < rightNumber;
      }
      return left < right;
    }
    default:
      return true;
  }
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
