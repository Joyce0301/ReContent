import type { WorkspaceDraftRecord } from "../../lib/drafts/types";

type DraftShelfProps = {
  drafts: WorkspaceDraftRecord[];
  currentDraftId: string | null;
  isLoading: boolean;
  onLoadDraft: (draft: WorkspaceDraftRecord) => void;
};

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function DraftShelf({
  drafts,
  currentDraftId,
  isLoading,
  onLoadDraft
}: DraftShelfProps) {
  return (
    <section className="poster-frame rounded-[24px] bg-[rgba(255,248,227,0.9)] p-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-[var(--line)] pb-3">
        <div>
          <p className="poster-kicker text-[var(--accent-deep)]">Draft shelf</p>
          <h2 className="poster-display mt-2 text-[2rem] text-[var(--ink)]">
            最近草稿
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">
            保存当前输入与成稿状态，稍后回来继续编辑。
          </p>
        </div>
        <span className="text-[11px] text-[var(--ink-soft)]">
          {isLoading ? "正在同步…" : `共 ${drafts.length} 条`}
        </span>
      </div>

      {drafts.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {drafts.map(draft => {
            const isActive = draft.id === currentDraftId;

            return (
              <button
                key={draft.id}
                type="button"
                onClick={() => onLoadDraft(draft)}
                className={`text-left rounded-[20px] border-2 px-4 py-3 shadow-[4px_4px_0_rgba(23,18,15,0.82)] transition-transform ${
                  isActive
                    ? "border-[var(--accent-deep)] bg-[rgba(215,154,24,0.2)]"
                    : "border-[var(--line)] bg-[rgba(255,249,235,0.92)]"
                }`}
              >
                <p className="line-clamp-2 text-sm font-semibold text-[var(--ink)]">
                  {draft.name}
                </p>
                <p className="mt-2 text-[11px] leading-5 text-[var(--ink-soft)]">
                  {draft.inputMode === "url" ? "URL 草稿" : "文本草稿"} ·{" "}
                  {formatUpdatedAt(draft.updatedAt)}
                </p>
                <p className="mt-2 text-[11px] leading-5 text-[var(--ink-soft)]">
                  平台：{draft.selectedPlatform} · 语气：{draft.tone}
                </p>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-[20px] border-2 border-dashed border-[var(--line)] px-4 py-5 text-sm leading-7 text-[var(--ink-soft)]">
          还没有保存过草稿。先在左侧输入内容，再点“保存草稿”。
        </div>
      )}
    </section>
  );
}
