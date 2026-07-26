import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthStorageUnavailableError } from "./errors";

const { queryOneMock } = vi.hoisted(() => ({
  queryOneMock: vi.fn()
}));

vi.mock("./db", () => ({
  execute: vi.fn(),
  queryOne: queryOneMock
}));

import { findUserByEmail, findUserById } from "./user-store";

const baseRow = {
  id: "user-1",
  email: "user@example.com",
  password_hash: "hashed-password",
  display_name: "Example User",
  created_at: new Date("2026-07-20T01:02:03.000Z")
};

describe("user-store avatar metadata", () => {
  beforeEach(() => {
    queryOneMock.mockReset();
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
