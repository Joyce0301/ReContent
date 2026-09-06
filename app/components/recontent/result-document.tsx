import { Check, Copy, Send } from "lucide-react";
import {
  PLATFORM_BADGES,
  PLATFORM_LABELS,
  type PlatformKey,
  type RepurposeResult,
  type XiaohongshuDraftBridgeResult
} from "./types";
import { XiaohongshuBridgeInstallGuide } from "./xiaohongshu-bridge-install-guide";

type ResultDocumentProps = {
  copyStatus?: "success" | "error" | null;
  draftStatus?: XiaohongshuDraftBridgeResult | null;
  onCopy: (platform: PlatformKey, text: string) => void;
  onSendToDraft: (result: RepurposeResult) => void;
  result: RepurposeResult;
};

function formatParagraphs(content: string) {
  return content
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);
}

export function ResultDocument({
  result,
  onCopy,
  copyStatus,
  draftStatus,
  onSendToDraft
}: ResultDocumentProps) {
  const paragraphs = formatParagraphs(result.content);
  const copyText = result.title
    ? `${result.title}\n\n${result.content}`
    : result.content;
  const isTwitter = result.platform === "twitter";
  const isLinkedIn = result.platform === "linkedin";
  const documentWidthClass = isTwitter
    ? "max-w-[38rem]"
    : isLinkedIn
      ? "max-w-[42rem]"
      : "max-w-[40rem]";
  const documentTypographyClass = isTwitter
    ? "text-[15px] leading-[2.05] sm:text-[15px]"
    : isLinkedIn
      ? "text-[15px] leading-8 sm:text-base"
      : "text-[15px] leading-[2.1] sm:text-base";
  const paragraphToneClass = "text-[var(--ink-soft)]";
  const isSendingToDraft = draftStatus?.status === "opening";
  const showBridgeInstallGuide =
    result.platform === "xiaohongshu" &&
    draftStatus?.status === "bridge_unavailable";

  return (
    <article className="result-document">
      <header>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--ink-soft)]">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-[var(--line)] bg-[var(--accent)] px-1 text-[10px] tracking-normal text-[var(--ink)]">
              {PLATFORM_BADGES[result.platform]}
            </span>
            <span>{PLATFORM_LABELS[result.platform]}</span>
          </div>
          {result.title ? (
            <h3 className="mt-3 max-w-3xl break-words text-[1.7rem] font-semibold leading-tight text-[var(--ink)] sm:text-[2rem]">
              {result.title}
            </h3>
          ) : (
            <h3 className="mt-3 text-base font-medium text-[var(--ink-soft)] sm:text-lg">
              正文
            </h3>
          )}
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex flex-wrap items-center gap-2">
            {result.platform === "xiaohongshu" ? (
              <button
                type="button"
                onClick={() => onSendToDraft(result)}
                disabled={isSendingToDraft}
                className="poster-button min-h-9 rounded-[16px] px-3.5 text-[11px] font-bold uppercase tracking-[0.06em]"
              >
                <Send size={14} aria-hidden="true" />发送到小红书草稿
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onCopy(result.platform, copyText)}
              className="poster-button-ghost min-h-9 rounded-[16px] px-3.5 text-[11px] font-bold uppercase tracking-[0.06em]"
            >
              {copyStatus === "success" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              {copyStatus === "success"
                ? "已复制"
                : copyStatus === "error"
                  ? "复制失败"
                  : "复制内容"}
            </button>
          </div>
          {result.platform === "xiaohongshu" && draftStatus ? (
            <div
              role="status"
              aria-live="polite"
              className="max-w-[28rem] space-y-2"
            >
              <p className="text-[11px] leading-5 text-[var(--ink-soft)]">
                {draftStatus.message}
              </p>
              {showBridgeInstallGuide ? (
                <XiaohongshuBridgeInstallGuide />
              ) : null}
            </div>
          ) : null}
          {showBridgeInstallGuide ? (
            <p className="max-w-[28rem] text-[11px] leading-5 text-[var(--ink-soft)]">
              你仍然可以先点“复制内容”，手动粘贴到小红书创作页。
            </p>
          ) : null}
        </div>
      </header>

      <div className="result-content">
        <div
          className={`mx-auto flex ${documentWidthClass} flex-col gap-5 ${documentTypographyClass} text-[var(--ink)]`}
        >
          <p className="sr-only" aria-live="polite">
            {copyStatus === "success"
              ? "内容已复制"
              : copyStatus === "error"
                ? "复制失败"
                : ""}
          </p>
          {paragraphs.length > 0 ? (
            paragraphs.map((paragraph, index) => (
              <p
                key={`${result.platform}-${index}`}
                className={`whitespace-pre-wrap ${paragraphToneClass}`}
              >
                {paragraph}
              </p>
            ))
          ) : (
            <p className={`whitespace-pre-wrap ${paragraphToneClass}`}>
              {result.content}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
