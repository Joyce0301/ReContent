import { describe, expect, it } from "vitest";
import {
  MAX_AVATAR_SIZE_BYTES,
  validateAvatarUploadIntent
} from "./validation";

describe("validateAvatarUploadIntent", () => {
  it.each([
    ["avatar.jpg", "image/jpeg", "jpg"],
    ["avatar.jpeg", "image/jpeg", "jpg"],
    ["avatar.png", "image/png", "png"],
    ["avatar.webp", "image/webp", "webp"]
  ] as const)(
    "accepts %s metadata and normalizes its extension",
    (fileName, contentType, extension) => {
      expect(
        validateAvatarUploadIntent({
          fileName,
          contentType,
          sizeBytes: 1024
        })
      ).toEqual({
        ok: true,
        value: {
          fileName,
          contentType,
          sizeBytes: 1024,
          extension
        }
      });
    }
  );

  it.each(["", " ", 123, null])("rejects an invalid file name: %j", fileName => {
    expect(
      validateAvatarUploadIntent({
        fileName,
        contentType: "image/png",
        sizeBytes: 100
      })
    ).toEqual({ ok: false, error: "头像文件名不能为空" });
  });

  it("rejects file names longer than 255 characters", () => {
    expect(
      validateAvatarUploadIntent({
        fileName: `${"a".repeat(252)}.png`,
        contentType: "image/png",
        sizeBytes: 100
      })
    ).toEqual({ ok: false, error: "头像文件名不能超过 255 个字符" });
  });

  it("returns the stable unsupported-type message", () => {
    expect(
      validateAvatarUploadIntent({
        fileName: "avatar.gif",
        contentType: "image/gif",
        sizeBytes: 100
      })
    ).toEqual({ ok: false, error: "仅支持 JPEG、PNG 或 WebP 图片" });
  });

  it.each([
    ["avatar.png", "image/jpeg"],
    ["avatar.jpg", "image/png"],
    ["avatar", "image/webp"]
  ])("rejects extension and MIME mismatches for %s", (fileName, contentType) => {
    expect(
      validateAvatarUploadIntent({
        fileName,
        contentType,
        sizeBytes: 100
      })
    ).toEqual({
      ok: false,
      error: "头像文件扩展名与图片类型不匹配"
    });
  });

  it.each([0, -1, 1.5, MAX_AVATAR_SIZE_BYTES + 1, "100", null])(
    "rejects an invalid declared size: %j",
    sizeBytes => {
      expect(
        validateAvatarUploadIntent({
          fileName: "avatar.webp",
          contentType: "image/webp",
          sizeBytes
        })
      ).toEqual({
        ok: false,
        error: "头像文件大小必须为 1 到 5 MiB 之间的整数"
      });
    }
  );

  it("accepts the maximum declared size", () => {
    expect(
      validateAvatarUploadIntent({
        fileName: "avatar.png",
        contentType: "image/png",
        sizeBytes: MAX_AVATAR_SIZE_BYTES
      })
    ).toMatchObject({ ok: true });
  });

  it.each(["userId", "objectKey", "status", "bytes"])(
    "rejects forbidden client-controlled field %s",
    field => {
      expect(
        validateAvatarUploadIntent({
          fileName: "avatar.png",
          contentType: "image/png",
          sizeBytes: 100,
          [field]: "client-value"
        })
      ).toEqual({ ok: false, error: "请求仅支持头像文件元数据" });
    }
  );
});
