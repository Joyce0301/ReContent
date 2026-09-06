import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createConnection } from "mysql2/promise";
import { expect, it, vi } from "vitest";
import { migrateCampaigns } from "./migrate-campaigns";
import { getAuthPool } from "../app/lib/auth/db";
import { saveCampaignForUser, findCampaignForUser } from "../app/lib/campaigns/store";
import { saveDraftForUser, listDraftsByUserId } from "../app/lib/drafts/store";
import type { WorkspaceDraftSnapshot } from "../app/lib/drafts/types";

it.skipIf(!process.env.CAMPAIGN_TEST_DATABASE_URL)("migrates twice without data loss and enforces ownership in real MySQL", async () => {
  const url = new URL(process.env.CAMPAIGN_TEST_DATABASE_URL!);
  const admin = await createConnection({ host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), multipleStatements: true });
  const database = "recontent_campaign_test_" + randomUUID().replaceAll("-", "");
  await admin.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  url.pathname = "/" + database;
  vi.stubEnv("DATABASE_URL", url.toString());
  const pool = getAuthPool();
  const connection = await pool.getConnection();
  try {
    await admin.query(`USE ${database}`);
    await admin.query(await readFile(new URL("../docs/auth/mysql-auth-schema.sql", import.meta.url), "utf8"));
    await admin.query("INSERT INTO users (id, email, password_hash, display_name) VALUES ('owner', 'owner@example.test', 'test', 'Owner'), ('other', 'other@example.test', 'test', 'Other')");
    await admin.query("INSERT INTO drafts (id,user_id,name,input_mode,source_text,source_url,selected_platform,tone,custom_instruction,results_json) VALUES ('legacy','owner','Existing draft','text','Original','','twitter','neutral','','[]')");
    await expect(migrateCampaigns(connection, true)).rejects.toThrow();
    await migrateCampaigns(connection);
    await migrateCampaigns(connection);
    await migrateCampaigns(connection, true);
    const legacy = (await listDraftsByUserId("owner")).find(draft => draft.id === "legacy");
    expect(legacy?.sourceText).toBe("Original");
    expect(legacy?.campaignId).toBeUndefined();
    const brief = { name: "Launch", goal: "Signups", audience: "Creators", keyMessage: "Reuse articles", cta: "Try", sourceText: "Facts", sourceUrl: "" };
    const campaign = await saveCampaignForUser("owner", brief);
    expect(await findCampaignForUser(campaign.id, "other")).toBeNull();
    const snapshot: WorkspaceDraftSnapshot = { campaignId: campaign.id, inputMode: "text", sourceText: "Facts", sourceUrl: "", selectedPlatform: "twitter", tone: "neutral", customInstruction: "", results: [{ platform: "twitter", content: "Saved output" }], activePlatform: "twitter" };
    const draft = await saveDraftForUser({ userId: "owner", snapshot });
    expect(draft.campaignId).toBe(campaign.id);
    expect((await listDraftsByUserId("owner", 0, campaign.id))).toHaveLength(1);
    expect((await listDraftsByUserId("other", 0, campaign.id))).toHaveLength(0);
    await expect(saveDraftForUser({ userId: "other", snapshot })).rejects.toThrow("无权访问");
    await expect(admin.query("UPDATE drafts SET user_id = 'other' WHERE id = ?", [draft.id])).rejects.toMatchObject({ code: "ER_NO_REFERENCED_ROW_2" });
    await saveCampaignForUser("owner", { ...brief, goal: "New goal" }, campaign.id);
    expect((await listDraftsByUserId("owner", 0, campaign.id))[0]?.results).toEqual(snapshot.results);
    const { campaignId: _campaignId, ...oldClient } = snapshot;
    const updated = await saveDraftForUser({ userId: "owner", draftId: draft.id, snapshot: oldClient });
    expect(updated.campaignId).toBe(campaign.id);
    await admin.query("DELETE FROM users WHERE id = 'owner'");
    expect(await findCampaignForUser(campaign.id, "owner")).toBeNull();
  } finally {
    connection.release();
    await pool.end();
    await admin.query(`DROP DATABASE ${database}`);
    await admin.end();
    vi.unstubAllEnvs();
  }
}, 30000);
