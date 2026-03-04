import {
  ALL_FIELDS_FILTER_COLUMN,
  type FilterCondition,
  type FilterOperator,
  type RowData
} from '../types';
import SearchableSelect, { type SelectOption } from './SearchableSelect';

interface FilterPanelProps {
  headers: string[];
  rows: RowData[];
  filters: FilterCondition[];
  onChange: (filters: FilterCondition[]) => void;
}

const OPERATORS: SelectOption[] = [
  { label: '包含', value: 'contains' },
  { label: '不包含', value: 'notContains' },
  { label: '等于', value: 'equals' },
  { label: '不等于', value: 'notEquals' },
  { label: '前缀匹配', value: 'startsWith' },
  { label: '大于', value: 'gt' },
  { label: '大于等于', value: 'gte' },
  { label: '小于', value: 'lt' },
  { label: '小于等于', value: 'lte' }
];

function uniqueColumnValues(rows: RowData[], column: string, limit = 300): string[] {
  if (!column) {
    return [];
  }

  const values = Array.from(
    new Set(
      rows
        .map((row) => String(row[column] ?? '').trim())
        .filter((value) => value !== '')
    )
  ).sort((left, right) => left.localeCompare(right, 'zh-CN'));

  return values.slice(0, limit);
}

export default function FilterPanel({ headers, rows, filters, onChange }: FilterPanelProps): JSX.Element {
  const updateOne = (id: string, patch: Partial<FilterCondition>): void => {
    onChange(filters.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const headerOptions: SelectOption[] = [
    { label: '全部字段', value: ALL_FIELDS_FILTER_COLUMN },
    ...headers.map((header) => ({ label: header, value: header }))
  ];

  return (
    <section className="card">
      <div className="card-head">
        <h3>筛选器</h3>
        <button
          type="button"
          className="button secondary"
          onClick={() =>
            onChange([
              ...filters,
              {
                id: crypto.randomUUID(),
                column: '',
                operator: 'equals',
                value: ''
              }
            ])
          }
          disabled={headers.length === 0}
        >
          添加筛选
        </button>
      </div>

      {filters.length === 0 ? (
        <p className="muted">暂无筛选器，点击“添加筛选”开始。</p>
      ) : (
        <div className="filters">
          {filters.map((filter) => (
            <div key={filter.id} className="filter-row">
              <SearchableSelect
                options={headerOptions}
                value={filter.column}
                onChange={(next) => updateOne(filter.id, { column: next })}
              />

              <SearchableSelect
                options={OPERATORS}
                value={filter.operator}
                onChange={(next) => updateOne(filter.id, { operator: next as FilterOperator })}
              />

              <SearchableSelect
                options={
                  filter.column === ALL_FIELDS_FILTER_COLUMN
                    ? []
                    : uniqueColumnValues(rows, filter.column).map((value) => ({ value, label: value }))
                }
                value={filter.value}
                placeholder="搜索或输入筛选值"
                allowCustom
                onChange={(next) => updateOne(filter.id, { value: next })}
              />

              <button
                type="button"
                className="button danger"
                onClick={() => onChange(filters.filter((item) => item.id !== filter.id))}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
