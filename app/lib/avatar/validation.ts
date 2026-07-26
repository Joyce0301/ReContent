export const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

const CONTENT_TYPE_EXTENSIONS = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"]
} as const;

const ALLOWED_FIELDS = new Set(["fileName", "contentType", "sizeBytes"]);

export type AvatarUploadIntent = {
  fileName: string;
  contentType: keyof typeof CONTENT_TYPE_EXTENSIONS;
  sizeBytes: number;
  extension: "jpg" | "png" | "webp";
};

export function validateAvatarUploadIntent(
  value: unknown
):
  | { ok: true; value: AvatarUploadIntent }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "请求仅支持头像文件元数据" };
  }

  if (Object.keys(value).some(field => !ALLOWED_FIELDS.has(field))) {
    return { ok: false, error: "请求仅支持头像文件元数据" };
  }

  const input = value as Record<string, unknown>;

  if (
    typeof input.fileName !== "string" ||
    input.fileName.trim().length === 0
  ) {
    return { ok: false, error: "头像文件名不能为空" };
  }

  if (input.fileName.length > 255) {
    return { ok: false, error: "头像文件名不能超过 255 个字符" };
  }

  if (
    typeof input.contentType !== "string" ||
    !(input.contentType in CONTENT_TYPE_EXTENSIONS)
  ) {
    return { ok: false, error: "仅支持 JPEG、PNG 或 WebP 图片" };
  }

  if (
    !Number.isInteger(input.sizeBytes) ||
    (input.sizeBytes as number) < 1 ||
    (input.sizeBytes as number) > MAX_AVATAR_SIZE_BYTES
  ) {
    return {
      ok: false,
      error: "头像文件大小必须为 1 到 5 MiB 之间的整数"
    };
  }

  const contentType =
    input.contentType as keyof typeof CONTENT_TYPE_EXTENSIONS;
  const extension = input.fileName.split(".").pop()?.toLowerCase();

  if (
    !extension ||
    !(CONTENT_TYPE_EXTENSIONS[contentType] as readonly string[]).includes(
      extension
    )
  ) {
    return {
      ok: false,
      error: "头像文件扩展名与图片类型不匹配"
    };
  }

  const normalizedExtension: AvatarUploadIntent["extension"] =
    contentType === "image/jpeg"
      ? "jpg"
      : contentType === "image/png"
        ? "png"
        : "webp";

  return {
    ok: true,
    value: {
      fileName: input.fileName,
      contentType,
      sizeBytes: input.sizeBytes as number,
      extension: normalizedExtension
    }
  };
}
