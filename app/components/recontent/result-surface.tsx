import { ResultDocument } from "./result-document";
import { ResultPlatformTabs } from "./result-platform-tabs";
import {
  PLATFORM_LABELS,
  type PlatformKey,
  type RepurposeResult,
  type XiaohongshuDraftBridgeResult
} from "./types";

type ResultSurfaceProps = {
  activePlatform: PlatformKey | null;
  copyStatus?: "success" | "error" | null;
  draftStatus?: XiaohongshuDraftBridgeResult | null;
  results: RepurposeResult[];
  onActivePlatformChange: (platform: PlatformKey) => void;
  onCopy: (platform: PlatformKey, text: string) => void;
  onSendToDraft: (result: RepurposeResult) => void;
};

export function ResultSurface({
  activePlatform,
  copyStatus,
  draftStatus,
  results,
  onActivePlatformChange,
  onCopy,
  onSendToDraft
}: ResultSurfaceProps) {
  const activeResult =
    results.find(result => result.platform === activePlatform) ?? results[0] ?? null;

  return (
    <section className="flex min-h-[420px] flex-col rounded-[30px] border border-slate-200/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.82)_0%,rgba(237,242,247,0.94)_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_24px_64px_rgba(148,163,184,0.14)] sm:p-5 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/90 pb-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Canvas
          </p>
          <h2 className="mt-2 text-base font-semibold tracking-tight text-slate-950 sm:text-lg">
            阅读视图
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-6 text-slate-500">
            {results.length > 0
              ? `当前展开 ${PLATFORM_LABELS[activeResult?.platform ?? results[0].platform]} 版本，其余平台可随时切换查看。`
              : "生成完成后，这里会优先展开一份更适合阅读、检查与复制的成稿。"}
          </p>
        </div>

        {results.length > 0 ? (
          <div className="flex flex-col items-start gap-2 sm:items-end">
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
            <ResultDocument
              copyStatus={copyStatus}
              draftStatus={draftStatus}
              result={activeResult}
              onCopy={onCopy}
              onSendToDraft={onSendToDraft}
            />
          </div>
        ) : (
          <div className="flex flex-1 rounded-[28px] border border-slate-200/90 bg-[radial-gradient(circle_at_top,rgba(191,219,254,0.42),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.92)_0%,rgba(239,244,248,0.98)_100%)] px-6 py-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] sm:px-8 sm:py-10">
            <div className="flex w-full flex-col justify-between gap-12">
              <div className="max-w-lg">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Ready
                </p>
                <h3 className="mt-4 max-w-[14ch] text-[28px] font-semibold leading-tight tracking-tight text-slate-950 sm:text-[34px]">
                  成稿会在这里安静地展开。
                </h3>
                <p className="mt-4 max-w-md text-sm leading-7 text-slate-500">
                  提交原始内容后，右侧会切换到主阅读视图，先把一份成稿放到眼前，再保留其他平台版本的快速切换。
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="border-t border-slate-200/90 pt-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Layout
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    标题与正文会被整理成更平静的阅读排版。
                  </p>
                </div>
                <div className="border-t border-slate-200/90 pt-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Focus
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    多平台同时生成，但只保留一个当前视觉主角。
                  </p>
                </div>
                <div className="border-t border-slate-200/90 pt-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Ready
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    阅读和复制动作会留在同一处，不打断检查流程。
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
