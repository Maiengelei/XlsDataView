import { useMemo, useState } from 'react';
import type { SelectOption } from './SearchableSelect';

interface SearchableMultiSelectProps {
  options: SelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

function normalize(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim() !== '')));
}

export default function SearchableMultiSelect({
  options,
  values,
  onChange,
  placeholder,
  disabled
}: SearchableMultiSelectProps): JSX.Element {
  const [keyword, setKeyword] = useState('');

  const filtered = useMemo(() => {
    const lower = keyword.trim().toLowerCase();
    if (!lower) {
      return options;
    }

    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(lower) || option.value.toLowerCase().includes(lower)
    );
  }, [options, keyword]);

  const toggle = (value: string): void => {
    const has = values.includes(value);

    if (has) {
      onChange(values.filter((item) => item !== value));
      return;
    }

    onChange(normalize([...values, value]));
  };

  return (
    <div className={`multi-select ${disabled ? 'disabled' : ''}`}>
      <input
        type="text"
        value={keyword}
        placeholder={placeholder ?? '搜索...'}
        disabled={disabled}
        onChange={(event) => setKeyword(event.target.value)}
      />

      <div className="multi-select-actions muted">
        <button
          type="button"
          className="button secondary"
          disabled={disabled || filtered.length === 0}
          onClick={() => onChange(normalize([...values, ...filtered.map((item) => item.value)]))}
        >
          选中筛选结果
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={disabled || values.length === 0}
          onClick={() => onChange([])}
        >
          清空
        </button>
      </div>

      <div className="multi-select-list">
        {filtered.length === 0 ? (
          <p className="muted">无匹配项</p>
        ) : (
          filtered.map((option) => (
            <label key={option.value} className="multi-select-item">
              <input
                type="checkbox"
                checked={values.includes(option.value)}
                disabled={disabled}
                onChange={() => toggle(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
