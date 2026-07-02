// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildXiaohongshuDraftPayload,
  detectXiaohongshuDraftBridgeRelay,
  sendDraftToXiaohongshuBridge
} from "./xiaohongshu-draft-bridge";

describe("buildXiaohongshuDraftPayload", () => {
  it("converts a Xiaohongshu result into bridge payload", () => {
    const payload = buildXiaohongshuDraftPayload("req-1", {
      platform: "xiaohongshu",
      title: "标题",
      content: "正文第一段\n\n#效率工具 #内容运营"
    });

    expect(payload).toEqual({
      sourceId: "req-1",
      title: "标题",
      content: "正文第一段",
      tags: ["#效率工具", "#内容运营"]
    });
  });
});

describe("sendDraftToXiaohongshuBridge", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-recontent-xiaohongshu-bridge");
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("blocks invalid titles before dispatch", async () => {
    await expect(
      sendDraftToXiaohongshuBridge({
        sourceId: "req-1",
        title: "超".repeat(21),
        content: "正文",
        tags: []
      })
    ).resolves.toEqual({
      status: "validation_error",
      message: "小红书标题需要在 1-20 个字符之间，请先调整后再发送。"
    });
  });

  it("blocks empty titles before dispatch", async () => {
    await expect(
      sendDraftToXiaohongshuBridge({
        sourceId: "req-1",
        title: "",
        content: "正文",
        tags: []
      })
    ).resolves.toEqual({
      status: "validation_error",
      message: "小红书标题需要在 1-20 个字符之间，请先调整后再发送。"
    });
  });

  it("blocks empty content before dispatch", async () => {
    await expect(
      sendDraftToXiaohongshuBridge({
        sourceId: "req-1",
        title: "标题",
        content: "   ",
        tags: []
      })
    ).resolves.toEqual({
      status: "validation_error",
      message: "当前正文为空，暂时无法发送到小红书草稿。"
    });
  });

  it("maps missing extension to bridge_unavailable", async () => {
    await expect(
      sendDraftToXiaohongshuBridge({
        sourceId: "req-1",
        title: "标题",
        content: "正文",
        tags: []
      })
    ).resolves.toEqual({
      status: "bridge_unavailable",
      message: "未检测到小红书草稿浏览器扩展，请先安装后再发送。"
    });
  });

  it("detects the bridge relay through a probe handshake", async () => {
    window.addEventListener("message", event => {
      if (event.data?.type !== "recontent:xiaohongshu-draft-probe-request") {
        return;
      }

      window.dispatchEvent(
        new MessageEvent("message", {
          source: window,
          data: {
            type: "recontent:xiaohongshu-draft-probe-response",
            requestId: event.data.requestId
          }
        })
      );
    });

    await expect(detectXiaohongshuDraftBridgeRelay()).resolves.toBe(true);
  });

  it("does not show install guidance when the relay is ready but the request times out", async () => {
    vi.useFakeTimers();
    document.documentElement.dataset.recontentXiaohongshuBridge = "ready";

    const promise = sendDraftToXiaohongshuBridge({
      sourceId: "req-1",
      title: "标题",
      content: "正文",
      tags: []
    });

    await vi.advanceTimersByTimeAsync(30000);

    await expect(promise).resolves.toEqual({
      status: "failed",
      message: "小红书浏览器扩展暂时没有响应，请刷新页面后重试。"
    });
  });

  it("resolves with the extension response", async () => {
    document.documentElement.dataset.recontentXiaohongshuBridge = "ready";
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("fixed-request-id");

    const promise = sendDraftToXiaohongshuBridge({
      sourceId: "req-1",
      title: "标题",
      content: "正文",
      tags: []
    });

    await Promise.resolve();

    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: {
          type: "recontent:xiaohongshu-draft-response",
          requestId: "fixed-request-id",
          result: {
            status: "filled",
            message: "已打开小红书编辑页，请检查内容后保存草稿。"
          }
        }
      })
    );

    await expect(promise).resolves.toEqual({
      status: "filled",
      message: "已打开小红书编辑页，请检查内容后保存草稿。"
    });
  });
});
