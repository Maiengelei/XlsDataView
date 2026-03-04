import { useEffect, useMemo, useRef, useState } from 'react';

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
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [inputText, setInputText] = useState('');
  const suppressBlurRef = useRef(false);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );

  const normalized = inputText.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!editing) {
      return options;
    }

    if (!normalized) {
      return options;
    }

    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(normalized) || option.value.toLowerCase().includes(normalized)
    );
  }, [editing, normalized, options]);

  useEffect(() => {
    if (!editing) {
      setInputText(selectedOption?.label ?? value);
    }
  }, [editing, selectedOption, value]);

  const chooseOption = (optionValue: string, optionLabel: string): void => {
    setEditing(false);
    setOpen(false);
    setInputText(optionLabel);
    onChange(optionValue);
  };

  return (
    <div className="searchable-select">
      <input
        type="text"
        value={editing ? inputText : selectedOption?.label ?? value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        onFocus={() => {
          setEditing(false);
          setOpen(true);
          setInputText(selectedOption?.label ?? value);
        }}
        onClick={() => {
          setEditing(false);
          setOpen(true);
        }}
        onChange={(event) => {
          const next = event.target.value;
          setInputText(next);
          setEditing(true);
          setOpen(true);

          if (allowCustom) {
            onChange(next);
            return;
          }

          const exact = options.find((option) => option.label === next || option.value === next);
          if (exact) {
            onChange(exact.value);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            setEditing(false);
            setInputText(selectedOption?.label ?? value);
            return;
          }

          if (event.key === 'Enter' && open) {
            event.preventDefault();
            const first = filteredOptions[0];
            if (!first) {
              return;
            }

            onChange(first.value);
            setInputText(first.label);
            setEditing(false);
            setOpen(false);
          }
        }}
        onBlur={() => {
          setTimeout(() => setOpen(false), 120);

          if (suppressBlurRef.current) {
            suppressBlurRef.current = false;
            setEditing(false);
            return;
          }

          if (allowCustom) {
            return;
          }

          if (!editing) {
            setInputText(selectedOption?.label ?? value);
            return;
          }

          const trimmed = inputText.trim();
          if (!trimmed) {
            onChange('');
            setEditing(false);
            setInputText('');
            return;
          }

          const exact = options.find((option) => option.label === trimmed || option.value === trimmed);
          if (exact) {
            onChange(exact.value);
            setEditing(false);
            setInputText(exact.label);
            return;
          }

          if (!value.trim()) {
            onChange('');
            setInputText('');
            setEditing(false);
            return;
          }

          setInputText(selectedOption?.label ?? value);
          setEditing(false);
        }}
      />

      {open && !disabled && (
        <div className="searchable-select-menu">
          {filteredOptions.length === 0 ? (
            <div className="searchable-select-empty">无匹配项</div>
          ) : (
            filteredOptions.slice(0, 300).map((option) => (
              <button
                type="button"
                key={option.value}
                className={`searchable-select-item ${option.value === value ? 'active' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  suppressBlurRef.current = true;
                  chooseOption(option.value, option.label);
                }}
                onClick={(event) => event.preventDefault()}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
