type FilterChipOption<T extends string> = {
  key: T;
  label: string;
  leading?: string;
};

type FilterChipGroupProps<T extends string> = {
  options: FilterChipOption<T>[];
  selectedKeys: T[];
  onToggle: (key: T) => void;
};

export function FilterChipGroup<T extends string>({
  options,
  selectedKeys,
  onToggle
}: FilterChipGroupProps<T>) {
  return (
    <div className="rc-options">
      {options.map(option => {
        const active = selectedKeys.includes(option.key);

        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onToggle(option.key)}
            aria-pressed={active}
            className="rc-option"
          >
            {option.leading && (
              <span
                aria-hidden="true"
                className="option-badge"
              >
                {option.leading}
              </span>
            )}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
