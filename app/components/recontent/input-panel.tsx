"use client";

import { ArrowRight, LoaderCircle, Save } from "lucide-react";
import { FilterChipGroup } from "./filter-chip-group";
import { SegmentedControl } from "./segmented-control";
import {
  type InputMode,
  MAX_CUSTOM_INSTRUCTION_LENGTH,
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
    <section className="input-panel" aria-labelledby="input-heading">
      <div className="panel-heading">
        <h2 id="input-heading">
          <span className="step-number">01</span>输入内容
        </h2>
        <SegmentedControl
          value={inputMode}
          options={INPUT_MODE_OPTIONS}
          onChange={onInputModeChange}
        />
      </div>

      {inputMode === "text" ? (
        <div>
          <textarea
            aria-label="待重制的原始文本"
            className="poster-field source-field"
            placeholder="写下或粘贴你的原始内容…"
            value={sourceText}
            onChange={(event) => onSourceTextChange(event.target.value)}
          />
          <div className="field-caption">
            <span>原始素材</span>
            <span>{sourceText.length.toLocaleString("zh-CN")} 字</span>
          </div>
        </div>
      ) : (
        <div className="url-field-wrap">
          <input
            type="url"
            aria-label="待抓取正文的链接地址"
            className="poster-field"
            placeholder="https://example.com/article"
            value={sourceUrl}
            onChange={(event) => onSourceUrlChange(event.target.value)}
          />
          <div className="field-caption">
            <span>文章链接</span>
          </div>
        </div>
      )}

      <div role="group" aria-labelledby="platform-label">
        <p id="platform-label" className="field-label">
          目标平台
        </p>
        <FilterChipGroup
          options={PLATFORM_OPTIONS.map((option) => ({
            key: option.key,
            label: option.label,
            leading: option.shortLabel
          }))}
          selectedKeys={[selectedPlatform]}
          onToggle={onPlatformChange}
        />
      </div>
      <div role="group" aria-labelledby="tone-label">
        <p id="tone-label" className="field-label">
          语气风格
        </p>
        <FilterChipGroup
          options={TONE_OPTIONS}
          selectedKeys={[tone]}
          onToggle={onToneChange}
        />
      </div>
      <div>
        <label
          htmlFor="custom-instruction"
          className="field-label personalization-label"
        >
          个性化要求 <span>选填</span>
        </label>
        <textarea
          id="custom-instruction"
          aria-label="个性化要求输入框"
          maxLength={MAX_CUSTOM_INSTRUCTION_LENGTH}
          className="poster-field min-h-[88px] resize-y"
          placeholder="例如：面向创业者，保留专业判断，多一点故事感。"
          value={customInstruction}
          onChange={(event) => onCustomInstructionChange(event.target.value)}
        />
        <div className="field-caption">
          <span />
          <span>
            {customInstruction.length} / {MAX_CUSTOM_INSTRUCTION_LENGTH}
          </span>
        </div>
      </div>

      <div className="input-actions">
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={draftSaveDisabled || isSavingDraft}
          className="poster-button-ghost"
        >
          <Save size={16} aria-hidden="true" />
          {isSavingDraft ? "正在保存…" : "保存草稿"}
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!hasContent || isPending}
          className="poster-button"
        >
          {isPending ? (
            <>
              <LoaderCircle
                size={16}
                className="animate-spin"
                aria-hidden="true"
              />
              正在重制…
            </>
          ) : (
            <>
              开始重制 <ArrowRight size={16} aria-hidden="true" />
            </>
          )}
        </button>
      </div>
      {draftStatusMessage ? (
        <p className="input-status" role="status">
          {draftStatusMessage}
        </p>
      ) : null}
      {error ? (
        <div className="input-status input-error" role="alert">
          <p className="font-medium">这次生成没有完成</p>
          <p>{error}</p>
        </div>
      ) : null}
    </section>
  );
}
