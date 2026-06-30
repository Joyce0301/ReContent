"use client";

type ExtractionErrorDialogProps = {
  detail: string;
  isOpen: boolean;
  title: string;
  onClose: () => void;
};

export function ExtractionErrorDialog({
  detail,
  isOpen,
  title,
  onClose
}: ExtractionErrorDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/28 px-4 backdrop-blur-[2px]">
      <div
        aria-describedby="extraction-error-detail"
        aria-labelledby="extraction-error-title"
        aria-modal="true"
        className="w-full max-w-md rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(241,245,249,0.96)_100%)] p-5 shadow-[0_24px_64px_rgba(15,23,42,0.22),inset_0_1px_0_rgba(255,255,255,0.94)] sm:p-6"
        role="dialog"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-sm text-amber-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]">
            !
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
              URL Parsing
            </p>
            <h3
              id="extraction-error-title"
              className="mt-2 text-lg font-semibold tracking-tight text-slate-950"
            >
              {title}
            </h3>
            <p
              id="extraction-error-detail"
              className="mt-3 text-sm leading-7 text-slate-600"
            >
              {detail}
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] transition hover:border-slate-300 hover:text-slate-900"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}
