"use client";

import { useEffect, useState } from "react";
import { XiaohongshuBridgeInstallGuide } from "../components/recontent/xiaohongshu-bridge-install-guide";
import { type XiaohongshuDraftBridgeResult } from "../components/recontent/types";
import {
  detectXiaohongshuDraftBridgeRelay,
  sendDraftToXiaohongshuBridge
} from "../lib/xiaohongshu-draft-bridge";

const MANUAL_DRAFT_PAYLOAD = {
  sourceId: "manual-debug",
  title: "AI 内容重制如何写成小红书",
  content:
    "先讲一个真实场景：同一份素材要改成小红书版本。\n\n核心做法是保留观点，再重写表达。",
  tags: ["#AI工具", "#内容运营"]
};

export default function XiaohongshuDraftDebugPage() {
  const [draftStatus, setDraftStatus] =
    useState<XiaohongshuDraftBridgeResult | null>(null);
  const [bridgeRelayReady, setBridgeRelayReady] = useState<boolean | null>(null);
  const showBridgeInstallGuide = draftStatus?.status === "bridge_unavailable";

  useEffect(() => {
    let cancelled = false;

    detectXiaohongshuDraftBridgeRelay().then(isReady => {
      if (!cancelled) {
        setBridgeRelayReady(isReady);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSendDraft = async () => {
    setDraftStatus({
      status: "opening",
      message: "正在打开你本机浏览器中的小红书创作页…"
    });

    const result = await sendDraftToXiaohongshuBridge(MANUAL_DRAFT_PAYLOAD);
    setDraftStatus(result);
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl rounded-[32px] border border-slate-200/90 bg-white/85 p-8 shadow-[0_24px_64px_rgba(148,163,184,0.16)] backdrop-blur">
        <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
          Manual Verification
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          小红书草稿桥验收页
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
          这个页面只用于本地验收小红书草稿浏览器扩展。它会发送一份固定的测试草稿，
          帮我们稳定验证未安装扩展、未登录、已登录填充这三条链路。
        </p>
        <p className="mt-4 text-sm text-slate-600">
          桥接状态：
          {bridgeRelayReady === null
            ? "检测中"
            : bridgeRelayReady
              ? "已检测到"
              : "未检测到"}
        </p>

        <section className="mt-8 rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(241,245,249,0.92)_100%)] p-5">
          <h2 className="text-sm font-medium text-slate-900">测试载荷</h2>
          <div className="mt-4 grid gap-4">
            <div className="rounded-[20px] border border-slate-200 bg-white/90 p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                Title
              </p>
              <p className="mt-2 text-sm text-slate-800">
                {MANUAL_DRAFT_PAYLOAD.title}
              </p>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-white/90 p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                Content
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-800">
                {MANUAL_DRAFT_PAYLOAD.content}
              </p>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-white/90 p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                Tags
              </p>
              <p className="mt-2 text-sm text-slate-800">
                {MANUAL_DRAFT_PAYLOAD.tags.join(" ")}
              </p>
            </div>
          </div>
        </section>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSendDraft}
            disabled={draftStatus?.status === "opening"}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            发送测试草稿到小红书
          </button>
          <span className="text-xs leading-6 text-slate-500">
            不会自动保存草稿，也不会自动发布。
          </span>
        </div>

        {draftStatus ? (
          <div
            role="status"
            aria-live="polite"
            className="mt-6 space-y-3 rounded-[20px] border border-slate-200 bg-white/90 px-4 py-3 text-sm leading-6 text-slate-700"
          >
            <p>{draftStatus.message}</p>
            {showBridgeInstallGuide ? <XiaohongshuBridgeInstallGuide /> : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
