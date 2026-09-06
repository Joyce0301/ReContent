"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, FolderOpen, PanelLeft, RotateCcw, SquarePen, X } from "lucide-react";
import "../recontent.css";
import "./workspace.css";
import { DraftShelf } from "../components/recontent/draft-shelf";
import { ExtractionErrorDialog } from "../components/recontent/extraction-error-dialog";
import { RecontentHeader } from "../components/recontent/header";
import { InputPanel } from "../components/recontent/input-panel";
import { ResultSurface } from "../components/recontent/result-surface";
import { CampaignPanel } from "./campaign-panel";
import type { Campaign } from "../lib/campaigns/types";
import type { WorkspaceDraftRecord, WorkspaceDraftSnapshot } from "../lib/drafts/types";
import { buildXiaohongshuDraftPayload, sendDraftToXiaohongshuBridge } from "../lib/xiaohongshu-draft-bridge";
import { DEFAULT_SELECTED_PLATFORM, type InputMode, type PlatformKey, type RepurposeResult, type ToneKey, type XiaohongshuDraftBridgeResult } from "../components/recontent/types";

export type WorkspacePresentationUser = { displayName: string; email: string };
type WorkspacePageProps = { user: WorkspacePresentationUser };
type RepurposeErrorResponse = {
  error?: string;
  errorCode?: string;
  errorTitle?: string;
  errorDetail?: string;
};

function buildCampaignSource(campaign: Campaign) {
  return [
    `活动名称：${campaign.name}`,
    `营销目标：${campaign.goal}`,
    `目标受众：${campaign.audience}`,
    `核心信息：${campaign.keyMessage}`,
    campaign.cta && `行动号召：${campaign.cta}`
  ].filter(Boolean).join("\n");
}

export default function WorkspacePageClient({ user }: WorkspacePageProps) {
  const [view, setView] = useState<"create" | "campaigns">("create");
  const [campaign, setCampaign] = useState<{ id: string; name: string } | null>(null);
  const [campaignPageId, setCampaignPageId] = useState<string | null>(null);
  const [campaignPageVersion, setCampaignPageVersion] = useState(0);
  const [campaignDirty, setCampaignDirty] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [sourceText, setSourceText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [customInstruction, setCustomInstruction] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformKey>(DEFAULT_SELECTED_PLATFORM);
  const [tone, setTone] = useState<ToneKey>("neutral");
  const [results, setResults] = useState<RepurposeResult[]>([]);
  const [activePlatform, setActivePlatform] = useState<PlatformKey | null>(null);
  const [drafts, setDrafts] = useState<WorkspaceDraftRecord[]>([]);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draftStatusMessage, setDraftStatusMessage] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<{ platform: PlatformKey; status: "success" | "error" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftBridgeStatus, setDraftBridgeStatus] = useState<XiaohongshuDraftBridgeResult | null>(null);
  const [extractionErrorDialog, setExtractionErrorDialog] = useState<{ detail: string; title: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [submittedSource, setSubmittedSource] = useState<string | null>(null);
  const busyRef = useRef(false);
  const historyLoadingRef = useRef(false);
  const closeHistoryRef = useRef<HTMLButtonElement>(null);
  const openHistoryRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const bridgeRequestRef = useRef(0);
  const busy = isPending || isSavingDraft;
  const hasContent = Boolean((inputMode === "text" ? sourceText : sourceUrl).trim());
  const hasUnsavedResult = results.length > 0 && !currentDraftId;
  const snapshot: WorkspaceDraftSnapshot = { inputMode, sourceText, sourceUrl, selectedPlatform, tone, customInstruction, results, activePlatform, campaignId: campaign?.id ?? null };

  function canLeaveResult() {
    return !busyRef.current && (!(hasUnsavedResult || campaignDirty) || window.confirm("当前内容尚未保存，确定离开并放弃修改吗？"));
  }

  function clearFeedback() {
    setError(null);
    setExtractionErrorDialog(null);
    setSaveError(null);
    setDraftStatusMessage(null);
    setDraftBridgeStatus(null);
    setCopyFeedback(null);
    bridgeRequestRef.current++;
  }

  function invalidateDraftSnapshot() {
    if (!canLeaveResult()) return false;
    setCurrentDraftId(null);
    setResults([]);
    setActivePlatform(null);
    setSubmittedSource(null);
    clearFeedback();
    return true;
  }

  function closeHistory() {
    setShowHistory(false);
    openHistoryRef.current?.focus();
  }

  function newCreation() {
    if (!invalidateDraftSnapshot()) return;
    setView("create");
    setCampaign(null);
    setCampaignDirty(false);
    setSourceText("");
    setSourceUrl("");
    setCustomInstruction("");
    closeHistory();
  }

  function loadDraftIntoWorkspace(draft: WorkspaceDraftRecord) {
    if (!canLeaveResult()) return;
    setView("create");
    setCampaignDirty(false);
    setCampaign(draft.campaignId ? { id: draft.campaignId, name: draft.campaignName || "营销活动" } : null);
    setCurrentDraftId(draft.id);
    setInputMode(draft.inputMode);
    setSourceText(draft.sourceText);
    setSourceUrl(draft.sourceUrl);
    setSelectedPlatform(draft.selectedPlatform);
    setTone(draft.tone);
    setCustomInstruction(draft.customInstruction);
    setResults(draft.results);
    setActivePlatform(draft.activePlatform ?? draft.results[0]?.platform ?? null);
    setSubmittedSource(draft.results.length ? (draft.inputMode === "url" ? draft.sourceUrl : draft.sourceText) : null);
    clearFeedback();
    closeHistory();
  }

  function openCampaigns(id: string | null = null) {
    if (!invalidateDraftSnapshot()) return;
    setCampaignDirty(false);
    setCampaignPageId(id);
    setCampaignPageVersion(value => value + 1);
    setView("campaigns");
    closeHistory();
  }

  function startCampaignContent(value: Campaign) {
    if (!invalidateDraftSnapshot()) return;
    const sourceText = value.sourceText.trim() || (!value.sourceUrl.trim() ? buildCampaignSource(value) : "");
    const nextInputMode: InputMode = sourceText ? "text" : "url";
    const campaignSnapshot: WorkspaceDraftSnapshot = {
      inputMode: nextInputMode,
      sourceText,
      sourceUrl: value.sourceUrl,
      selectedPlatform,
      tone,
      customInstruction: "",
      results: [],
      activePlatform: null,
      campaignId: value.id
    };
    setCampaign({ id: value.id, name: value.name });
    setCampaignDirty(false);
    setView("create");
    setSourceText(sourceText);
    setSourceUrl(value.sourceUrl);
    setInputMode(nextInputMode);
    setCustomInstruction("");
    closeHistory();
    void handleRepurpose(campaignSnapshot, true);
  }

  async function loadHistory(offset = 0) {
    if (historyLoadingRef.current || busyRef.current) return;
    historyLoadingRef.current = true;
    setIsLoadingDrafts(true);
    setHistoryError(null);
    try {
      const response = await fetch(offset ? "/api/drafts?offset=" + offset : "/api/drafts");
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.drafts)) throw new Error(data.error || "历史记录加载失败");
      setDrafts(current => {
        const ids = new Set(current.map(draft => draft.id));
        return [...current, ...data.drafts.filter((draft: WorkspaceDraftRecord) => !ids.has(draft.id))];
      });
      setNextOffset(data.nextOffset ?? null);
    } catch (cause) {
      setHistoryError(cause instanceof Error ? cause.message : "历史记录加载失败");
    } finally {
      historyLoadingRef.current = false;
      setIsLoadingDrafts(false);
    }
  }

  async function persistSnapshot(value: WorkspaceDraftSnapshot, draftId?: string) {
    setIsSavingDraft(true);
    setSaveError(null);
    setDraftStatusMessage(null);
    try {
      const response = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...value, ...(draftId ? { draftId } : {}) })
      });
      const data = await response.json();
      if (!response.ok || !data.draft) throw new Error(data.error || "保存失败，请稍后重试");
      const saved = data.draft as WorkspaceDraftRecord;
      setCurrentDraftId(saved.id);
      setDraftStatusMessage("已保存到个人历史");
      setDrafts(current => [saved, ...current.filter(draft => draft.id !== saved.id)]);
      // Account for new rows inserted before the next offset-based page.
      if (!draftId) setNextOffset(current => current === null ? null : current + 1);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "保存失败，请稍后重试");
    } finally {
      setIsSavingDraft(false);
    }
  }

  async function handleSaveDraft() {
    if (!hasContent || busyRef.current) return;
    busyRef.current = true;
    try {
      await persistSnapshot(snapshot, currentDraftId ?? undefined);
    } finally {
      busyRef.current = false;
    }
  }

  async function handleRepurpose(requestSnapshot: WorkspaceDraftSnapshot = snapshot, leaveCheckDone = false) {
    const requestHasContent = Boolean((requestSnapshot.inputMode === "text" ? requestSnapshot.sourceText : requestSnapshot.sourceUrl).trim());
    if (!requestHasContent || (!leaveCheckDone && !canLeaveResult())) return;
    busyRef.current = true;
    clearFeedback();
    setResults([]);
    setCurrentDraftId(null);
    setActivePlatform(null);
    setSubmittedSource(requestSnapshot.inputMode === "text" ? requestSnapshot.sourceText : requestSnapshot.sourceUrl);
    setIsPending(true);
    try {
      const response = await fetch("/api/repurpose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: requestSnapshot.inputMode,
          text: requestSnapshot.inputMode === "text" ? requestSnapshot.sourceText : undefined,
          url: requestSnapshot.inputMode === "url" ? requestSnapshot.sourceUrl : undefined,
          platforms: [requestSnapshot.selectedPlatform], tone: requestSnapshot.tone,
          customInstruction: requestSnapshot.customInstruction,
          campaignId: requestSnapshot.campaignId
        })
      });
      if (!response.ok) {
        const data: RepurposeErrorResponse = await response.json().catch(() => ({}));
        if (requestSnapshot.inputMode === "url" && data.errorCode === "url_extraction_failed" && data.errorTitle && data.errorDetail) {
          setExtractionErrorDialog({ title: data.errorTitle, detail: data.errorDetail });
        }
        throw new Error(data.error || "生成失败，请稍后重试。");
      }
      const data = await response.json() as { results: RepurposeResult[] };
      if (!Array.isArray(data.results) || !data.results.length || data.results.some(result => !result.content?.trim())) {
        throw new Error("没有收到有效的生成结果，请重试。");
      }
      const platform = data.results[0].platform;
      setResults(data.results);
      setActivePlatform(platform);
      setIsPending(false);
      await persistSnapshot({ ...requestSnapshot, results: data.results, activePlatform: platform });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "发生未知错误");
    } finally {
      setIsPending(false);
      busyRef.current = false;
    }
  }

  async function handleCopy(platform: PlatformKey, text: string) {
    const request = bridgeRequestRef.current;
    try {
      await navigator.clipboard.writeText(text);
      if (request === bridgeRequestRef.current) setCopyFeedback({ platform, status: "success" });
    } catch {
      if (request === bridgeRequestRef.current) setCopyFeedback({ platform, status: "error" });
    }
  }

  async function handleSendToDraft(result: RepurposeResult) {
    if (result.platform !== "xiaohongshu" || draftBridgeStatus?.status === "opening") return;
    const request = ++bridgeRequestRef.current;
    setDraftBridgeStatus({ status: "opening", message: "正在打开你本机浏览器中的小红书创作页…" });
    const bridgeResult = await sendDraftToXiaohongshuBridge(
      buildXiaohongshuDraftPayload(globalThis.crypto?.randomUUID?.() ?? "req-" + Date.now(), result)
    );
    if (request === bridgeRequestRef.current) setDraftBridgeStatus(bridgeResult);
  }

  useEffect(() => { void loadHistory(); }, []);
  useEffect(() => {
    if (resultRef.current) resultRef.current.scrollTop = 0;
  }, [submittedSource]);
  useEffect(() => {
    if (showHistory) closeHistoryRef.current?.focus();
  }, [showHistory]);
  useEffect(() => {
    if (!copyFeedback) return;
    const timeout = window.setTimeout(() => setCopyFeedback(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyFeedback]);
  useEffect(() => {
    if (!hasUnsavedResult && !busy && !campaignDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedResult, busy, campaignDirty]);

  return (
    <div className="recontent-theme chat-layout" data-history-open={showHistory}
      onKeyDown={event => { if (event.key === "Escape" && showHistory) closeHistory(); }}
      onClickCapture={event => {
        const target = event.target as HTMLElement;
        if (target.closest('a[href]:not([href^="#"]), .workspace-account button') && !canLeaveResult()) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}>
      <a className="skip-link" href="#workspace-content">跳到主要内容</a>
      <aside className="chat-sidebar" id="personal-history" aria-label="个人工作区">
        <button ref={closeHistoryRef} type="button" className="chat-icon-button chat-close-history" aria-label="关闭历史" title="关闭历史" onClick={closeHistory}><X size={20} aria-hidden="true" /></button>
        <RecontentHeader user={user}>
          <button type="button" className="chat-new" onClick={newCreation} disabled={busy}><SquarePen size={19} aria-hidden="true" />新建创作</button>
          <button type="button" className="chat-history-item campaign-nav" aria-current={view === "campaigns" ? "page" : undefined} onClick={() => openCampaigns()} disabled={busy}><FolderOpen size={19} aria-hidden="true" />营销活动</button>
          <DraftShelf drafts={drafts} currentDraftId={currentDraftId} isLoading={isLoadingDrafts} disabled={busy} error={historyError} hasMore={nextOffset !== null} onLoadMore={() => void loadHistory(nextOffset ?? 0)} onLoadDraft={loadDraftIntoWorkspace} />
        </RecontentHeader>
      </aside>
      <main className="chat-main" id="workspace-content" tabIndex={-1}>
        <header className="chat-topbar">
          <button ref={openHistoryRef} type="button" className="chat-icon-button chat-open-history" aria-label="打开历史" title="打开历史" aria-controls="personal-history" aria-expanded={showHistory} onClick={() => setShowHistory(true)}><PanelLeft size={20} aria-hidden="true" /></button>
          {view === "create" && campaign ? <button className="campaign-context" onClick={() => openCampaigns(campaign.id)} disabled={busy}><FolderOpen size={16} /><span>{campaign.name}</span></button> : <span>{view === "campaigns" ? "营销活动" : "创作工作区"}</span>}
          <span className="chat-topbar-label">ReContent</span>
        </header>
        {view === "campaigns" ? <CampaignPanel key={campaignPageVersion} initialId={campaignPageId} onCreateContent={startCampaignContent} onOpenDraft={loadDraftIntoWorkspace} onDirtyChange={setCampaignDirty} /> : <div className="chat-stage" data-has-result={Boolean(submittedSource)}>
          {submittedSource ? (
            <div className="chat-conversation" ref={resultRef}>
              <details className="chat-source-message">
                <summary><span>{submittedSource}</span></summary>
                <p>{submittedSource}</p>
              </details>
              {(isPending || results.length > 0) && <ResultSurface
                isPending={isPending}
                activePlatform={activePlatform}
                copyStatus={copyFeedback?.platform === activePlatform ? copyFeedback.status : null}
                draftStatus={activePlatform === "xiaohongshu" ? draftBridgeStatus : null}
                results={results}
                onActivePlatformChange={platform => { setActivePlatform(platform); setDraftBridgeStatus(null); }}
                onCopy={handleCopy}
                onSendToDraft={handleSendToDraft}
              />}
            </div>
          ) : (
            <div className="chat-welcome">
              <Image src="/branding/recontent-symbol-512.png" alt="" width={42} height={42} />
              <h1>今天，想创作什么？</h1>
            </div>
          )}
          <div className="chat-compose-area">
            {saveError ? (
              <div className="chat-save-error" role="alert">
                <span>尚未保存到历史：{saveError}</span>
                <button type="button" onClick={handleSaveDraft} disabled={busy}><RotateCcw size={15} aria-hidden="true" />重试保存</button>
              </div>
            ) : (isSavingDraft || draftStatusMessage) && (
              <p className="chat-save-status" role="status"><Check size={14} aria-hidden="true" />{isSavingDraft ? "正在保存到个人历史…" : draftStatusMessage}</p>
            )}
            <InputPanel
              {...snapshot}
              isPending={isPending}
              error={error}
              hasContent={hasContent}
              isSavingDraft={isSavingDraft}
              draftSaveDisabled={!hasContent}
              onInputModeChange={value => { if (value !== inputMode && invalidateDraftSnapshot()) setInputMode(value); }}
              onSourceTextChange={value => { if (value !== sourceText && invalidateDraftSnapshot()) setSourceText(value); }}
              onSourceUrlChange={value => { if (value !== sourceUrl && invalidateDraftSnapshot()) setSourceUrl(value); }}
              onPlatformChange={value => { if (value !== selectedPlatform && invalidateDraftSnapshot()) setSelectedPlatform(value); }}
              onToneChange={value => { if (value !== tone && invalidateDraftSnapshot()) setTone(value); }}
              onCustomInstructionChange={value => { if (value !== customInstruction && invalidateDraftSnapshot()) setCustomInstruction(value); }}
              onSubmit={handleRepurpose}
              onSaveDraft={handleSaveDraft}
            />
            <p className="chat-disclaimer">AI 生成内容，请在发布前核实。</p>
          </div>
        </div>}
      </main>
      <ExtractionErrorDialog detail={extractionErrorDialog?.detail ?? ""} isOpen={Boolean(extractionErrorDialog)} title={extractionErrorDialog?.title ?? ""} onClose={() => setExtractionErrorDialog(null)} />
    </div>
  );
}
