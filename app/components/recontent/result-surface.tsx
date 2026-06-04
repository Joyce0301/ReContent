import { ResultDocument } from "./result-document";
import { ResultPlatformTabs } from "./result-platform-tabs";
import {
  PLATFORM_LABELS,
  type PlatformKey,
  type RepurposeResult
} from "./types";

type ResultSurfaceProps = {
  activePlatform: PlatformKey | null;
  results: RepurposeResult[];
  onActivePlatformChange: (platform: PlatformKey) => void;
  onCopy: (text: string) => void;
};

export function ResultSurface({
  activePlatform,
  results,
  onActivePlatformChange,
  onCopy
}: ResultSurfaceProps) {
  const activeResult =
    results.find(result => result.platform === activePlatform) ?? results[0] ?? null;

  return (
    <section className="flex min-h-[420px] flex-col rounded-[28px] border border-slate-800/90 bg-slate-950/70 p-4 sm:p-5 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Output
          </p>
          <h2 className="mt-2 text-base font-semibold text-slate-50 sm:text-lg">
            编辑阅读面板
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {results.length > 0
              ? `当前聚焦 ${PLATFORM_LABELS[activeResult?.platform ?? results[0].platform]}，其余平台可随时切换查看。`
              : "生成完成后，右侧会优先展示一个可直接阅读与复制的版本。"}
          </p>
        </div>

        {results.length > 0 ? (
          <div className="flex flex-col items-start gap-2">
            <span className="text-[11px] text-slate-500">
              已生成 {results.length} 个平台版本
            </span>
            <ResultPlatformTabs
              results={results}
              activePlatform={activeResult?.platform ?? results[0].platform}
              onChange={onActivePlatformChange}
            />
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex flex-1">
        {activeResult ? (
          <div className="flex-1">
            <ResultDocument result={activeResult} onCopy={onCopy} />
          </div>
        ) : (
          <div className="flex flex-1 rounded-[24px] border border-slate-900 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.08),_transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.92)_0%,rgba(2,6,23,0.98)_100%)] px-6 py-8 sm:px-8 sm:py-10">
            <div className="flex w-full flex-col justify-between gap-10">
              <div className="max-w-md">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Ready Canvas
                </p>
                <h3 className="mt-3 text-xl font-semibold text-slate-100 sm:text-2xl">
                  你的改写结果会在这里展开成一页可读稿。
                </h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  左侧提交长内容后，这里会自动切换到一个主阅读视图，
                  同时保留多个平台版本的快速切换。
                </p>
              </div>

              <div className="grid gap-3 text-xs text-slate-500 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4">
                  平台适配后的标题与正文会被整理成更安静的排版。
                </div>
                <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4">
                  支持多平台生成，但只让一个版本成为当前视觉主角。
                </div>
                <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4">
                  复制动作保留在阅读面板里，随时可取用。
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
