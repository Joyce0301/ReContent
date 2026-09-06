"use client";

import { useEffect, useRef } from "react";
import { ArrowUp, LoaderCircle, Save, SlidersHorizontal } from "lucide-react";
import { SegmentedControl } from "./segmented-control";
import { type InputMode, MAX_CUSTOM_INSTRUCTION_LENGTH, PLATFORM_OPTIONS, type PlatformKey, TONE_OPTIONS, type ToneKey } from "./types";

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
};

export function InputPanel(props: InputPanelProps) {
  const busy = props.isPending || props.isSavingDraft;
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (sourceRef.current) sourceRef.current.scrollTop = 0;
  }, [props.isPending]);
  return (
    <form className="chat-composer" aria-label="内容创作" onSubmit={event => { event.preventDefault(); props.onSubmit(); }}>
      <fieldset disabled={busy}>
        <legend className="sr-only">创作素材和偏好</legend>
        <div className="composer-top">
          <SegmentedControl
            value={props.inputMode}
            options={[{ value: "text", label: "粘贴文本" }, { value: "url", label: "输入 URL" }]}
            onChange={props.onInputModeChange}
          />
          <button type="button" className="chat-icon-button" aria-label="保存草稿" title="保存草稿" onClick={props.onSaveDraft} disabled={props.draftSaveDisabled || busy}>
            {props.isSavingDraft ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}
          </button>
        </div>
        {props.inputMode === "text" ? (
          <textarea
            ref={sourceRef}
            aria-label="待重制的原始文本"
            className="composer-source"
            placeholder="写下或粘贴你的文案…"
            value={props.sourceText}
            disabled={busy}
            onChange={event => props.onSourceTextChange(event.target.value)}
          />
        ) : (
          <input
            type="url"
            aria-label="待抓取正文的链接地址"
            className="composer-source composer-url"
            placeholder="https://example.com/article"
            maxLength={2048}
            value={props.sourceUrl}
            disabled={busy}
            onChange={event => props.onSourceUrlChange(event.target.value)}
          />
        )}
        <div className="composer-bottom">
          <div role="group" aria-label="目标平台" className="composer-platform">
            <label htmlFor="target-platform" className="sr-only">目标平台</label>
            <select id="target-platform" value={props.selectedPlatform} onChange={event => props.onPlatformChange(event.target.value as PlatformKey)}>
              {PLATFORM_OPTIONS.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </div>
          <span className="composer-count">{props.inputMode === "text" ? props.sourceText.length.toLocaleString("zh-CN") + " 字" : "文章链接"}</span>
          <button type="submit" className="composer-send" disabled={!props.hasContent || busy} aria-label={props.isPending ? "正在重制" : "开始重制"} title="开始重制">
            {props.isPending ? <LoaderCircle size={20} className="animate-spin" aria-hidden="true" /> : <ArrowUp size={21} aria-hidden="true" />}
          </button>
        </div>
        <details className="composer-preferences">
          <summary><SlidersHorizontal size={15} aria-hidden="true" />写作偏好{props.customInstruction && <span className="preferences-dot" aria-label="已设置个性化要求" />}</summary>
          <div className="composer-settings">
            <div role="group" aria-label="语气风格">
              <label htmlFor="writing-tone">语气风格</label>
              <select id="writing-tone" value={props.tone} onChange={event => props.onToneChange(event.target.value as ToneKey)}>
                {TONE_OPTIONS.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
            </div>
            <label htmlFor="custom-instruction">个性化要求</label>
            <textarea
              id="custom-instruction"
              aria-label="个性化要求输入框"
              placeholder="例如：面向创业者，更简洁，保留关键数据。"
              maxLength={MAX_CUSTOM_INSTRUCTION_LENGTH}
              value={props.customInstruction}
              onChange={event => props.onCustomInstructionChange(event.target.value)}
            />
            <small>{props.customInstruction.length} / {MAX_CUSTOM_INSTRUCTION_LENGTH}</small>
          </div>
        </details>
      </fieldset>
      {props.error && <div className="chat-error" role="alert">{props.error}</div>}
    </form>
  );
}
