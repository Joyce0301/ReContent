type SegmentedControlOption<T extends string> = {
  value: T;
  label: string;
};

type SegmentedControlProps<T extends string> = {
  value: T;
  options: SegmentedControlOption<T>[];
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label="输入模式"
      className="poster-pill inline-flex rounded-[20px] p-1"
    >
      {options.map(option => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`min-w-[104px] rounded-[16px] px-3 py-2 text-xs font-bold uppercase tracking-[0.06em] ${
              active
                ? "bg-[var(--ink)] text-[#fff2d0]"
                : "text-[var(--ink-soft)]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
