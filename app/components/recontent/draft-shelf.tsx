import { ChevronDown, MessageSquare, RotateCcw } from "lucide-react";
import type { WorkspaceDraftRecord } from "../../lib/drafts/types";

type DraftShelfProps = {
  drafts: WorkspaceDraftRecord[];
  currentDraftId: string | null;
  isLoading: boolean;
  disabled: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onLoadDraft: (draft: WorkspaceDraftRecord) => void;
};

export function DraftShelf({ drafts, currentDraftId, isLoading, disabled, error, hasMore, onLoadMore, onLoadDraft }: DraftShelfProps) {
  return (
    <nav className="chat-history" aria-label="个人创作历史" aria-busy={isLoading}>
      <h2>最近创作</h2>
      {drafts.map(draft => (
        <button
          key={draft.id}
          type="button"
          className="chat-history-item"
          aria-label={draft.name}
          aria-current={draft.id === currentDraftId ? "page" : undefined}
          title={draft.name + " · " + new Date(draft.updatedAt).toLocaleDateString("zh-CN")}
          disabled={disabled}
          onClick={() => onLoadDraft(draft)}
        >
          <MessageSquare size={16} aria-hidden="true" />
          <span>{draft.name}</span>
          {draft.results.length === 0 && <small>草稿</small>}
        </button>
      ))}
      {isLoading && <p role="status">正在加载历史…</p>}
      {!isLoading && !error && drafts.length === 0 && <p>还没有创作记录</p>}
      {error && <p role="alert">{error}</p>}
      {(hasMore || error) && (
        <button type="button" className="chat-history-more" onClick={onLoadMore} disabled={disabled || isLoading}>
          {error ? <RotateCcw size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
          {error ? "重试加载" : "加载更多"}
        </button>
      )}
    </nav>
  );
}
