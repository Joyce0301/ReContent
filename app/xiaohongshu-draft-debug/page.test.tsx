// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  detectXiaohongshuDraftBridgeRelayMock,
  sendDraftToXiaohongshuBridgeMock
} = vi.hoisted(() => ({
  detectXiaohongshuDraftBridgeRelayMock: vi.fn(),
  sendDraftToXiaohongshuBridgeMock: vi.fn()
}));

vi.mock("../lib/xiaohongshu-draft-bridge", () => ({
  detectXiaohongshuDraftBridgeRelay: detectXiaohongshuDraftBridgeRelayMock,
  sendDraftToXiaohongshuBridge: sendDraftToXiaohongshuBridgeMock
}));

import XiaohongshuDraftDebugPage from "./page";

describe("XiaohongshuDraftDebugPage", () => {
  afterEach(() => {
    cleanup();
    detectXiaohongshuDraftBridgeRelayMock.mockReset();
    sendDraftToXiaohongshuBridgeMock.mockReset();
  });

  it("renders a dedicated manual verification entry for the draft bridge", async () => {
    detectXiaohongshuDraftBridgeRelayMock.mockResolvedValue(false);

    render(<XiaohongshuDraftDebugPage />);

    expect(screen.getByText("小红书草稿桥验收页")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "发送测试草稿到小红书" })
    ).toBeTruthy();
    expect(await screen.findByText("桥接状态：未检测到")).toBeTruthy();
  });

  it("shows opening and bridge feedback when sending the manual draft", async () => {
    let resolveBridge:
      | ((value: { status: "bridge_unavailable"; message: string }) => void)
      | undefined;

    detectXiaohongshuDraftBridgeRelayMock.mockResolvedValue(true);
    sendDraftToXiaohongshuBridgeMock.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveBridge = resolve;
        })
    );

    render(<XiaohongshuDraftDebugPage />);
    fireEvent.click(screen.getByRole("button", { name: "发送测试草稿到小红书" }));

    expect(
      await screen.findByText("正在打开你本机浏览器中的小红书创作页…")
    ).toBeTruthy();
    expect(sendDraftToXiaohongshuBridgeMock).toHaveBeenCalledWith({
      sourceId: "manual-debug",
      title: "AI 内容重制如何写成小红书",
      content:
        "先讲一个真实场景：同一份素材要改成小红书版本。\n\n核心做法是保留观点，再重写表达。",
      tags: ["#AI工具", "#内容运营"]
    });

    resolveBridge?.({
      status: "bridge_unavailable",
      message: "未检测到小红书草稿连接器，请先安装桌面扩展。"
    });

    expect(
      await screen.findByText("未检测到小红书草稿连接器，请先安装桌面扩展。")
    ).toBeTruthy();
  });
});
