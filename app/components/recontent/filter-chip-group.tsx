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
    <div className="flex flex-wrap gap-2">
      {options.map(option => {
        const active = selectedKeys.includes(option.key);

        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onToggle(option.key)}
            aria-pressed={active}
            className={`inline-flex min-h-10 items-center gap-2 rounded-[18px] border-2 px-3 py-2 text-xs font-bold uppercase tracking-[0.06em] shadow-[4px_4px_0_rgba(23,18,15,0.84)] ${
              active
                ? "border-[var(--line)] bg-[var(--accent)] text-[var(--ink)]"
                : "border-[var(--line)] bg-[rgba(255,248,227,0.78)] text-[var(--ink-soft)] hover:-translate-x-[2px] hover:-translate-y-[2px]"
            }`}
          >
            {option.leading && (
              <span
                aria-hidden="true"
                className="inline-flex min-w-4 items-center justify-center text-[11px]"
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
