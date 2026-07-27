import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthStorageUnavailableError } from "./errors";

const { executeMock, queryOneMock, randomUUIDMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  queryOneMock: vi.fn(),
  randomUUIDMock: vi.fn()
}));

vi.mock("./db", () => ({
  execute: executeMock,
  queryOne: queryOneMock
}));

vi.mock("node:crypto", () => ({
  randomUUID: randomUUIDMock
}));

import {
  acquireAvatarConfirmationLease,
  completeAvatarConfirmation,
  failAvatarConfirmation,
  failPendingAvatarUpload,
  findUserByEmail,
  findUserById,
  getAvatarUploadState,
  reserveAvatarUpload
} from "./user-store";

const baseRow = {
  id: "user-1",
  email: "user@example.com",
  password_hash: "hashed-password",
  display_name: "Example User",
  created_at: new Date("2026-07-20T01:02:03.000Z")
};

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}

describe("user-store avatar metadata", () => {
  beforeEach(() => {
    executeMock.mockReset();
    queryOneMock.mockReset();
    randomUUIDMock.mockReset();
  });

  it("maps nullable avatar metadata from a user lookup", async () => {
    queryOneMock.mockResolvedValue({
      ...baseRow,
      avatar_key: null,
      avatar_status: "not_uploaded",
      avatar_updated_at: null
    });

    await expect(findUserById("user-1")).resolves.toMatchObject({
      avatarKey: null,
      avatarStatus: "not_uploaded",
      avatarUpdatedAt: null
    });
    expect(queryOneMock.mock.calls[0][0]).toContain(
      "avatar_key, avatar_status, avatar_updated_at"
    );
  });

  it("maps a known pending status and converts the update date to ISO", async () => {
    queryOneMock.mockResolvedValue({
      ...baseRow,
      avatar_key: "avatars/user-1/source.png",
      avatar_status: "pending_upload",
      avatar_updated_at: "2026-07-26 08:09:10"
    });

    await expect(findUserByEmail("user@example.com")).resolves.toMatchObject({
      avatarKey: "avatars/user-1/source.png",
      avatarStatus: "pending_upload",
      avatarUpdatedAt: "2026-07-26T08:09:10.000Z"
    });
    expect(queryOneMock.mock.calls[0][0]).toContain(
      "avatar_key, avatar_status, avatar_updated_at"
    );
  });

  it("falls back when the stored avatar status is unknown", async () => {
    queryOneMock.mockResolvedValue({
      ...baseRow,
      avatar_key: "avatars/user-1/source.png",
      avatar_status: "unexpected",
      avatar_updated_at: null
    });

    await expect(findUserById("user-1")).resolves.toMatchObject({
      avatarStatus: "not_uploaded"
    });
  });

  it.each([
    {
      lookup: () => findUserByEmail("user@example.com"),
      parameter: "user@example.com",
      whereClause: "WHERE email = ?"
    },
    {
      lookup: () => findUserById("user-1"),
      parameter: "user-1",
      whereClause: "WHERE id = ?"
    }
  ])(
    "retries a legacy $whereClause lookup when avatar columns are missing",
    async ({ lookup, parameter, whereClause }) => {
      queryOneMock
        .mockRejectedValueOnce(
          new AuthStorageUnavailableError("Unable to query.", {
            cause: {
              code: "ER_BAD_FIELD_ERROR",
              errno: 1054,
              sqlMessage: "Unknown column 'avatar_key' in 'field list'"
            }
          })
        )
        .mockResolvedValueOnce(baseRow);

      await expect(lookup()).resolves.toMatchObject({
        avatarKey: null,
        avatarStatus: "not_uploaded",
        avatarUpdatedAt: null
      });
      expect(queryOneMock).toHaveBeenCalledTimes(2);
      expect(queryOneMock.mock.calls[0][0]).toContain("avatar_key");
      expect(queryOneMock.mock.calls[1][0]).toContain(whereClause);
      expect(queryOneMock.mock.calls[1][0]).not.toContain("avatar_key");
      expect(queryOneMock.mock.calls[1][1]).toEqual([parameter]);
    }
  );

  it("rethrows non-1054 database errors without a legacy retry", async () => {
    const error = new AuthStorageUnavailableError("Unable to query.", {
      cause: {
        code: "ER_BAD_FIELD_ERROR",
        errno: 9999,
        sqlMessage: "Unknown column 'avatar_key' in 'field list'"
      }
    });
    queryOneMock.mockRejectedValueOnce(error);

    await expect(findUserById("user-1")).rejects.toBe(error);
    expect(queryOneMock).toHaveBeenCalledTimes(1);
  });

  it("rethrows 1054 errors for non-avatar columns without a legacy retry", async () => {
    const error = new AuthStorageUnavailableError("Unable to query.", {
      cause: {
        code: "ER_BAD_FIELD_ERROR",
        errno: 1054,
        sqlMessage: "Unknown column 'unrelated_column' in 'field list'"
      }
    });
    queryOneMock.mockRejectedValueOnce(error);

    await expect(findUserByEmail("user@example.com")).rejects.toBe(error);
    expect(queryOneMock).toHaveBeenCalledTimes(1);
  });
});

describe("user-store avatar upload state machine", () => {
  const stagingKey = "original/pending/user-1/upload-1.webp";

  beforeEach(() => {
    executeMock.mockReset();
    queryOneMock.mockReset();
    randomUUIDMock.mockReset();
  });

  it("reads avatar upload state by user id", async () => {
    queryOneMock.mockResolvedValue({
      avatar_key: stagingKey,
      avatar_status: "confirming",
      avatar_updated_at: "2026-07-27 08:09:10"
    });

    await expect(getAvatarUploadState("user-1")).resolves.toEqual({
      key: stagingKey,
      status: "confirming",
      updatedAt: "2026-07-27T08:09:10.000Z"
    });
    expect(queryOneMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "SELECT avatar_key, avatar_status, avatar_updated_at\n       FROM users\n       WHERE id = ?\n       LIMIT 1"
      ),
      ["user-1"]
    );
  });

  it("reserves a staging key only from an available or stale pending state", async () => {
    executeMock.mockResolvedValue([{ affectedRows: 1 }, []]);

    await expect(
      reserveAvatarUpload({ userId: "user-1", stagingKey })
    ).resolves.toBe(true);
    expect(normalizeSql(executeMock.mock.calls[0][0])).toBe(
      "UPDATE users SET avatar_key = ?, avatar_status = 'pending_upload', avatar_confirmation_token = NULL, avatar_updated_at = UTC_TIMESTAMP() WHERE id = ? AND ( avatar_status IN ('not_uploaded', 'failed') OR ( avatar_status = 'pending_upload' AND avatar_updated_at <= UTC_TIMESTAMP() - INTERVAL 5 MINUTE ) )"
    );
    expect(executeMock.mock.calls[0][1]).toEqual([stagingKey, "user-1"]);
  });

  it("returns a fresh token after acquiring a pending or stale confirmation lease", async () => {
    executeMock.mockResolvedValue([{ affectedRows: 1 }, []]);
    randomUUIDMock.mockReturnValue("lease-token-1");

    await expect(
      acquireAvatarConfirmationLease({ userId: "user-1", stagingKey })
    ).resolves.toBe("lease-token-1");
    expect(normalizeSql(executeMock.mock.calls[0][0])).toBe(
      "UPDATE users SET avatar_status = 'confirming', avatar_confirmation_token = ?, avatar_updated_at = UTC_TIMESTAMP() WHERE id = ? AND avatar_key = ? AND ( avatar_status = 'pending_upload' OR ( avatar_status = 'confirming' AND avatar_updated_at <= UTC_TIMESTAMP() - INTERVAL 30 SECOND ) )"
    );
    expect(executeMock.mock.calls[0][1]).toEqual([
      "lease-token-1",
      "user-1",
      stagingKey
    ]);
  });

  it.each([0, 2])(
    "returns null when lease acquisition affects %i rows",
    async affectedRows => {
      executeMock.mockResolvedValue([{ affectedRows }, []]);
      randomUUIDMock.mockReturnValue("unused-token");

      await expect(
        acquireAvatarConfirmationLease({ userId: "user-1", stagingKey })
      ).resolves.toBeNull();
      expect(executeMock.mock.calls[0][1]).toEqual([
        "unused-token",
        "user-1",
        stagingKey
      ]);
    }
  );

  it("completes only the matching confirmation lease token", async () => {
    executeMock.mockResolvedValue([{ affectedRows: 1 }, []]);
    const confirmedKey = "original/confirmed/user-1/upload-1.webp";

    await expect(
      completeAvatarConfirmation({
        userId: "user-1",
        stagingKey,
        confirmedKey,
        leaseToken: "lease-token-1"
      })
    ).resolves.toBe(true);
    expect(normalizeSql(executeMock.mock.calls[0][0])).toBe(
      "UPDATE users SET avatar_key = ?, avatar_status = 'uploaded', avatar_confirmation_token = NULL, avatar_updated_at = UTC_TIMESTAMP() WHERE id = ? AND avatar_key = ? AND avatar_status = 'confirming' AND avatar_confirmation_token = ?"
    );
    expect(executeMock.mock.calls[0][1]).toEqual([
      confirmedKey,
      "user-1",
      stagingKey,
      "lease-token-1"
    ]);
  });

  it("fails only the matching pending staging key before a lease exists", async () => {
    executeMock.mockResolvedValue([{ affectedRows: 1 }, []]);

    await expect(
      failPendingAvatarUpload({ userId: "user-1", stagingKey })
    ).resolves.toBe(true);
    expect(normalizeSql(executeMock.mock.calls[0][0])).toBe(
      "UPDATE users SET avatar_status = 'failed', avatar_confirmation_token = NULL, avatar_updated_at = UTC_TIMESTAMP() WHERE id = ? AND avatar_key = ? AND avatar_status = 'pending_upload'"
    );
    expect(executeMock.mock.calls[0][1]).toEqual(["user-1", stagingKey]);
  });

  it("fails only the matching confirmation lease token", async () => {
    executeMock.mockResolvedValue([{ affectedRows: 1 }, []]);

    await expect(
      failAvatarConfirmation({
        userId: "user-1",
        stagingKey,
        leaseToken: "lease-token-1"
      })
    ).resolves.toBe(true);
    expect(normalizeSql(executeMock.mock.calls[0][0])).toBe(
      "UPDATE users SET avatar_status = 'failed', avatar_confirmation_token = NULL, avatar_updated_at = UTC_TIMESTAMP() WHERE id = ? AND avatar_key = ? AND avatar_status = 'confirming' AND avatar_confirmation_token = ?"
    );
    expect(executeMock.mock.calls[0][1]).toEqual([
      "user-1",
      stagingKey,
      "lease-token-1"
    ]);
  });

  it("rejects terminal writes from an owner whose stale lease was reacquired", async () => {
    randomUUIDMock.mockReturnValueOnce("owner-a-token").mockReturnValueOnce(
      "owner-b-token"
    );
    executeMock
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])
      .mockResolvedValueOnce([{ affectedRows: 0 }, []]);

    const ownerAToken = await acquireAvatarConfirmationLease({
      userId: "user-1",
      stagingKey
    });
    const ownerBToken = await acquireAvatarConfirmationLease({
      userId: "user-1",
      stagingKey
    });

    expect(ownerAToken).toBe("owner-a-token");
    expect(ownerBToken).toBe("owner-b-token");
    await expect(
      completeAvatarConfirmation({
        userId: "user-1",
        stagingKey,
        confirmedKey: "original/confirmed/user-1/upload-1.webp",
        leaseToken: ownerAToken!
      })
    ).resolves.toBe(false);
    await expect(
      failAvatarConfirmation({
        userId: "user-1",
        stagingKey,
        leaseToken: ownerAToken!
      })
    ).resolves.toBe(false);
    expect(executeMock.mock.calls[2][1]).toContain("owner-a-token");
    expect(executeMock.mock.calls[3][1]).toContain("owner-a-token");
  });

  it.each([0, 2])("treats %i affected rows as a lost state transition", async affectedRows => {
    executeMock.mockResolvedValue([{ affectedRows }, []]);

    await expect(
      reserveAvatarUpload({ userId: "user-1", stagingKey })
    ).resolves.toBe(false);
  });
});
