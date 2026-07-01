// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  buildXiaohongshuDraftPayloadMock,
  sendDraftToXiaohongshuBridgeMock
} = vi.hoisted(() => ({
  buildXiaohongshuDraftPayloadMock: vi.fn(),
  sendDraftToXiaohongshuBridgeMock: vi.fn()
}));

vi.mock("./lib/xiaohongshu-draft-bridge", () => ({
  buildXiaohongshuDraftPayload: buildXiaohongshuDraftPayloadMock,
  sendDraftToXiaohongshuBridge: sendDraftToXiaohongshuBridgeMock
}));

import HomePage from "./page";

describe("HomePage personalized prompt request", () => {
  afterEach(() => {
    cleanup();
    buildXiaohongshuDraftPayloadMock.mockReset();
    sendDraftToXiaohongshuBridgeMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("renders the personalized prompt field and helper text", () => {
    render(<HomePage />);

    expect(screen.getByText("个性化要求")).toBeTruthy();
    expect(
      screen.getByText("补充你希望成稿更像什么风格、口吻或表达方向。")
    ).toBeTruthy();
    expect(screen.getByLabelText("个性化要求输入框")).toBeTruthy();
  });

  it("sends customInstruction in the repurpose request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] })
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("待重制的原始文本"), {
      target: { value: "A valid source article" }
    });
    fireEvent.change(screen.getByLabelText("个性化要求输入框"), {
      target: { value: "更像创始人发言" }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始重制" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("更像创始人发言");
  });

  it("shows the send-to-draft action on xiaohongshu results", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ platform: "xiaohongshu", title: "标题", content: "正文" }]
      })
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("待重制的原始文本"), {
      target: { value: "source article" }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始重制" }));

    expect(
      await screen.findByRole("button", { name: "发送到小红书草稿" })
    ).toBeTruthy();
  });

  it("shows install guidance when the extension is unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ platform: "xiaohongshu", title: "标题", content: "正文" }]
      })
    });

    vi.stubGlobal("fetch", fetchMock);
    buildXiaohongshuDraftPayloadMock.mockReturnValue({
      sourceId: "req-1",
      title: "标题",
      content: "正文",
      tags: []
    });
    sendDraftToXiaohongshuBridgeMock.mockResolvedValue({
      status: "bridge_unavailable",
      message: "未检测到小红书草稿连接器，请先安装桌面扩展。"
    });

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("待重制的原始文本"), {
      target: { value: "source article" }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始重制" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "发送到小红书草稿" })
    );

    expect(await screen.findByText("未检测到小红书草稿连接器，请先安装桌面扩展。")).toBeTruthy();
    expect(
      screen.getByText("你仍然可以先点“复制内容”，手动粘贴到小红书创作页。")
    ).toBeTruthy();
  });

  it("renders login required feedback from the bridge", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ platform: "xiaohongshu", title: "标题", content: "正文" }]
      })
    });

    vi.stubGlobal("fetch", fetchMock);
    buildXiaohongshuDraftPayloadMock.mockReturnValue({
      sourceId: "req-1",
      title: "标题",
      content: "正文",
      tags: []
    });
    sendDraftToXiaohongshuBridgeMock.mockResolvedValue({
      status: "login_required",
      message: "请先登录小红书，登录完成后重新发送。"
    });

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("待重制的原始文本"), {
      target: { value: "source article" }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始重制" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "发送到小红书草稿" })
    );

    expect(
      await screen.findByText("请先登录小红书，登录完成后重新发送。")
    ).toBeTruthy();
  });

  it("renders unsupported page feedback from the bridge", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ platform: "xiaohongshu", title: "标题", content: "正文" }]
      })
    });

    vi.stubGlobal("fetch", fetchMock);
    buildXiaohongshuDraftPayloadMock.mockReturnValue({
      sourceId: "req-1",
      title: "标题",
      content: "正文",
      tags: []
    });
    sendDraftToXiaohongshuBridgeMock.mockResolvedValue({
      status: "unsupported_page",
      message: "小红书页面结构已变化，当前无法自动填充。"
    });

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("待重制的原始文本"), {
      target: { value: "source article" }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始重制" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "发送到小红书草稿" })
    );

    expect(
      await screen.findByText("小红书页面结构已变化，当前无法自动填充。")
    ).toBeTruthy();
  });

  it("shows opening and success feedback while sending a xiaohongshu draft", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ platform: "xiaohongshu", title: "标题", content: "正文" }]
      })
    });

    vi.stubGlobal("fetch", fetchMock);
    buildXiaohongshuDraftPayloadMock.mockReturnValue({
      sourceId: "req-1",
      title: "标题",
      content: "正文",
      tags: []
    });

    let resolveBridge:
      | ((value: { status: "filled"; message: string }) => void)
      | undefined;

    sendDraftToXiaohongshuBridgeMock.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveBridge = resolve;
        })
    );

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("待重制的原始文本"), {
      target: { value: "source article" }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始重制" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "发送到小红书草稿" })
    );

    expect(
      await screen.findByText("正在打开你本机浏览器中的小红书创作页…")
    ).toBeTruthy();
    expect(buildXiaohongshuDraftPayloadMock).toHaveBeenCalledWith(
      expect.any(String),
      { platform: "xiaohongshu", title: "标题", content: "正文" }
    );
    expect(sendDraftToXiaohongshuBridgeMock).toHaveBeenCalledWith({
      sourceId: "req-1",
      title: "标题",
      content: "正文",
      tags: []
    });

    resolveBridge?.({
      status: "filled",
      message: "已打开小红书编辑页，请检查内容后保存草稿。"
    });

    expect(
      await screen.findByText("已打开小红书编辑页，请检查内容后保存草稿。")
    ).toBeTruthy();
  });

  it("does not show the send-to-draft action on non-xiaohongshu results", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ platform: "linkedin", content: "正文" }]
      })
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("待重制的原始文本"), {
      target: { value: "source article" }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始重制" }));

    await screen.findByText("LinkedIn 帖子");
    expect(
      screen.queryByRole("button", { name: "发送到小红书草稿" })
    ).toBeNull();
  });

  it("ignores duplicate send clicks while a draft request is already opening", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ platform: "xiaohongshu", title: "标题", content: "正文" }]
      })
    });

    vi.stubGlobal("fetch", fetchMock);
    buildXiaohongshuDraftPayloadMock.mockReturnValue({
      sourceId: "req-1",
      title: "标题",
      content: "正文",
      tags: []
    });
    sendDraftToXiaohongshuBridgeMock.mockImplementation(
      () => new Promise(() => undefined)
    );

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("待重制的原始文本"), {
      target: { value: "source article" }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始重制" }));

    const sendButton = await screen.findByRole("button", {
      name: "发送到小红书草稿"
    });

    fireEvent.click(sendButton);
    fireEvent.click(sendButton);

    expect(sendDraftToXiaohongshuBridgeMock).toHaveBeenCalledTimes(1);
  });
});
