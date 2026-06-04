import { PLATFORM_BADGES, PLATFORM_LABELS, type RepurposeResult } from "./types";

type ResultDocumentProps = {
  result: RepurposeResult;
  onCopy: (text: string) => void;
};

function formatParagraphs(content: string) {
  return content
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);
}

export function ResultDocument({ result, onCopy }: ResultDocumentProps) {
  const paragraphs = formatParagraphs(result.content);
  const copyText = result.title
    ? `${result.title}\n\n${result.content}`
    : result.content;

  return (
    <article className="flex h-full flex-col rounded-[24px] border border-slate-800/90 bg-slate-950/80">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800/80 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-900 px-1 text-[10px] tracking-normal text-slate-200">
              {PLATFORM_BADGES[result.platform]}
            </span>
            <span>{PLATFORM_LABELS[result.platform]}</span>
          </div>
          {result.title ? (
            <h3 className="mt-3 text-lg font-semibold text-slate-50 sm:text-[22px]">
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
          onClick={() => onCopy(copyText)}
          className="inline-flex min-h-9 items-center rounded-full border border-slate-800 bg-slate-950 px-3 text-[11px] text-slate-400 transition hover:border-slate-700 hover:text-slate-200"
        >
          复制内容
        </button>
      </header>

      <div className="flex-1 overflow-auto px-5 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-4 text-sm leading-7 text-slate-200 sm:text-[15px]">
          {paragraphs.length > 0 ? (
            paragraphs.map((paragraph, index) => (
              <p key={`${result.platform}-${index}`} className="whitespace-pre-wrap">
                {paragraph}
              </p>
            ))
          ) : (
            <p className="whitespace-pre-wrap">{result.content}</p>
          )}
        </div>
      </div>
    </article>
  );
}
