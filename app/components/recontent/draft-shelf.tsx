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
    <section className="draft-shelf" id="drafts">
      <header>
        <div>
          <h2>
            最近草稿
          </h2>
        </div>
        <span className="text-[11px] text-[var(--ink-soft)]">
          {isLoading ? "正在同步…" : `共 ${drafts.length} 条`}
        </span>
      </header>

      {drafts.length > 0 ? (
        <div className="draft-items">
          {drafts.map(draft => {
            const isActive = draft.id === currentDraftId;

            return (
              <button
                key={draft.id}
                type="button"
                onClick={() => onLoadDraft(draft)}
                className="draft-item"
                aria-pressed={isActive}
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
        <div className="draft-empty">
          {isLoading ? "正在加载草稿…" : "还没有保存过草稿。"}
        </div>
      )}
    </section>
  );
}
