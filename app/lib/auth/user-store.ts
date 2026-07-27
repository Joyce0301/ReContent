import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { normalizeAvatarStatus, type AvatarStatus } from "../avatar/types";
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

type AvatarMetadataRow = RowDataPacket & Pick<
  AuthUserRow,
  "avatar_key" | "avatar_status" | "avatar_updated_at"
>;

export type AvatarUploadState = {
  key: string | null;
  status: AvatarStatus;
  updatedAt: string | null;
};

async function didAffectExactlyOneRow(sql: string, values: Array<string | null>) {
  const [result] = await execute(sql, values);
  return (result as ResultSetHeader).affectedRows === 1;
}

async function acquireLeaseToken(sql: string, values: string[], token: string) {
  const [result] = await execute(sql, values);
  return (result as ResultSetHeader).affectedRows === 1 ? token : null;
}

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

export async function getAvatarUploadState(
  userId: string
): Promise<AvatarUploadState | null> {
  const row = await queryOne<AvatarMetadataRow>(
    `SELECT avatar_key, avatar_status, avatar_updated_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
    [userId]
  );

  if (!row) {
    return null;
  }

  return {
    key: row.avatar_key,
    status: normalizeAvatarStatus(row.avatar_status),
    updatedAt: row.avatar_updated_at
      ? (
          typeof row.avatar_updated_at === "string"
            ? parseMysqlUtcDatetime(row.avatar_updated_at)
            : row.avatar_updated_at
        ).toISOString()
      : null
  };
}

export async function reserveAvatarUpload(input: {
  userId: string;
  stagingKey: string;
}): Promise<boolean> {
  return didAffectExactlyOneRow(
    `UPDATE users
     SET avatar_key = ?,
         avatar_status = 'pending_upload',
         avatar_confirmation_token = NULL,
         avatar_updated_at = UTC_TIMESTAMP()
     WHERE id = ?
       AND (
         avatar_status IN ('not_uploaded', 'failed')
         OR (
           avatar_status = 'pending_upload'
           AND avatar_updated_at <= UTC_TIMESTAMP() - INTERVAL 5 MINUTE
         )
       )`,
    [input.stagingKey, input.userId]
  );
}

export async function acquireAvatarConfirmationLease(input: {
  userId: string;
  stagingKey: string;
}): Promise<string | null> {
  const token = randomUUID();

  return acquireLeaseToken(
    `UPDATE users
     SET avatar_status = 'confirming',
         avatar_confirmation_token = ?,
         avatar_updated_at = UTC_TIMESTAMP()
     WHERE id = ?
       AND avatar_key = ?
       AND (
         avatar_status = 'pending_upload'
         OR (
           avatar_status = 'confirming'
           AND avatar_updated_at <= UTC_TIMESTAMP() - INTERVAL 30 SECOND
         )
       )`,
    [token, input.userId, input.stagingKey],
    token
  );
}

export async function completeAvatarConfirmation(input: {
  userId: string;
  stagingKey: string;
  confirmedKey: string;
  leaseToken: string;
}): Promise<boolean> {
  return didAffectExactlyOneRow(
    `UPDATE users
     SET avatar_key = ?,
         avatar_status = 'uploaded',
         avatar_confirmation_token = NULL,
         avatar_updated_at = UTC_TIMESTAMP()
     WHERE id = ?
       AND avatar_key = ?
       AND avatar_status = 'confirming'
       AND avatar_confirmation_token = ?`,
    [input.confirmedKey, input.userId, input.stagingKey, input.leaseToken]
  );
}

export async function failPendingAvatarUpload(input: {
  userId: string;
  stagingKey: string;
}): Promise<boolean> {
  return didAffectExactlyOneRow(
    `UPDATE users
     SET avatar_status = 'failed',
         avatar_confirmation_token = NULL,
         avatar_updated_at = UTC_TIMESTAMP()
     WHERE id = ?
       AND avatar_key = ?
       AND avatar_status = 'pending_upload'`,
    [input.userId, input.stagingKey]
  );
}

export async function failAvatarConfirmation(input: {
  userId: string;
  stagingKey: string;
  leaseToken: string;
}): Promise<boolean> {
  return didAffectExactlyOneRow(
    `UPDATE users
     SET avatar_status = 'failed',
         avatar_confirmation_token = NULL,
         avatar_updated_at = UTC_TIMESTAMP()
     WHERE id = ?
       AND avatar_key = ?
       AND avatar_status = 'confirming'
       AND avatar_confirmation_token = ?`,
    [input.userId, input.stagingKey, input.leaseToken]
  );
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
