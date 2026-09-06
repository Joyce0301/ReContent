import { FileText, LoaderCircle } from "lucide-react";
import { ResultDocument } from "./result-document";
import { ResultPlatformTabs } from "./result-platform-tabs";
import {
  type PlatformKey,
  type RepurposeResult,
  type XiaohongshuDraftBridgeResult
} from "./types";

type ResultSurfaceProps = {
  activePlatform: PlatformKey | null;
  isPending?: boolean;
  copyStatus?: "success" | "error" | null;
  draftStatus?: XiaohongshuDraftBridgeResult | null;
  results: RepurposeResult[];
  onActivePlatformChange: (platform: PlatformKey) => void;
  onCopy: (platform: PlatformKey, text: string) => void;
  onSendToDraft: (result: RepurposeResult) => void;
};

export function ResultSurface({
  activePlatform,
  isPending = false,
  copyStatus,
  draftStatus,
  results,
  onActivePlatformChange,
  onCopy,
  onSendToDraft
}: ResultSurfaceProps) {
  const activeResult =
    results.find((result) => result.platform === activePlatform) ??
    results[0] ??
    null;

  return (
    <section
      className="result-panel"
      aria-labelledby="result-heading"
      aria-busy={isPending}
    >
      <div className="panel-heading">
        <h2 id="result-heading">
          <span className="step-number">02</span>阅读视图
        </h2>
        <span
          className={isPending ? "result-label pending" : "result-label"}
          role="status"
        >
          {isPending ? "正在创作" : activeResult ? "成稿已就绪" : "等待灵感"}
        </span>
      </div>
      {results.length > 1 && activeResult ? (
        <div className="mt-4">
          <ResultPlatformTabs
            results={results}
            activePlatform={activeResult.platform}
            onChange={onActivePlatformChange}
          />
        </div>
      ) : null}
      <div className="result-body">
        {activeResult && !isPending ? (
          <ResultDocument
            copyStatus={copyStatus}
            draftStatus={draftStatus}
            result={activeResult}
            onCopy={onCopy}
            onSendToDraft={onSendToDraft}
          />
        ) : (
          <div className="result-empty">
            <div className="empty-symbol" aria-hidden="true">
              {isPending ? (
                <LoaderCircle
                  size={32}
                  strokeWidth={1.2}
                  className="animate-spin"
                />
              ) : (
                <FileText size={36} strokeWidth={1.2} />
              )}
            </div>
            <h3>
              {isPending ? "正在酝酿新的表达…" : "下一篇好内容，从这里开始。"}
            </h3>
            <p>
              {isPending
                ? "正在整理素材与平台表达，请稍候。"
                : "还没有生成内容。"}
            </p>
            <div className="empty-platforms" aria-hidden="true">
              <span>Twitter / X</span>
              <span>LinkedIn</span>
              <span>小红书</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
