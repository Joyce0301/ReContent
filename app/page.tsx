"use client";

import { useState, useTransition } from "react";

type PlatformKey = "twitter" | "linkedin" | "xiaohongshu";

type RepurposeResult = {
  platform: PlatformKey;
  title?: string;
  content: string;
};

const PLATFORM_LABELS: Record<PlatformKey, string> = {
  twitter: "Twitter / X 推文串",
  linkedin: "LinkedIn 帖子",
  xiaohongshu: "小红书笔记"
};

export default function HomePage() {
  const [inputMode, setInputMode] = useState<"text" | "url">("text");
  const [sourceText, setSourceText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformKey[]>([
    "twitter",
    "linkedin",
    "xiaohongshu"
  ]);
  const [tone, setTone] = useState<"neutral" | "formal" | "casual">("neutral");
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
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
            ReContent — AI 内容重制
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            一次创作，多平台分发。支持 Twitter、LinkedIn、小红书 的智能适配。
          </p>
        </div>
        <span className="rounded-full border border-brand-500/40 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-100">
          MVP · 文本 / URL → 3 平台输出
        </span>
      </header>

      <section className="grid flex-1 gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-slate-100">输入你的内容</h2>
            <div className="inline-flex rounded-full border border-slate-700 bg-slate-900 p-1 text-xs">
              <button
                type="button"
                className={`rounded-full px-3 py-1 ${
                  inputMode === "text"
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-400"
                }`}
                onClick={() => setInputMode("text")}
              >
                📋 粘贴文本
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-1 ${
                  inputMode === "url"
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-400"
                }`}
                onClick={() => setInputMode("url")}
              >
                🔗 输入 URL
              </button>
            </div>
          </div>

          {inputMode === "text" ? (
            <textarea
              className="min-h-[220px] w-full resize-none rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm outline-none ring-brand-500/60 placeholder:text-slate-500 focus:border-brand-500 focus:ring-1"
              placeholder="在这里粘贴你的长内容（博客、脚本、稿件等），建议 300-3000 字。"
              value={sourceText}
              onChange={e => setSourceText(e.target.value)}
            />
          ) : (
            <input
              className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm outline-none ring-brand-500/60 placeholder:text-slate-500 focus:border-brand-500 focus:ring-1"
              placeholder="粘贴博客文章或长内容页面的链接，我们会自动抓取正文。"
              value={sourceUrl}
              onChange={e => setSourceUrl(e.target.value)}
            />
          )}

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-300">
                  目标平台
                </span>
                <button
                  type="button"
                  className="text-[11px] text-slate-500 hover:text-slate-300"
                  onClick={() =>
                    setSelectedPlatforms(["twitter", "linkedin", "xiaohongshu"])
                  }
                >
                  全选
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  ["twitter", "linkedin", "xiaohongshu"] as PlatformKey[]
                ).map(p => {
                  const active = selectedPlatforms.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlatform(p)}
                      className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs ${
                        active
                          ? "border-brand-500/70 bg-brand-500/15 text-brand-100"
                          : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      <span>
                        {p === "twitter"
                          ? "𝕏"
                          : p === "linkedin"
                            ? "in"
                            : "小红书"}
                      </span>
                      <span>{PLATFORM_LABELS[p]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <span className="text-xs font-medium text-slate-300">
                语气 & 风格
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { key: "neutral", label: "中性专业" },
                  { key: "formal", label: "正式商务" },
                  { key: "casual", label: "轻松口语" }
                ].map(option => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() =>
                      setTone(option.key as "neutral" | "formal" | "casual")
                    }
                    className={`rounded-full border px-3 py-1.5 text-xs ${
                      tone === option.key
                        ? "border-brand-500/70 bg-brand-500/15 text-brand-100"
                        : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500">
              MVP：每次最多重制 3 个平台。内容长度建议控制在 4,000 字以内。
            </p>
            <button
              type="button"
              onClick={handleRepurpose}
              disabled={!hasContent || selectedPlatforms.length === 0 || isPending}
              className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-4 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {isPending ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border border-white/40 border-t-transparent" />
                  正在重制…
                </>
              ) : (
                <>
                  <span>开始重制</span>
                  <span className="text-[10px] opacity-80">▶</span>
                </>
              )}
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>

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
                        {result.platform === "twitter"
                          ? "𝕏"
                          : result.platform === "linkedin"
                            ? "in"
                            : "小"}
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
        <span>基于 PRD：文本 / URL 输入 → 3 平台输出 → 编辑 & 复制</span>
        <span>后续可扩展：账户、用量限制、历史内容库等</span>
      </footer>
    </main>
  );
}

