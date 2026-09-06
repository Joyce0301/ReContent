import { useId } from "react";

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
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label="输入模式"
      className="rc-segmented"
    >
      {options.map(option => {
        const active = option.value === value;

        return (
          <label key={option.value}>
            <input
              className="rc-mode-input"
              type="radio"
              name={name}
              value={option.value}
              checked={active}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}
