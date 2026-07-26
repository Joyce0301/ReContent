import { describe, expect, it } from "vitest";
import { createAvatarObjectKey } from "./object-key";

describe("createAvatarObjectKey", () => {
  it("creates a user-scoped object key from a supplied test id", () => {
    expect(
      createAvatarObjectKey({
        userId: "user-1",
        extension: "webp",
        id: "file-id"
      })
    ).toBe("avatars/originals/user-1/file-id.webp");
  });

  it("uses a UUID by default", () => {
    expect(
      createAvatarObjectKey({
        userId: "user-1",
        extension: "jpg"
      })
    ).toMatch(
      /^avatars\/originals\/user-1\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i
    );
  });

  it("rejects unsupported extensions at runtime", () => {
    expect(() =>
      createAvatarObjectKey({
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
        createAvatarObjectKey({
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
        createAvatarObjectKey({
          userId: "user-1",
          extension: "png",
          id
        })
      ).toThrow("Object key segments must be non-empty and safe");
    }
  );
});
