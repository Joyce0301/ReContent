// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Workspace from "./workspace-client";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const campaign = { id: "11111111-1111-4111-8111-111111111111", name: "新品发布", goal: "试用注册", audience: "内容创作者", keyMessage: "复用已有文案", cta: "立即试用", sourceText: "真实产品资料", sourceUrl: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };

it("creates an activity, generates an associated draft and restores it without generating again", async () => {
  let exists = false;
  let draft: object | null = null;
  const results = [{ platform: "twitter", content: "活动生成正文" }];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    let data;
    if (url === "/api/repurpose") data = { results };
    else if (url.startsWith("/api/campaigns")) {
      if (init?.method === "POST") exists = true;
      data = url.includes("?id=") || init ? { campaign } : { campaigns: exists ? [campaign] : [], nextOffset: null };
    } else if (init?.method === "POST") {
      draft = { ...JSON.parse(String(init.body)), id: "draft-id", name: "活动稿件标题", campaignName: campaign.name, createdAt: campaign.createdAt, updatedAt: campaign.updatedAt };
      data = { draft };
    } else data = { drafts: draft ? [draft] : [], nextOffset: null };
    return { ok: true, json: async () => data };
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<Workspace user={{ displayName: "Alex", email: "alex@example.com" }} />);
  await screen.findByText("还没有创作记录");
  fireEvent.click(screen.getByRole("button", { name: "营销活动" }));
  await screen.findByText("还没有营销活动");
  fireEvent.click(screen.getByRole("button", { name: "新建活动" }));
  for (const [label, value] of [["活动名称", campaign.name], ["营销目标", campaign.goal], ["目标受众", campaign.audience], ["核心信息", campaign.keyMessage]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.click(screen.getByRole("button", { name: "新建创作" }));
  expect(confirm).toHaveBeenCalled();
  expect(screen.getByLabelText("活动名称")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "保存活动" }));
  await screen.findByRole("heading", { name: campaign.name });
  await screen.findByText("还没有活动稿件");
  fireEvent.click(screen.getByRole("button", { name: "创作内容" }));
  expect((screen.getByLabelText("待重制的原始文本") as HTMLTextAreaElement).value).toBe(campaign.sourceText);
  fireEvent.click(screen.getByRole("button", { name: "开始重制" }));
  await screen.findByText("已保存到个人历史");
  for (const url of ["/api/repurpose", "/api/drafts"]) {
    const call = fetchMock.mock.calls.find(([path, init]) => path === url && init?.method === "POST");
    expect(JSON.parse(String(call?.[1]?.body)).campaignId).toBe(campaign.id);
  }
  fireEvent.click(screen.getByRole("button", { name: campaign.name }));
  const panel = await screen.findByRole("region", { name: "营销活动" });
  fireEvent.click(await within(panel).findByRole("button", { name: /活动稿件标题/ }));
  expect(await screen.findByText("活动生成正文")).toBeTruthy();
  expect(fetchMock.mock.calls.filter(([url]) => url === "/api/repurpose")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "新建创作" }));
  expect(screen.queryByRole("button", { name: campaign.name })).toBeNull();
  await waitFor(() => expect(screen.getByRole("heading", { name: "今天，想创作什么？" })).toBeTruthy());
});
