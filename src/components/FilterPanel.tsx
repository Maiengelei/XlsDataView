import type { FilterCondition, FilterOperator } from '../types';
import SearchableSelect, { type SelectOption } from './SearchableSelect';

interface FilterPanelProps {
  headers: string[];
  filters: FilterCondition[];
  onChange: (filters: FilterCondition[]) => void;
}

const OPERATORS: SelectOption[] = [
  { label: '包含', value: 'contains' },
  { label: '等于', value: 'equals' },
  { label: '前缀匹配', value: 'startsWith' },
  { label: '大于', value: 'gt' },
  { label: '小于', value: 'lt' }
];

export default function FilterPanel({ headers, filters, onChange }: FilterPanelProps): JSX.Element {
  const updateOne = (id: string, patch: Partial<FilterCondition>): void => {
    onChange(filters.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const headerOptions: SelectOption[] = headers.map((header) => ({ label: header, value: header }));

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
                column: headers[0] ?? '',
                operator: 'contains',
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

              <input
                type="text"
                value={filter.value}
                placeholder="筛选值"
                onChange={(event) => updateOne(filter.id, { value: event.target.value })}
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
