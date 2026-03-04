import { useId } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowCustom?: boolean;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  allowCustom = false
}: SearchableSelectProps): JSX.Element {
  const listId = useId();

  return (
    <>
      <input
        type="text"
        list={listId}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          if (allowCustom) {
            return;
          }

          const hasValue = options.some((option) => option.value === value);
          if (!hasValue) {
            onChange(options[0]?.value ?? '');
          }
        }}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.value} value={option.value} label={option.label} />
        ))}
      </datalist>
    </>
  );
}
