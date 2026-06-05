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
      className="inline-flex rounded-full border border-slate-200 bg-white/70 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]"
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
            className={`min-w-[92px] rounded-full px-3 py-2 text-xs font-medium transition ${
              active
                ? "bg-white text-slate-900 shadow-[0_4px_14px_rgba(148,163,184,0.18)]"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
