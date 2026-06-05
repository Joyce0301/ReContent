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
            className={`inline-flex min-h-9 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
              active
                ? "border-sky-200 bg-sky-50 text-sky-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                : "border-slate-200 bg-white/75 text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            {option.leading && (
              <span className="inline-flex min-w-4 items-center justify-center text-[11px]">
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
