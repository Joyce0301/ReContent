import {
  PLATFORM_BADGES,
  PLATFORM_LABELS,
  type PlatformKey,
  type RepurposeResult
} from "./types";

type ResultDocumentProps = {
  copyStatus?: "success" | "error" | null;
  onCopy: (platform: PlatformKey, text: string) => void;
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
  copyStatus
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
  const paragraphToneClass = isTwitter
    ? "text-slate-200/[0.94]"
    : isLinkedIn
      ? "text-slate-200/[0.96]"
      : "text-slate-100/[0.94]";

  return (
    <article className="flex h-full flex-col rounded-[26px] border border-slate-800/90 bg-[linear-gradient(180deg,rgba(2,6,23,0.7)_0%,rgba(2,6,23,0.88)_100%)] shadow-[inset_0_1px_0_rgba(148,163,184,0.04)]">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 px-5 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-900 px-1 text-[10px] tracking-normal text-slate-200">
              {PLATFORM_BADGES[result.platform]}
            </span>
            <span>{PLATFORM_LABELS[result.platform]}</span>
          </div>
          {result.title ? (
            <h3 className="mt-3 max-w-3xl text-xl font-semibold leading-tight tracking-tight text-slate-50 sm:text-[24px]">
              {result.title}
            </h3>
          ) : (
            <h3 className="mt-3 text-base font-medium text-slate-200 sm:text-lg">
              可直接发布的正文草稿
            </h3>
          )}
        </div>

        <button
          type="button"
          onClick={() => onCopy(result.platform, copyText)}
          className="inline-flex min-h-9 items-center rounded-full border border-slate-800 bg-slate-950/80 px-3.5 text-[11px] text-slate-400 transition hover:border-slate-700 hover:text-slate-200"
        >
          {copyStatus === "success"
            ? "已复制"
            : copyStatus === "error"
              ? "复制失败"
              : "复制内容"}
        </button>
      </header>

      <div className="flex-1 overflow-auto px-5 py-6 sm:px-6 sm:py-7">
        <div
          className={`mx-auto flex ${documentWidthClass} flex-col gap-5 ${documentTypographyClass} text-slate-100`}
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
