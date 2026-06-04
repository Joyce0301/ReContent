"use client";

import { useEffect, useState, useTransition } from "react";
import { RecontentHeader } from "./components/recontent/header";
import { InputPanel } from "./components/recontent/input-panel";
import { ResultSurface } from "./components/recontent/result-surface";
import {
  DEFAULT_SELECTED_PLATFORMS,
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
  const [activePlatform, setActivePlatform] = useState<PlatformKey | null>(null);
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

  useEffect(() => {
    if (results.length === 0) {
      setActivePlatform(null);
      return;
    }

    setActivePlatform(currentPlatform => {
      if (
        currentPlatform &&
        results.some(result => result.platform === currentPlatform)
      ) {
        return currentPlatform;
      }

      return results[0]?.platform ?? null;
    });
  }, [results]);

  return (
    <main className="flex flex-1 flex-col gap-6">
      <RecontentHeader />

      <section className="grid flex-1 gap-6 md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.18fr)]">
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

        <ResultSurface
          activePlatform={activePlatform}
          results={results}
          onActivePlatformChange={setActivePlatform}
          onCopy={handleCopy}
        />
      </section>

      <footer className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-900 pt-3 text-[11px] text-slate-500">
        <span>支持文本与 URL 输入，并输出适配不同平台的发布版本。</span>
        <span>后续可扩展历史记录、账户体系与团队协作能力。</span>
      </footer>
    </main>
  );
}
