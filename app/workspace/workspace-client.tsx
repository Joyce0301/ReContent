"use client";

import { useEffect, useState, useTransition } from "react";
import { ExtractionErrorDialog } from "../components/recontent/extraction-error-dialog";
import { RecontentHeader } from "../components/recontent/header";
import { InputPanel } from "../components/recontent/input-panel";
import { ResultSurface } from "../components/recontent/result-surface";
import {
  buildXiaohongshuDraftPayload,
  sendDraftToXiaohongshuBridge
} from "../lib/xiaohongshu-draft-bridge";
import {
  DEFAULT_SELECTED_PLATFORM,
  type InputMode,
  type PlatformKey,
  type RepurposeResult,
  type ToneKey,
  type XiaohongshuDraftBridgeResult
} from "../components/recontent/types";
import type { AuthSessionUser } from "../lib/auth/types";

type WorkspacePageProps = {
  user: AuthSessionUser;
};

type RepurposeErrorResponse = {
  error?: string;
  errorCode?: "url_extraction_failed";
  extractionFailureReason?:
    | "invalid_url"
    | "timeout"
    | "network_error"
    | "http_error"
    | "no_content"
    | "unsupported_site";
  errorTitle?: string;
  errorDetail?: string;
};

function createRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}`;
}

export default function WorkspacePageClient({ user }: WorkspacePageProps) {
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [sourceText, setSourceText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [customInstruction, setCustomInstruction] = useState("");
  const [selectedPlatform, setSelectedPlatform] =
    useState<PlatformKey>(DEFAULT_SELECTED_PLATFORM);
  const [tone, setTone] = useState<ToneKey>("neutral");
  const [results, setResults] = useState<RepurposeResult[]>([]);
  const [activePlatform, setActivePlatform] = useState<PlatformKey | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<{
    platform: PlatformKey;
    status: "success" | "error";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftBridgeStatus, setDraftBridgeStatus] =
    useState<XiaohongshuDraftBridgeResult | null>(null);
  const [extractionErrorDialog, setExtractionErrorDialog] = useState<{
    detail: string;
    title: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasContent =
    (inputMode === "text" && sourceText.trim().length > 0) ||
    (inputMode === "url" && sourceUrl.trim().length > 0);

  const handleRepurpose = () => {
    if (!hasContent) return;

    setError(null);
    setExtractionErrorDialog(null);
    setDraftBridgeStatus(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/repurpose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: inputMode,
            text: inputMode === "text" ? sourceText : undefined,
            url: inputMode === "url" ? sourceUrl : undefined,
            platforms: [selectedPlatform],
            tone,
            customInstruction
          })
        });

        if (!res.ok) {
          const data = (await res.json().catch(
            () => ({}) as RepurposeErrorResponse
          )) as RepurposeErrorResponse;

          if (
            inputMode === "url" &&
            data.errorCode === "url_extraction_failed" &&
            data.errorTitle &&
            data.errorDetail
          ) {
            setExtractionErrorDialog({
              detail: data.errorDetail,
              title: data.errorTitle
            });
          }

          throw new Error(data.error || "生成失败，请稍后重试。");
        }

        const data = (await res.json()) as { results: RepurposeResult[] };
        setResults(data.results);
      } catch (e) {
        setError(e instanceof Error ? e.message : "发生未知错误");
      }
    });
  };

  const handleCopy = async (platform: PlatformKey, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback({ platform, status: "success" });
    } catch {
      setCopyFeedback({ platform, status: "error" });
    }
  };

  const handleActivePlatformChange = (platform: PlatformKey) => {
    setDraftBridgeStatus(null);
    setActivePlatform(platform);
  };

  const handleSendToDraft = async (result: RepurposeResult) => {
    if (result.platform !== "xiaohongshu") {
      return;
    }

    if (draftBridgeStatus?.status === "opening") {
      return;
    }

    setDraftBridgeStatus({
      status: "opening",
      message: "正在打开你本机浏览器中的小红书创作页…"
    });

    const bridgeResult = await sendDraftToXiaohongshuBridge(
      buildXiaohongshuDraftPayload(createRequestId(), result)
    );
    setDraftBridgeStatus(bridgeResult);
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

  useEffect(() => {
    if (!copyFeedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopyFeedback(current =>
        current?.platform === copyFeedback.platform ? null : current
      );
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [copyFeedback]);

  useEffect(() => {
    setError(null);
    setExtractionErrorDialog(null);
  }, [inputMode]);

  return (
    <>
      <main className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-1 flex-col gap-7 px-5 py-6 sm:px-8 sm:py-8 lg:px-12">
        <RecontentHeader user={user} />

        <section className="grid flex-1 items-stretch gap-6 md:grid-cols-[minmax(0,0.94fr)_minmax(0,1.16fr)]">
          <InputPanel
            inputMode={inputMode}
            sourceText={sourceText}
            sourceUrl={sourceUrl}
            selectedPlatform={selectedPlatform}
            tone={tone}
            customInstruction={customInstruction}
            isPending={isPending}
            error={error}
            hasContent={hasContent}
            onInputModeChange={setInputMode}
            onSourceTextChange={setSourceText}
            onSourceUrlChange={setSourceUrl}
            onPlatformChange={setSelectedPlatform}
            onToneChange={setTone}
            onCustomInstructionChange={setCustomInstruction}
            onSubmit={handleRepurpose}
          />

          <ResultSurface
            activePlatform={activePlatform}
            copyStatus={
              copyFeedback?.platform === activePlatform
                ? copyFeedback.status
                : null
            }
            draftStatus={
              activePlatform === "xiaohongshu" ? draftBridgeStatus : null
            }
            results={results}
            onActivePlatformChange={handleActivePlatformChange}
            onCopy={handleCopy}
            onSendToDraft={handleSendToDraft}
          />
        </section>

        <footer className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/90 pt-4 text-[11px] leading-5 text-slate-500">
          <span>支持文本与 URL 输入，并输出适配不同平台的发布版本。</span>
          <span>保留清晰结构、平台语气与可直接复制的成稿视图。</span>
        </footer>
      </main>

      <ExtractionErrorDialog
        detail={extractionErrorDialog?.detail ?? ""}
        isOpen={Boolean(extractionErrorDialog)}
        title={extractionErrorDialog?.title ?? ""}
        onClose={() => setExtractionErrorDialog(null)}
      />
    </>
  );
}
