"use client";

import { FilterChipGroup } from "./filter-chip-group";
import { SegmentedControl } from "./segmented-control";
import {
  type InputMode,
  PLATFORM_OPTIONS,
  type PlatformKey,
  TONE_OPTIONS,
  type ToneKey
} from "./types";

type InputPanelProps = {
  inputMode: InputMode;
  sourceText: string;
  sourceUrl: string;
  selectedPlatforms: PlatformKey[];
  tone: ToneKey;
  isPending: boolean;
  error: string | null;
  hasContent: boolean;
  onInputModeChange: (mode: InputMode) => void;
  onSourceTextChange: (value: string) => void;
  onSourceUrlChange: (value: string) => void;
  onTogglePlatform: (platform: PlatformKey) => void;
  onSelectAllPlatforms: () => void;
  onToneChange: (tone: ToneKey) => void;
  onSubmit: () => void;
};

const INPUT_MODE_OPTIONS: Array<{ value: InputMode; label: string }> = [
  { value: "text", label: "粘贴文本" },
  { value: "url", label: "输入 URL" }
];

export function InputPanel({
  inputMode,
  sourceText,
  sourceUrl,
  selectedPlatforms,
  tone,
  isPending,
  error,
  hasContent,
  onInputModeChange,
  onSourceTextChange,
  onSourceUrlChange,
  onTogglePlatform,
  onSelectAllPlatforms,
  onToneChange,
  onSubmit
}: InputPanelProps) {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-medium text-slate-100">输入内容</h2>
          <p className="mt-1 text-xs text-slate-500">
            选择来源形式后，设置目标平台和输出语气。
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
          className="min-h-[220px] w-full resize-none rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-3 text-sm outline-none ring-brand-500/60 placeholder:text-slate-500 focus:border-brand-500 focus:ring-1"
          placeholder="在这里粘贴你的长内容（博客、脚本、稿件等），建议 300-3000 字。"
          value={sourceText}
          onChange={event => onSourceTextChange(event.target.value)}
        />
      ) : (
        <input
          className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-3 text-sm outline-none ring-brand-500/60 placeholder:text-slate-500 focus:border-brand-500 focus:ring-1"
          placeholder="粘贴博客文章或长内容页面的链接，我们会自动抓取正文。"
          value={sourceUrl}
          onChange={event => onSourceUrlChange(event.target.value)}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-medium text-slate-200">目标平台</h3>
              <p className="mt-1 text-[11px] text-slate-500">
                最多同时生成 3 个平台版本。
              </p>
            </div>
            <button
              type="button"
              className="text-[11px] font-medium text-slate-500 transition hover:text-slate-300"
              onClick={onSelectAllPlatforms}
            >
              全选
            </button>
          </div>
          <div className="mt-3">
            <FilterChipGroup
              options={PLATFORM_OPTIONS.map(option => ({
                key: option.key,
                label: option.label,
                leading: option.shortLabel
              }))}
              selectedKeys={selectedPlatforms}
              onToggle={onTogglePlatform}
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div>
            <h3 className="text-xs font-medium text-slate-200">语气风格</h3>
            <p className="mt-1 text-[11px] text-slate-500">
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
        </section>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-slate-500">
            每次最多生成 3 个平台版本，内容长度建议控制在 4,000 字以内。
          </p>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!hasContent || selectedPlatforms.length === 0 || isPending}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            {isPending ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border border-white/40 border-t-transparent" />
                正在重制…
              </>
            ) : (
              "开始重制"
            )}
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
