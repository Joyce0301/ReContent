import { describe, expect, it } from "vitest";
import {
  createAvatarObjectKeys,
  parseAvatarStagingKey
} from "./object-key";

describe("createAvatarObjectKeys", () => {
  it("creates paired user-scoped object keys from a supplied test id", () => {
    expect(
      createAvatarObjectKeys({
        userId: "user-1",
        extension: "webp",
        id: "upload-1"
      })
    ).toEqual({
      stagingKey: "original/pending/user-1/upload-1.webp",
      confirmedKey: "original/confirmed/user-1/upload-1.webp"
    });
  });

  it("uses a UUID by default", () => {
    const keys = createAvatarObjectKeys({
      userId: "user-1",
      extension: "jpg"
    });

    expect(keys.stagingKey).toMatch(
      /^original\/pending\/user-1\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i
    );
    expect(keys.confirmedKey).toBe(
      keys.stagingKey.replace("original/pending/", "original/confirmed/")
    );
  });

  it("rejects unsupported extensions at runtime", () => {
    expect(() =>
      createAvatarObjectKeys({
        userId: "user-1",
        extension: "gif" as "png",
        id: "file-id"
      })
    ).toThrow("Avatar extension must be jpg, png, or webp");
  });

  it.each(["", "/", "\\", "..", "user/name", "user\\name", "user..name"])(
    "rejects unsafe user segments: %j",
    userId => {
      expect(() =>
        createAvatarObjectKeys({
          userId,
          extension: "png",
          id: "file-id"
        })
      ).toThrow("Object key segments must be non-empty and safe");
    }
  );

  it.each(["", "/", "\\", "..", "file/name", "file\\name", "file..name"])(
    "rejects unsafe id segments: %j",
    id => {
      expect(() =>
        createAvatarObjectKeys({
          userId: "user-1",
          extension: "png",
          id
        })
      ).toThrow("Object key segments must be non-empty and safe");
    }
  );
});

describe("parseAvatarStagingKey", () => {
  it("parses a matching staging key into its confirmed key", () => {
    expect(
      parseAvatarStagingKey(
        "original/pending/user-1/upload-1.webp",
        "user-1"
      )
    ).toEqual({
      userId: "user-1",
      uploadId: "upload-1",
      extension: "webp",
      confirmedKey: "original/confirmed/user-1/upload-1.webp"
    });
  });

  it.each([
    "original/pending//upload-1.webp",
    "original/pending/user-1/.webp",
    "original/pending/user-1/upload/1.webp",
    "original/pending/user\\1/upload-1.webp",
    "original/pending/user-1/upload\\1.webp",
    "original/pending/user-1/..webp",
    "original/confirmed/user-1/upload-1.webp",
    "avatars/originals/user-1/upload-1.webp",
    "original/pending/user-1/upload-1.webp/extra",
    "original/pending/user-1/upload-1.gif",
    "original/pending/another-user/upload-1.webp"
  ])("rejects unsafe or mismatched key %j", key => {
    expect(parseAvatarStagingKey(key, "user-1")).toBeNull();
  });

  it("rejects an unsafe expected user id", () => {
    expect(
      parseAvatarStagingKey(
        "original/pending/user-1/upload-1.webp",
        "user/1"
      )
    ).toBeNull();
  });
});
