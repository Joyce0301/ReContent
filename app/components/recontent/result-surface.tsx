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
    <section className="poster-frame flex min-h-[420px] flex-col rounded-[30px] bg-[rgba(255,247,226,0.92)] p-4 sm:p-5 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[var(--line)] pb-4">
        <div>
          <p className="poster-kicker text-[var(--accent-deep)]">
            Canvas
          </p>
          <h2 className="poster-display mt-2 text-[2.4rem] text-[var(--ink)] sm:text-[2.8rem]">
            阅读视图
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-6 text-[var(--ink-soft)]">
            {results.length > 0
              ? `当前展示 ${PLATFORM_LABELS[activeResult?.platform ?? results[0].platform]} 版本，可直接阅读、检查并复制。`
              : "生成完成后，这里会展开当前所选平台的一份成稿。"}
          </p>
        </div>

        {results.length > 0 ? (
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span className="text-[11px] text-[var(--ink-soft)]">
              {results.length === 1
                ? "已生成当前平台版本"
                : `已生成 ${results.length} 个平台版本`}
            </span>
            {results.length > 1 ? (
              <ResultPlatformTabs
                results={results}
                activePlatform={activeResult?.platform ?? results[0].platform}
                onChange={onActivePlatformChange}
              />
            ) : null}
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
          <div className="flex flex-1 rounded-[28px] border-2 border-[var(--line)] bg-[rgba(255,248,227,0.84)] px-6 py-8 shadow-[4px_4px_0_rgba(23,18,15,0.82)] sm:px-8 sm:py-10">
            <div className="flex w-full flex-col justify-between gap-12">
              <div className="max-w-lg">
                <p className="poster-kicker text-[var(--accent-deep)]">
                  Ready
                </p>
                <h3 className="poster-display mt-4 max-w-[11ch] text-[3rem] text-[var(--ink)] sm:text-[3.5rem]">
                  成稿会在这里安静地展开。
                </h3>
                <p className="mt-4 max-w-md text-sm leading-7 text-[var(--ink-soft)]">
                  提交原始内容后，右侧会切换到主阅读视图，直接展示当前平台的一份成稿，方便你逐条检查与复制。
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="border-t border-slate-200/90 pt-4">
                  <p className="poster-kicker text-[var(--accent-deep)]">
                    Layout
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                    标题与正文会被整理成更平静的阅读排版。
                  </p>
                </div>
                <div className="border-t border-slate-200/90 pt-4">
                  <p className="poster-kicker text-[var(--accent-deep)]">
                    Focus
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                    每次聚焦一个平台，减少解析波动，也更方便逐条检查质量。
                  </p>
                </div>
                <div className="border-t border-slate-200/90 pt-4">
                  <p className="poster-kicker text-[var(--accent-deep)]">
                    Ready
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
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
