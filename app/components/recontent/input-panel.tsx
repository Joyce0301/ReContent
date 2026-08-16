"use client";

import { FilterChipGroup } from "./filter-chip-group";
import { SegmentedControl } from "./segmented-control";
import {
  type InputMode,
  MAX_CUSTOM_INSTRUCTION_LENGTH,
  PERSONALIZATION_EXAMPLES,
  PLATFORM_OPTIONS,
  type PlatformKey,
  TONE_OPTIONS,
  type ToneKey
} from "./types";

type InputPanelProps = {
  inputMode: InputMode;
  sourceText: string;
  sourceUrl: string;
  selectedPlatform: PlatformKey;
  tone: ToneKey;
  customInstruction: string;
  isPending: boolean;
  error: string | null;
  hasContent: boolean;
  onInputModeChange: (mode: InputMode) => void;
  onSourceTextChange: (value: string) => void;
  onSourceUrlChange: (value: string) => void;
  onPlatformChange: (platform: PlatformKey) => void;
  onToneChange: (tone: ToneKey) => void;
  onCustomInstructionChange: (value: string) => void;
  onSubmit: () => void;
  onSaveDraft: () => void;
  isSavingDraft: boolean;
  draftSaveDisabled: boolean;
  draftStatusMessage: string | null;
};

const INPUT_MODE_OPTIONS: Array<{ value: InputMode; label: string }> = [
  { value: "text", label: "粘贴文本" },
  { value: "url", label: "输入 URL" }
];

export function InputPanel({
  inputMode,
  sourceText,
  sourceUrl,
  selectedPlatform,
  tone,
  customInstruction,
  isPending,
  error,
  hasContent,
  onInputModeChange,
  onSourceTextChange,
  onSourceUrlChange,
  onPlatformChange,
  onToneChange,
  onCustomInstructionChange,
  onSubmit,
  onSaveDraft,
  isSavingDraft,
  draftSaveDisabled,
  draftStatusMessage
}: InputPanelProps) {
  return (
    <div className="poster-frame flex flex-col gap-5 rounded-[30px] bg-[rgba(250,242,218,0.95)] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="poster-kicker text-[var(--accent-deep)]">Input desk</p>
          <h2 className="poster-display mt-2 text-[2.4rem] text-[var(--ink)]">
            输入内容
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">
            先放入原始内容，再决定这一轮要生成哪个平台，以及成稿的表达语气。
          </p>
        </div>
        <SegmentedControl
          value={inputMode}
          options={INPUT_MODE_OPTIONS}
          onChange={onInputModeChange}
        />
      </div>

      {inputMode === "text" ? (
        <textarea
          aria-label="待重制的原始文本"
          className="poster-field min-h-[220px] resize-none rounded-[22px] text-sm leading-7"
          placeholder="在这里粘贴你的长内容（博客、脚本、稿件等），建议 300-3000 字。"
          value={sourceText}
          onChange={event => onSourceTextChange(event.target.value)}
        />
      ) : (
        <input
          aria-label="待抓取正文的链接地址"
          className="poster-field rounded-[22px] text-sm"
          placeholder="粘贴博客文章或长内容页面的链接，我们会自动抓取正文。"
          value={sourceUrl}
          onChange={event => onSourceUrlChange(event.target.value)}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="rounded-[24px] border-2 border-[var(--line)] bg-[rgba(255,248,227,0.76)] p-3.5 shadow-[4px_4px_0_rgba(23,18,15,0.82)]">
          <div>
            <div>
              <h3 className="poster-kicker text-[var(--accent-deep)]">目标平台</h3>
              <p className="mt-1 text-[11px] text-[var(--ink-soft)]">
                每次只生成 1 个平台版本，优先保证解析稳定和成稿质量。
              </p>
            </div>
          </div>
          <div className="mt-3">
            <FilterChipGroup
              options={PLATFORM_OPTIONS.map(option => ({
                key: option.key,
                label: option.label,
                leading: option.shortLabel
              }))}
              selectedKeys={[selectedPlatform]}
              onToggle={onPlatformChange}
            />
          </div>
        </section>

        <section className="rounded-[24px] border-2 border-[var(--line)] bg-[rgba(255,248,227,0.76)] p-3.5 shadow-[4px_4px_0_rgba(23,18,15,0.82)]">
          <div>
            <h3 className="poster-kicker text-[var(--accent-deep)]">语气风格</h3>
            <p className="mt-1 text-[11px] text-[var(--ink-soft)]">
              控制输出的表达方式与正式程度。
            </p>
          </div>
          <div className="mt-3">
            <FilterChipGroup
              options={TONE_OPTIONS}
              selectedKeys={[tone]}
              onToggle={key => onToneChange(key)}
            />
          </div>
          <div className="mt-4 border-t-2 border-[var(--line)] pt-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="poster-kicker text-[var(--accent-deep)]">个性化要求</h4>
              <span className="poster-kicker text-[var(--ink-soft)]">
                Optional
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-[var(--ink-soft)]">
              补充你希望成稿更像什么风格、口吻或表达方向。
            </p>
            <textarea
              aria-label="个性化要求输入框"
              maxLength={MAX_CUSTOM_INSTRUCTION_LENGTH}
              className="poster-field mt-3 min-h-[112px] resize-none rounded-[18px] text-sm leading-7"
              placeholder="例如：更像创始人公开发言，保留专业判断，但更有故事感。"
              value={customInstruction}
              onChange={event => onCustomInstructionChange(event.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {PERSONALIZATION_EXAMPLES.map(example => (
                <span
                  key={example}
                  className="poster-pill rounded-full px-2.5 py-1 text-[10px] text-[var(--ink-soft)]"
                >
                  {example}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] leading-5 text-[var(--ink-soft)]">
            每次只生成当前选中的平台版本，内容长度建议控制在 4,000 字以内。
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={draftSaveDisabled || isSavingDraft}
              className="poster-button-ghost min-h-10 rounded-[18px] px-4 py-2 text-xs font-bold uppercase tracking-[0.06em]"
            >
              {isSavingDraft ? "正在保存…" : "保存草稿"}
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!hasContent || isPending}
              className="poster-button min-h-10 gap-2 rounded-[18px] px-4 py-2 text-xs font-bold uppercase tracking-[0.06em]"
            >
              {isPending ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border border-[var(--ink)]/40 border-t-transparent" />
                  正在重制…
                </>
              ) : (
                "开始重制"
              )}
            </button>
          </div>
        </div>

        {draftStatusMessage ? (
          <div className="rounded-[16px] border-2 border-[var(--line)] bg-[rgba(255,248,227,0.8)] px-3 py-2 text-[11px] leading-5 text-[var(--ink-soft)] shadow-[4px_4px_0_rgba(23,18,15,0.82)]">
            {draftStatusMessage}
          </div>
        ) : null}

        {error && (
          <div
            className="flex items-start gap-3 rounded-[18px] border-2 border-[var(--line)] bg-[rgba(142,35,24,0.08)] px-3.5 py-3 text-xs text-[var(--ink)] shadow-[4px_4px_0_rgba(23,18,15,0.82)]"
            role="alert"
          >
            <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent-deep)]" />
            <div className="space-y-1">
              <p className="font-medium text-[var(--ink)]">这次生成没有完成</p>
              <p className="leading-5 text-[var(--ink-soft)]">{error}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
