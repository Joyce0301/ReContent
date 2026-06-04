"use client";

import { useState, useTransition } from "react";
import { RecontentHeader } from "./components/recontent/header";
import { InputPanel } from "./components/recontent/input-panel";
import {
  DEFAULT_SELECTED_PLATFORMS,
  PLATFORM_BADGES,
  PLATFORM_LABELS,
  type InputMode,
  type PlatformKey,
  type RepurposeResult,
  type ToneKey
} from "./components/recontent/types";

export default function HomePage() {
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [sourceText, setSourceText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] =
    useState<PlatformKey[]>(DEFAULT_SELECTED_PLATFORMS);
  const [tone, setTone] = useState<ToneKey>("neutral");
  const [results, setResults] = useState<RepurposeResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasContent =
    (inputMode === "text" && sourceText.trim().length > 0) ||
    (inputMode === "url" && sourceUrl.trim().length > 0);

  const togglePlatform = (platform: PlatformKey) => {
    setSelectedPlatforms(prev =>
      prev.includes(platform)
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    );
  };

  const handleRepurpose = () => {
    if (!hasContent || selectedPlatforms.length === 0) return;

    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/repurpose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: inputMode,
            text: inputMode === "text" ? sourceText : undefined,
            url: inputMode === "url" ? sourceUrl : undefined,
            platforms: selectedPlatforms,
            tone
          })
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "生成失败，请稍后重试。");
        }

        const data = (await res.json()) as { results: RepurposeResult[] };
        setResults(data.results);
      } catch (e) {
        setError(e instanceof Error ? e.message : "发生未知错误");
      }
    });
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  return (
    <main className="flex flex-1 flex-col gap-6">
      <RecontentHeader />

      <section className="grid flex-1 gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <InputPanel
          inputMode={inputMode}
          sourceText={sourceText}
          sourceUrl={sourceUrl}
          selectedPlatforms={selectedPlatforms}
          tone={tone}
          isPending={isPending}
          error={error}
          hasContent={hasContent}
          onInputModeChange={setInputMode}
          onSourceTextChange={setSourceText}
          onSourceUrlChange={setSourceUrl}
          onTogglePlatform={togglePlatform}
          onSelectAllPlatforms={() => setSelectedPlatforms(DEFAULT_SELECTED_PLATFORMS)}
          onToneChange={setTone}
          onSubmit={handleRepurpose}
        />

        <div className="flex min-h-[260px] flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-slate-100">
              生成结果 & 一键复制
            </h2>
            <span className="text-[11px] text-slate-500">
              {results.length > 0
                ? `已为 ${results.length} 个平台生成内容`
                : "等待生成，你可以先粘贴一段内容"}
            </span>
          </div>

          {results.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-950/60 px-4 py-10 text-center">
              <p className="max-w-xs text-xs text-slate-500">
                在左侧粘贴你的长内容并选择平台，
                ReContent 会为 Twitter、LinkedIn 和小红书
                生成已适配字数和风格的短内容。
              </p>
            </div>
          ) : (
            <div className="flex-1 space-y-3 overflow-auto pr-1">
              {results.map(result => (
                <div
                  key={result.platform}
                  className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-xs"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-slate-200">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px]">
                        {PLATFORM_BADGES[result.platform]}
                      </span>
                      <span className="font-medium">
                        {PLATFORM_LABELS[result.platform]}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(result.content)}
                      className="rounded-full border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-slate-500"
                    >
                      复制
                    </button>
                  </div>
                  {result.title && (
                    <p className="mb-1 font-medium text-slate-100">
                      {result.title}
                    </p>
                  )}
                  <pre className="whitespace-pre-wrap text-[11px] text-slate-300">
                    {result.content}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-900 pt-3 text-[11px] text-slate-500">
        <span>支持文本与 URL 输入，并输出适配不同平台的发布版本。</span>
        <span>后续可扩展历史记录、账户体系与团队协作能力。</span>
      </footer>
    </main>
  );
}
