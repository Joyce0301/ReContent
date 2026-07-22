import type { RowDataPacket } from "mysql2/promise";
import { execute, queryOne } from "./db";
import { formatMysqlUtcDatetime } from "./mysql-datetime";
import type { AuthSessionRecord } from "./types";

type AuthSessionRow = RowDataPacket & {
  created_at: Date | string;
  expires_at: Date | string;
  id: string;
  user_id: string;
};

function mapSessionRow(row: AuthSessionRow | null): AuthSessionRecord | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    expiresAt: new Date(row.expires_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString()
  };
}

export async function createSessionRecord(input: {
  expiresAt: string;
  id: string;
  userId: string;
}) {
  const createdAt = new Date();

  await execute(
    `INSERT INTO sessions (id, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
    [
      input.id,
      input.userId,
      formatMysqlUtcDatetime(new Date(input.expiresAt)),
      formatMysqlUtcDatetime(createdAt)
    ]
  );

  return {
    id: input.id,
    userId: input.userId,
    expiresAt: input.expiresAt,
    createdAt: createdAt.toISOString()
  };
}

export async function findSessionRecordById(id: string) {
  const row = await queryOne<AuthSessionRow>(
    `SELECT id, user_id, expires_at, created_at
     FROM sessions
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  return mapSessionRow(row);
}

export async function deleteSessionRecordById(id: string) {
  await execute(`DELETE FROM sessions WHERE id = ?`, [id]);
}

export async function deleteExpiredSessions() {
  await execute(`DELETE FROM sessions WHERE expires_at <= UTC_TIMESTAMP()`, []);
}
