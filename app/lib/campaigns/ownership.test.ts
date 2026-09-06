import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ queryOne: vi.fn(), queryAll: vi.fn(), execute: vi.fn() }));
vi.mock("../auth/db", () => db);
import { listDraftsByUserId, saveDraftForUser } from "../drafts/store";
import { CampaignNotFoundError } from "./store";
import type { WorkspaceDraftSnapshot } from "../drafts/types";

const snapshot: WorkspaceDraftSnapshot = { campaignId: "11111111-1111-4111-8111-111111111111", inputMode: "text", sourceText: "Facts", sourceUrl: "", selectedPlatform: "twitter", tone: "neutral", customInstruction: "", results: [], activePlatform: null };
beforeEach(() => { vi.resetAllMocks(); });

it("rejects a cross-account campaign link before writing a draft", async () => {
  db.queryOne.mockResolvedValue(null);
  await expect(saveDraftForUser({ userId: "owner", snapshot })).rejects.toBeInstanceOf(CampaignNotFoundError);
  expect(db.queryOne).toHaveBeenCalledWith(expect.stringContaining("WHERE id = ? AND user_id = ?"), [snapshot.campaignId, "owner"]);
  expect(db.execute).not.toHaveBeenCalled();
});

it("filters campaign history by both campaign and owner", async () => {
  db.queryAll.mockResolvedValue([]);
  await listDraftsByUserId("owner", 20, snapshot.campaignId!);
  expect(db.queryAll).toHaveBeenCalledWith(expect.stringMatching(/WHERE user_id = \?\s+AND campaign_id = \?/), ["owner", snapshot.campaignId, 20]);
});
