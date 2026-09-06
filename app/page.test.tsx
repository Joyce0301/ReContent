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

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn()
  })
}));

import HomePage from "./workspace/workspace-client";

describe("HomePage personalized prompt request", () => {
  const user = {
    id: "user-1",
    email: "joyce@example.com",
    displayName: "Joyce",
    avatarKey: null,
    avatarStatus: "not_uploaded" as const,
    avatarUpdatedAt: null
  };

  function createWorkspaceFetchMock(repurposePayload: { results: unknown[] }) {
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/drafts") {
        if (init?.method === "POST") {
          return { ok: true, json: async () => ({ draft: {
            ...JSON.parse(String(init.body)), id: "saved-draft", name: "已保存的创作",
            createdAt: "2026-09-06T01:00:00Z", updatedAt: "2026-09-06T01:00:00Z"
          } }) };
        }
        return {
          ok: true,
          json: async () => ({ drafts: [] })
        };
      }

      if (url === "/api/repurpose") {
        return {
          ok: true,
          json: async () => repurposePayload
        };
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });
  }

  function findRepurposeRequest(fetchMock: ReturnType<typeof vi.fn>) {
    return fetchMock.mock.calls.find(([input]) => String(input) === "/api/repurpose");
  }

  afterEach(() => {
    cleanup();
    buildXiaohongshuDraftPayloadMock.mockReset();
    sendDraftToXiaohongshuBridgeMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("renders labeled platform, tone and personalized prompt controls", () => {
    vi.stubGlobal("fetch", createWorkspaceFetchMock({ results: [] }));
    render(<HomePage user={user} />);

    fireEvent.click(screen.getByText("写作偏好"));
    expect(screen.getByText("个性化要求")).toBeTruthy();
    expect(
      screen.getByRole("group", { name: "目标平台" })
    ).toBeTruthy();
    expect(
      screen.getByRole("group", { name: "语气风格" })
    ).toBeTruthy();
    expect(screen.getByLabelText("个性化要求输入框")).toBeTruthy();
  });

  it("sends customInstruction in the repurpose request body", async () => {
    const fetchMock = createWorkspaceFetchMock({ results: [] });

    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage user={user} />);

    fireEvent.change(screen.getByLabelText("待重制的原始文本"), {
      target: { value: "A valid source article" }
    });
    fireEvent.change(screen.getByLabelText("个性化要求输入框"), {
      target: { value: "更像创始人发言" }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始重制" }));

    await waitFor(() => expect(findRepurposeRequest(fetchMock)).toBeTruthy());
    expect(String(findRepurposeRequest(fetchMock)?.[1]?.body)).toContain("更像创始人发言");
    expect(String(findRepurposeRequest(fetchMock)?.[1]?.body)).toContain(
      '"platforms":["twitter"]'
    );
  });

  it("shows generation progress and restores the result view after completion", async () => {
    let finish: (value: unknown) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/drafts") {
        return { ok: true, json: async () => ({ drafts: [] }) };
      }
      return new Promise(resolve => { finish = resolve; });
    }));
    render(<HomePage user={user} />);
    fireEvent.change(screen.getByLabelText("待重制的原始文本"), {
      target: { value: "A source article" }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始重制" }));
    expect(await screen.findByText("正在酝酿新的表达…")).toBeTruthy();
    expect(screen.getByRole("region", { name: "ReContent" }).getAttribute("aria-busy")).toBe("true");
    finish({ ok: true, json: async () => ({ results: [{ platform: "twitter", content: "Generated draft" }] }) });
    expect(await screen.findByText("Generated draft")).toBeTruthy();
    expect(screen.queryByText("正在酝酿新的表达…")).toBeNull();
  });

  it("sends only the actively selected platform in the repurpose request body", async () => {
    const fetchMock = createWorkspaceFetchMock({ results: [] });

    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage user={user} />);

    fireEvent.change(screen.getByLabelText("待重制的原始文本"), {
      target: { value: "A valid source article" }
    });
    fireEvent.change(screen.getByRole("combobox", { name: "目标平台" }), { target: { value: "xiaohongshu" } });
    fireEvent.click(screen.getByRole("button", { name: "开始重制" }));

    await waitFor(() => expect(findRepurposeRequest(fetchMock)).toBeTruthy());
    expect(String(findRepurposeRequest(fetchMock)?.[1]?.body)).toContain(
      '"platforms":["xiaohongshu"]'
    );
  });

  it("saves a brand-new draft without sending a null draftId", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/drafts" && !init?.method) {
        return {
          ok: true,
          json: async () => ({ drafts: [] })
        };
      }

      if (url === "/api/drafts" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            draft: {
              id: "draft-1",
              name: "Saved draft",
              inputMode: "text",
              sourceText: "Draft body",
              sourceUrl: "",
              selectedPlatform: "twitter",
              tone: "neutral",
              customInstruction: "",
              results: [],
              activePlatform: null,
              createdAt: "2026-08-16T08:00:00.000Z",
              updatedAt: "2026-08-16T08:00:00.000Z"
            }
          })
        };
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage user={user} />);

    fireEvent.change(screen.getByLabelText("待重制的原始文本"), {
      target: { value: "Draft body" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.find(
          ([input, init]) => String(input) === "/api/drafts" && init?.method === "POST"
        )
      ).toBeTruthy()
    );

    expect(
      String(
        fetchMock.mock.calls.find(
          ([input, init]) => String(input) === "/api/drafts" && init?.method === "POST"
        )?.[1]?.body
      )
    ).not.toContain('"draftId":null');
  });

  it("shows the send-to-draft action on xiaohongshu results", async () => {
    const fetchMock = createWorkspaceFetchMock({
      results: [{ platform: "xiaohongshu", title: "标题", content: "正文" }]
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage user={user} />);

    fireEvent.change(screen.getByLabelText("待重制的原始文本"), {
      target: { value: "source article" }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始重制" }));

    expect(
      await screen.findByRole("button", { name: "发送到小红书草稿" })
    ).toBeTruthy();
  });

  it("shows install guidance when the extension is unavailable", async () => {
    const fetchMock = createWorkspaceFetchMock({
      results: [{ platform: "xiaohongshu", title: "标题", content: "正文" }]
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
      message: "未检测到小红书草稿浏览器扩展，请先安装后再发送。"
    });

    render(<HomePage user={user} />);

    fireEvent.change(screen.getByLabelText("待重制的原始文本"), {
      target: { value: "source article" }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始重制" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "发送到小红书草稿" })
    );

    expect(
      await screen.findByText("未检测到小红书草稿浏览器扩展，请先安装后再发送。")
    ).toBeTruthy();
    expect(
      screen.getByText(
        "该功能目前仅支持 Chrome / Edge 桌面版，用于帮你打开小红书创作页并自动填入内容。"
      )
    ).toBeTruthy();
    expect(screen.getByText("安装方式")).toBeTruthy();
    expect(screen.getByText("1. 打开 chrome://extensions")).toBeTruthy();
    expect(screen.getByText("2. 开启右上角“开发者模式”")).toBeTruthy();
    expect(
      screen.getByText("3. 加载 extensions/xiaohongshu-draft-bridge 目录")
    ).toBeTruthy();
    expect(
      screen.getByText("你仍然可以先点“复制内容”，手动粘贴到小红书创作页。")
    ).toBeTruthy();
  });

  it("renders login required feedback from the bridge", async () => {
    const fetchMock = createWorkspaceFetchMock({
      results: [{ platform: "xiaohongshu", title: "标题", content: "正文" }]
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

    render(<HomePage user={user} />);

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
    const fetchMock = createWorkspaceFetchMock({
      results: [{ platform: "xiaohongshu", title: "标题", content: "正文" }]
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

    render(<HomePage user={user} />);

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
    const fetchMock = createWorkspaceFetchMock({
      results: [{ platform: "xiaohongshu", title: "标题", content: "正文" }]
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

    render(<HomePage user={user} />);

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
    const fetchMock = createWorkspaceFetchMock({
      results: [{ platform: "linkedin", content: "正文" }]
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage user={user} />);

    fireEvent.change(screen.getByLabelText("待重制的原始文本"), {
      target: { value: "source article" }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始重制" }));

    await screen.findByRole("heading", { name: "正文" });
    expect(
      screen.queryByRole("button", { name: "发送到小红书草稿" })
    ).toBeNull();
  });

  it("ignores duplicate send clicks while a draft request is already opening", async () => {
    const fetchMock = createWorkspaceFetchMock({
      results: [{ platform: "xiaohongshu", title: "标题", content: "正文" }]
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

    render(<HomePage user={user} />);

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
