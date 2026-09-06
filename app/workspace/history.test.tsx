// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Workspace from "./workspace-client";
import type { WorkspaceDraftRecord } from "../lib/drafts/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const user = { displayName: "Alex", email: "alex@example.com" };
const saved: WorkspaceDraftRecord = {
  id: "history-1", name: "一篇文章的更多可能", inputMode: "text",
  sourceText: "原始文案", sourceUrl: "", selectedPlatform: "twitter", tone: "neutral",
  customInstruction: "", results: [{ platform: "twitter", content: "生成的正文" }],
  activePlatform: "twitter", createdAt: "2026-09-06T01:00:00Z", updatedAt: "2026-09-06T01:00:00Z"
};
const response = (data: unknown, ok = true) => ({ ok, json: async () => data });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function submit() {
  fireEvent.change(screen.getByLabelText("待重制的原始文本"), { target: { value: saved.sourceText } });
  fireEvent.click(screen.getByRole("button", { name: "开始重制" }));
}

it("automatically saves the submitted source and new result, then restores them from personal history", async () => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/repurpose") return response({ results: saved.results });
    return init?.method === "POST" ? response({ draft: saved }) : response({ drafts: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<Workspace user={user} />);
  await screen.findByText("还没有创作记录");
  submit();
  const history = await screen.findByRole("navigation", { name: "个人创作历史" });
  const item = await within(history).findByRole("button", { name: saved.name });
  const saveCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST" && String(init.body).includes('"inputMode"'));
  expect(JSON.parse(String(saveCall?.[1]?.body))).toMatchObject({ sourceText: saved.sourceText, results: saved.results });
  expect(JSON.parse(String(saveCall?.[1]?.body))).not.toHaveProperty("draftId");
  fireEvent.click(screen.getByRole("button", { name: "新建创作" }));
  expect(screen.queryByText("生成的正文")).toBeNull();
  expect((screen.getByLabelText("待重制的原始文本") as HTMLTextAreaElement).value).toBe("");
  fireEvent.click(item);
  expect(await screen.findByText("生成的正文")).toBeTruthy();
  expect((screen.getByLabelText("待重制的原始文本") as HTMLTextAreaElement).value).toBe(saved.sourceText);
  expect(fetchMock.mock.calls.filter(([url]) => url === "/api/repurpose")).toHaveLength(1);
});

it("retains generated content on a save failure and retries saving without another model call", async () => {
  let saves = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/repurpose") return response({ results: saved.results });
    if (init?.method === "POST") return ++saves === 1 ? response({ error: "暂时无法保存" }, false) : response({ draft: saved });
    return response({ drafts: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<Workspace user={user} />);
  await screen.findByText("还没有创作记录");
  submit();
  expect(await screen.findByText("生成的正文")).toBeTruthy();
  expect(await screen.findByText(/暂时无法保存/)).toBeTruthy();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.click(screen.getByRole("button", { name: "新建创作" }));
  expect(confirm).toHaveBeenCalled();
  expect(screen.getByText("生成的正文")).toBeTruthy();
  fireEvent.click(screen.getByRole("link", { name: "查看 Alex 的个人资料" }));
  expect(confirm).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "重试保存" }));
  await waitFor(() => expect(saves).toBe(2));
  expect(await screen.findByRole("button", { name: saved.name })).toBeTruthy();
  expect(fetchMock.mock.calls.filter(([url]) => url === "/api/repurpose")).toHaveLength(1);
});

it("does not persist failed generations and keeps the URL available for retry", async () => {
  const fetchMock = vi.fn(async (url: string) => url === "/api/repurpose"
    ? response({ error: "无法提取正文", errorCode: "url_extraction_failed", errorTitle: "链接解析失败", errorDetail: "请粘贴正文后重试" }, false)
    : response({ drafts: [] }));
  vi.stubGlobal("fetch", fetchMock);
  render(<Workspace user={user} />);
  await screen.findByText("还没有创作记录");
  fireEvent.click(screen.getByRole("radio", { name: "输入 URL" }));
  fireEvent.change(screen.getByLabelText("待抓取正文的链接地址"), { target: { value: "https://example.com/article" } });
  fireEvent.click(screen.getByRole("button", { name: "开始重制" }));
  expect(await screen.findByRole("dialog", { name: "链接解析失败" })).toBeTruthy();
  expect(fetchMock.mock.calls.filter(([url]) => url === "/api/drafts")).toHaveLength(1);
  expect((screen.getByLabelText("待抓取正文的链接地址") as HTMLInputElement).value).toBe("https://example.com/article");
});

it("creates a new history entry on regeneration without overwriting the restored record", async () => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/repurpose") return response({ results: saved.results });
    return init?.method === "POST" ? response({ draft: { ...saved, id: "history-2", name: "第二次生成" } }) : response({ drafts: [saved] });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<Workspace user={user} />);
  fireEvent.click(await screen.findByRole("button", { name: saved.name }));
  fireEvent.click(screen.getByRole("button", { name: "开始重制" }));
  expect(await screen.findByRole("button", { name: "第二次生成" })).toBeTruthy();
  expect(screen.getByRole("button", { name: saved.name })).toBeTruthy();
  const call = fetchMock.mock.calls.find(([url, init]) => url === "/api/drafts" && init?.method === "POST");
  expect(JSON.parse(String(call?.[1]?.body))).not.toHaveProperty("draftId");
});

it("blocks duplicate generation and history switching while a generation is in flight", async () => {
  let finish!: (value: unknown) => void;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/repurpose") return new Promise(resolve => { finish = resolve; });
    return init?.method === "POST" ? response({ draft: saved }) : response({ drafts: [saved] });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<Workspace user={user} />);
  await screen.findByRole("button", { name: saved.name });
  submit();
  expect((screen.getByRole("button", { name: "新建创作" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: saved.name }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText("待重制的原始文本") as HTMLTextAreaElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "正在重制" }));
  expect(fetchMock.mock.calls.filter(([url]) => url === "/api/repurpose")).toHaveLength(1);
  finish(response({ results: saved.results }));
  expect(await screen.findByText("生成的正文")).toBeTruthy();
});

it("appends older history and lets a fresh workspace restore a persisted record", async () => {
  const older = { ...saved, id: "old-2", name: "更早的内容" };
  const fetchMock = vi.fn(async (url: string) => response(url.includes("offset=20")
    ? { drafts: [older], nextOffset: null }
    : { drafts: [saved], nextOffset: 20 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<Workspace user={user} />);
  fireEvent.click(await screen.findByRole("button", { name: "加载更多" }));
  fireEvent.click(await screen.findByRole("button", { name: older.name }));
  expect(screen.getByRole("button", { name: saved.name })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "加载更多" })).toBeNull();
  expect(screen.getByText("生成的正文")).toBeTruthy();
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/drafts", "/api/drafts?offset=20"]);
});

it("offers a persistent retry when personal history cannot be loaded", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(response({ error: "历史服务暂时不可用" }, false))
    .mockResolvedValueOnce(response({ drafts: [saved], nextOffset: null }));
  vi.stubGlobal("fetch", fetchMock);
  render(<Workspace user={user} />);
  expect(await screen.findByText("历史服务暂时不可用")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "重试加载" }));
  expect(await screen.findByRole("button", { name: saved.name })).toBeTruthy();
  expect(screen.queryByText("历史服务暂时不可用")).toBeNull();
});
