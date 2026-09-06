import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { queryAll, queryOne, execute } from "../auth/db";
import type { WorkspaceDraftRecord, WorkspaceDraftSnapshot } from "./types";

type DraftRow = RowDataPacket & {
  id: string;
  user_id: string;
  name: string;
  input_mode: WorkspaceDraftRecord["inputMode"];
  source_text: string;
  source_url: string;
  selected_platform: WorkspaceDraftRecord["selectedPlatform"];
  tone: WorkspaceDraftRecord["tone"];
  custom_instruction: string;
  results_json: string;
  active_platform: WorkspaceDraftRecord["activePlatform"];
  created_at: Date | string;
  updated_at: Date | string;
};

function trimToLength(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function deriveDraftName(snapshot: WorkspaceDraftSnapshot) {
  const result = snapshot.results.find(item => item.platform === snapshot.activePlatform) ?? snapshot.results[0];
  const generatedTitle = result?.title?.trim() || result?.content.split("\n").map(line => line.trim()).find(Boolean);
  if (generatedTitle) return trimToLength(generatedTitle, 80);

  if (snapshot.inputMode === "url" && snapshot.sourceUrl.trim()) {
    try {
      const url = new URL(snapshot.sourceUrl.trim());
      const path = trimToLength(
        url.pathname.replace(/^\/+/, "") || url.hostname,
        52
      );
      return trimToLength(`${url.hostname} / ${path}`, 80);
    } catch {
      return trimToLength(snapshot.sourceUrl, 80);
    }
  }

  const firstLine = snapshot.sourceText
    .split("\n")
    .map(line => line.trim())
    .find(Boolean);

  if (firstLine) {
    return trimToLength(firstLine, 80);
  }

  return "未命名草稿";
}

function toIsoString(value: Date | string) {
  return new Date(value).toISOString();
}

function mapDraftRow(row: DraftRow): WorkspaceDraftRecord {
  return {
    id: row.id,
    name: row.name,
    inputMode: row.input_mode,
    sourceText: row.source_text,
    sourceUrl: row.source_url,
    selectedPlatform: row.selected_platform,
    tone: row.tone,
    customInstruction: row.custom_instruction,
    results: JSON.parse(row.results_json) as WorkspaceDraftRecord["results"],
    activePlatform: row.active_platform,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

export async function listDraftsByUserId(userId: string, offset = 0) {
  const rows = await queryAll<DraftRow>(
    `SELECT id, user_id, name, input_mode, source_text, source_url,
            selected_platform, tone, custom_instruction, results_json,
            active_platform, created_at, updated_at
       FROM drafts
      WHERE user_id = ?
      ORDER BY updated_at DESC, id DESC
      LIMIT 21 OFFSET ?`,
    [userId, offset]
  );

  return rows.map(mapDraftRow);
}

async function findDraftByIdForUser(draftId: string, userId: string) {
  const row = await queryOne<DraftRow>(
    `SELECT id, user_id, name, input_mode, source_text, source_url,
            selected_platform, tone, custom_instruction, results_json,
            active_platform, created_at, updated_at
       FROM drafts
      WHERE id = ? AND user_id = ?
      LIMIT 1`,
    [draftId, userId]
  );

  return row ? mapDraftRow(row) : null;
}

export async function saveDraftForUser(input: {
  draftId?: string;
  userId: string;
  snapshot: WorkspaceDraftSnapshot;
}) {
  const draftId = input.draftId ?? randomUUID();
  const name = deriveDraftName(input.snapshot);
  const values = [
    name,
    input.snapshot.inputMode,
    input.snapshot.sourceText,
    input.snapshot.sourceUrl,
    input.snapshot.selectedPlatform,
    input.snapshot.tone,
    input.snapshot.customInstruction,
    JSON.stringify(input.snapshot.results),
    input.snapshot.activePlatform,
    draftId,
    input.userId
  ] as const;

  const [result] = await execute(
    `UPDATE drafts
        SET name = ?,
            input_mode = ?,
            source_text = ?,
            source_url = ?,
            selected_platform = ?,
            tone = ?,
            custom_instruction = ?,
            results_json = ?,
            active_platform = ?,
            updated_at = UTC_TIMESTAMP()
      WHERE id = ? AND user_id = ?`,
    [...values]
  );

  if ((result as ResultSetHeader).affectedRows === 0) {
    const insertDraftId = input.draftId ? randomUUID() : draftId;

    await execute(
      `INSERT INTO drafts (
          id,
          user_id,
          name,
          input_mode,
          source_text,
          source_url,
          selected_platform,
          tone,
          custom_instruction,
          results_json,
          active_platform
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        insertDraftId,
        input.userId,
        name,
        input.snapshot.inputMode,
        input.snapshot.sourceText,
        input.snapshot.sourceUrl,
        input.snapshot.selectedPlatform,
        input.snapshot.tone,
        input.snapshot.customInstruction,
        JSON.stringify(input.snapshot.results),
        input.snapshot.activePlatform
      ]
    );

    const savedDraft = await findDraftByIdForUser(insertDraftId, input.userId);

    if (!savedDraft) {
      throw new Error("Draft save succeeded but the record could not be reloaded.");
    }

    return savedDraft;
  }

  const savedDraft = await findDraftByIdForUser(draftId, input.userId);

  if (!savedDraft) {
    throw new Error("Draft save succeeded but the record could not be reloaded.");
  }

  return savedDraft;
}
