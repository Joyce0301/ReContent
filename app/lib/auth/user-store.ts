import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { execute, queryOne } from "./db";
import { formatMysqlUtcDatetime } from "./mysql-datetime";
import type { AuthUserRecord } from "./types";

type AuthUserRow = RowDataPacket & {
  created_at: Date | string;
  display_name: string;
  email: string;
  id: string;
  password_hash: string;
};

function mapUserRow(row: AuthUserRow | null): AuthUserRecord | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    createdAt: new Date(row.created_at).toISOString()
  };
}

export async function findUserByEmail(email: string) {
  const row = await queryOne<AuthUserRow>(
    `SELECT id, email, password_hash, display_name, created_at
     FROM users
     WHERE email = ?
     LIMIT 1`,
    [email]
  );

  return mapUserRow(row);
}

export async function findUserById(id: string) {
  const row = await queryOne<AuthUserRow>(
    `SELECT id, email, password_hash, display_name, created_at
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  return mapUserRow(row);
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  displayName: string;
}) {
  const existingUser = await findUserByEmail(input.email);

  if (existingUser) {
    return { ok: false as const, error: "EMAIL_EXISTS" };
  }

  const id = randomUUID();
  const createdAt = new Date();

  try {
    await execute(
      `INSERT INTO users (id, email, password_hash, display_name, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        id,
        input.email,
        input.passwordHash,
        input.displayName,
        formatMysqlUtcDatetime(createdAt)
      ]
    );
  } catch (error) {
    const cause =
      typeof error === "object" && error !== null && "cause" in error
        ? (error as { cause?: { code?: string; errno?: number } }).cause
        : undefined;

    if (cause?.code === "ER_DUP_ENTRY" || cause?.errno === 1062) {
      return { ok: false as const, error: "EMAIL_EXISTS" };
    }

    throw error;
  }

  return {
    ok: true as const,
    value: {
      id,
      email: input.email,
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      createdAt: createdAt.toISOString()
    }
  };
}
