"use client";

import { useEffect, useState, useTransition } from "react";
import { DraftShelf } from "../components/recontent/draft-shelf";
import { ExtractionErrorDialog } from "../components/recontent/extraction-error-dialog";
import { RecontentHeader } from "../components/recontent/header";
import { InputPanel } from "../components/recontent/input-panel";
import { ResultSurface } from "../components/recontent/result-surface";
import type { WorkspaceDraftRecord } from "../lib/drafts/types";
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

export type WorkspacePresentationUser = {
  displayName: string;
  email: string;
};

type WorkspacePageProps = {
  user: WorkspacePresentationUser;
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
  const [drafts, setDrafts] = useState<WorkspaceDraftRecord[]>([]);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [draftStatusMessage, setDraftStatusMessage] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(true);
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

  const invalidateDraftSnapshot = () => {
    setCurrentDraftId(null);
    setResults([]);
    setActivePlatform(null);
    setError(null);
    setExtractionErrorDialog(null);
    setDraftBridgeStatus(null);
    setCopyFeedback(null);
  };

  const loadDraftIntoWorkspace = (draft: WorkspaceDraftRecord) => {
    setCurrentDraftId(draft.id);
    setInputMode(draft.inputMode);
    setSourceText(draft.sourceText);
    setSourceUrl(draft.sourceUrl);
    setSelectedPlatform(draft.selectedPlatform);
    setTone(draft.tone);
    setCustomInstruction(draft.customInstruction);
    setResults(draft.results);
    setActivePlatform(draft.activePlatform ?? draft.results[0]?.platform ?? null);
    setError(null);
    setExtractionErrorDialog(null);
    setDraftBridgeStatus(null);
    setDraftStatusMessage(`已恢复草稿“${draft.name}”，你可以继续编辑。`);
  };

  const refreshDrafts = async () => {
    setIsLoadingDrafts(true);

    try {
      const response = await fetch("/api/drafts");
      const data = (await response.json().catch(() => ({}))) as {
        drafts?: WorkspaceDraftRecord[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "草稿列表加载失败");
      }

      setDrafts(Array.isArray(data.drafts) ? data.drafts : []);
    } catch (loadError) {
      setDraftStatusMessage(
        loadError instanceof Error ? loadError.message : "草稿列表加载失败"
      );
    } finally {
      setIsLoadingDrafts(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!hasContent || isSavingDraft) {
      return;
    }

    setIsSavingDraft(true);
    setDraftStatusMessage(null);

    try {
      const response = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(currentDraftId ? { draftId: currentDraftId } : {}),
          inputMode,
          sourceText,
          sourceUrl,
          selectedPlatform,
          tone,
          customInstruction,
          results,
          activePlatform
        })
      });
      const data = (await response.json().catch(() => ({}))) as {
        draft?: WorkspaceDraftRecord;
        error?: string;
      };

      if (!response.ok || !data.draft) {
        throw new Error(data.error || "草稿保存失败");
      }

      setCurrentDraftId(data.draft.id);
      setDraftStatusMessage(`已保存草稿“${data.draft.name}”。`);
      setDrafts(currentDrafts => {
        const nextDrafts = currentDrafts.filter(draft => draft.id !== data.draft?.id);
        return [data.draft!, ...nextDrafts].slice(0, 20);
      });
    } catch (saveError) {
      setDraftStatusMessage(
        saveError instanceof Error ? saveError.message : "草稿保存失败"
      );
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleInputModeChange = (nextMode: InputMode) => {
    if (nextMode !== inputMode) {
      invalidateDraftSnapshot();
    }

    setInputMode(nextMode);
  };

  const handleSourceTextChange = (nextValue: string) => {
    if (nextValue !== sourceText) {
      invalidateDraftSnapshot();
    }

    setSourceText(nextValue);
  };

  const handleSourceUrlChange = (nextValue: string) => {
    if (nextValue !== sourceUrl) {
      invalidateDraftSnapshot();
    }

    setSourceUrl(nextValue);
  };

  const handlePlatformChange = (nextPlatform: PlatformKey) => {
    if (nextPlatform !== selectedPlatform) {
      invalidateDraftSnapshot();
    }

    setSelectedPlatform(nextPlatform);
  };

  const handleToneChange = (nextTone: ToneKey) => {
    if (nextTone !== tone) {
      invalidateDraftSnapshot();
    }

    setTone(nextTone);
  };

  const handleCustomInstructionChange = (nextValue: string) => {
    if (nextValue !== customInstruction) {
      invalidateDraftSnapshot();
    }

    setCustomInstruction(nextValue);
  };

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
        setActivePlatform(data.results[0]?.platform ?? null);
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
    void refreshDrafts();
  }, []);

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

  useEffect(() => {
    if (!draftStatusMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDraftStatusMessage(current => (current === draftStatusMessage ? null : current));
    }, 2400);

    return () => window.clearTimeout(timeoutId);
  }, [draftStatusMessage]);

  return (
    <>
      <main className="poster-shell mx-auto flex min-h-screen w-full max-w-[1440px] flex-1 flex-col gap-7 px-5 py-6 sm:px-8 sm:py-8 lg:px-12">
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
            isSavingDraft={isSavingDraft}
            draftSaveDisabled={!hasContent}
            draftStatusMessage={draftStatusMessage}
            onInputModeChange={handleInputModeChange}
            onSourceTextChange={handleSourceTextChange}
            onSourceUrlChange={handleSourceUrlChange}
            onPlatformChange={handlePlatformChange}
            onToneChange={handleToneChange}
            onCustomInstructionChange={handleCustomInstructionChange}
            onSubmit={handleRepurpose}
            onSaveDraft={handleSaveDraft}
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

        <DraftShelf
          currentDraftId={currentDraftId}
          drafts={drafts}
          isLoading={isLoadingDrafts}
          onLoadDraft={loadDraftIntoWorkspace}
        />

        <footer className="poster-frame mt-1 flex flex-wrap items-center justify-between gap-2 rounded-[24px] px-4 py-3 text-[11px] leading-5 text-[var(--ink-soft)]">
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
