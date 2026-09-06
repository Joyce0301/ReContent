import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), campaign: vi.fn(), workflow: vi.fn() }));
vi.mock("../../lib/auth/session", () => ({ getAuthSession: mocks.session }));
vi.mock("../../lib/campaigns/store", async importOriginal => ({ ...await importOriginal<typeof import("../../lib/campaigns/store")>(), requireCampaignForUser: mocks.campaign }));
vi.mock("./workflow", async importOriginal => ({ ...await importOriginal<typeof import("./workflow")>(), runRepurposeWorkflow: mocks.workflow }));
vi.mock("server-only", () => ({}));
import { POST } from "./route";
import { CampaignNotFoundError } from "../../lib/campaigns/store";
import { buildRepurposeUserPrompt } from "./prompt-builder";

const id = "11111111-1111-4111-8111-111111111111";
const campaign = { id, name: "Launch", goal: "Trial signups", audience: "Creators", keyMessage: "Verified product facts", cta: "Try now", sourceText: "Real material", sourceUrl: "https://example.com" };
const request = (extra: object) => new Request("http://localhost/api/repurpose", { method: "POST", body: JSON.stringify({ mode: "text", text: "Facts", platforms: ["twitter"], tone: "neutral", ...extra }) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "owner" } });
  mocks.campaign.mockResolvedValue(campaign);
  mocks.workflow.mockResolvedValue({ results: [] });
});
it("uses the saved brief, never a client-supplied brief or owner", async () => {
  expect((await POST(request({ campaignId: id, campaign: { goal: "Forged" }, userId: "attacker" }))).status).toBe(200);
  expect(mocks.campaign).toHaveBeenCalledWith(id, "owner");
  expect(mocks.workflow).toHaveBeenCalledWith(expect.objectContaining({ campaign, userId: "owner" }));
});
it("blocks generation for unknown or cross-account campaigns", async () => {
  mocks.campaign.mockRejectedValue(new CampaignNotFoundError());
  expect((await POST(request({ campaignId: id }))).status).toBe(404);
  expect((await POST(request({ campaignId: 42 }))).status).toBe(400);
  expect(mocks.workflow).not.toHaveBeenCalled();
});
it("keeps independent generation free of campaign lookups", async () => {
  expect((await POST(request({}))).status).toBe(200);
  expect(mocks.campaign).not.toHaveBeenCalled();
});
it.each(["normal", "conservative"] as const)("includes factual campaign context in %s prompts", mode => {
  const prompt = buildRepurposeUserPrompt({ source: "Source", platform: "twitter", tone: "neutral", mode, campaign });
  expect(prompt).toContain('"goal":"Trial signups"');
  expect(prompt).toContain('"cta":"Try now"');
  expect(prompt).not.toContain('"id":');
  expect(prompt).toContain("不要编造");
});
