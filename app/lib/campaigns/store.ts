import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { execute, queryAll, queryOne } from "../auth/db";
import type { Campaign, CampaignBrief } from "./types";

type CampaignRow = RowDataPacket & Omit<Campaign, "createdAt" | "updatedAt"> & {
  createdAt: Date;
  updatedAt: Date;
};

const COLUMNS = `id, name, goal, audience, key_message AS keyMessage, cta,
  source_text AS sourceText, source_url AS sourceUrl,
  created_at AS createdAt, updated_at AS updatedAt`;

function mapCampaign(row: CampaignRow): Campaign {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export class CampaignNotFoundError extends Error {
  constructor() { super("活动不存在或无权访问"); this.name = "CampaignNotFoundError"; }
}

export async function findCampaignForUser(id: string, userId: string) {
  const row = await queryOne<CampaignRow>(`SELECT ${COLUMNS} FROM campaigns WHERE id = ? AND user_id = ?`, [id, userId]);
  return row ? mapCampaign(row) : null;
}

export async function requireCampaignForUser(id: string, userId: string) {
  const campaign = await findCampaignForUser(id, userId);
  if (!campaign) throw new CampaignNotFoundError();
  return campaign;
}

export async function listCampaignsForUser(userId: string, offset: number) {
  const rows = await queryAll<CampaignRow>(`SELECT ${COLUMNS} FROM campaigns WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 21 OFFSET ?`, [userId, offset]);
  return rows.map(mapCampaign);
}

export async function saveCampaignForUser(userId: string, brief: CampaignBrief, id?: string) {
  const values = [brief.name, brief.goal, brief.audience, brief.keyMessage, brief.cta, brief.sourceText, brief.sourceUrl];
  if (id) {
    await requireCampaignForUser(id, userId);
    await execute(`UPDATE campaigns SET name = ?, goal = ?, audience = ?, key_message = ?, cta = ?, source_text = ?, source_url = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND user_id = ?`, [...values, id, userId]);
  } else {
    id = randomUUID();
    await execute(`INSERT INTO campaigns (name, goal, audience, key_message, cta, source_text, source_url, id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [...values, id, userId]);
  }
  return requireCampaignForUser(id, userId);
}
