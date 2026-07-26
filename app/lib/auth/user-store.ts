import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { normalizeAvatarStatus } from "../avatar/types";
import { execute, queryOne } from "./db";
import {
  formatMysqlUtcDatetime,
  parseMysqlUtcDatetime
} from "./mysql-datetime";
import type { AuthUserRecord } from "./types";

type LegacyAuthUserRow = RowDataPacket & {
  created_at: Date | string;
  display_name: string;
  email: string;
  id: string;
  password_hash: string;
};

type AuthUserRow = LegacyAuthUserRow & {
  avatar_key: string | null;
  avatar_status: string;
  avatar_updated_at: Date | string | null;
};

type AvatarMetadataRow = Pick<
  AuthUserRow,
  "avatar_key" | "avatar_status" | "avatar_updated_at"
>;

function mapUserRow(
  row: LegacyAuthUserRow | null,
  avatarMetadata?: AvatarMetadataRow
): AuthUserRecord | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    avatarKey: avatarMetadata?.avatar_key ?? null,
    avatarStatus: normalizeAvatarStatus(avatarMetadata?.avatar_status),
    avatarUpdatedAt: avatarMetadata?.avatar_updated_at
      ? (
          typeof avatarMetadata.avatar_updated_at === "string"
            ? parseMysqlUtcDatetime(avatarMetadata.avatar_updated_at)
            : avatarMetadata.avatar_updated_at
        ).toISOString()
      : null,
    createdAt: new Date(row.created_at).toISOString()
  };
}

function isMissingAvatarColumnError(error: unknown) {
  const cause =
    typeof error === "object" && error !== null && "cause" in error
      ? (error as {
          cause?: {
            code?: string;
            errno?: number;
            message?: string;
            sqlMessage?: string;
          };
        }).cause
      : undefined;
  const isBadFieldError =
    cause?.code === "ER_BAD_FIELD_ERROR" && cause?.errno === 1054;
  const message = `${cause?.message ?? ""} ${cause?.sqlMessage ?? ""}`;

  return (
    isBadFieldError &&
    /\bavatar_(?:key|status|updated_at)\b/.test(message)
  );
}

async function findUserByColumn(column: "email" | "id", value: string) {
  try {
    const row = await queryOne<AuthUserRow>(
      `SELECT id, email, password_hash, display_name,
              avatar_key, avatar_status, avatar_updated_at, created_at
       FROM users
       WHERE ${column} = ?
       LIMIT 1`,
      [value]
    );

    return mapUserRow(row, row ?? undefined);
  } catch (error) {
    if (!isMissingAvatarColumnError(error)) {
      throw error;
    }
  }

  const legacyRow = await queryOne<LegacyAuthUserRow>(
    `SELECT id, email, password_hash, display_name,
            created_at
     FROM users
     WHERE ${column} = ?
     LIMIT 1`,
    [value]
  );

  return mapUserRow(legacyRow);
}

export async function findUserByEmail(email: string) {
  return findUserByColumn("email", email);
}

export async function findUserById(id: string) {
  return findUserByColumn("id", id);
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
      avatarKey: null,
      avatarStatus: "not_uploaded",
      avatarUpdatedAt: null,
      createdAt: createdAt.toISOString()
    }
  };
}
