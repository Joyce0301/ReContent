import {
  PLATFORM_BADGES,
  PLATFORM_SHORT_LABELS,
  type PlatformKey,
  type RepurposeResult
} from "./types";

type ResultPlatformTabsProps = {
  results: RepurposeResult[];
  activePlatform: PlatformKey;
  onChange: (platform: PlatformKey) => void;
};

export function ResultPlatformTabs({
  results,
  activePlatform,
  onChange
}: ResultPlatformTabsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {results.map(result => {
        const isActive = result.platform === activePlatform;

        return (
          <button
            key={result.platform}
            type="button"
            onClick={() => onChange(result.platform)}
            aria-pressed={isActive}
            className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
              isActive
                ? "border-sky-200 bg-sky-50 text-sky-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]"
                : "border-slate-200 bg-white/80 text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] ${
                isActive
                  ? "bg-sky-100 text-sky-700"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {PLATFORM_BADGES[result.platform]}
            </span>
            <span className="font-medium tracking-[0.01em]">
              {PLATFORM_SHORT_LABELS[result.platform]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
