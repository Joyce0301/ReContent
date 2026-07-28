import { randomUUID } from "node:crypto";

const AVATAR_EXTENSIONS = new Set(["jpg", "png", "webp"]);

function isSafeSegment(segment: string) {
  return /^[A-Za-z0-9_-]+$/.test(segment);
}

function assertSafeSegment(segment: string) {
  if (!isSafeSegment(segment)) {
    throw new Error("Object key segments must be non-empty and safe");
  }
}

export function createAvatarObjectKey(input: {
  userId: string;
  extension: "jpg" | "png" | "webp";
  id?: string;
}) {
  const id = input.id ?? randomUUID();

  assertSafeSegment(input.userId);
  assertSafeSegment(id);

  if (!AVATAR_EXTENSIONS.has(input.extension)) {
    throw new Error("Avatar extension must be jpg, png, or webp");
  }

  return `avatars/originals/${input.userId}/${id}.${input.extension}`;
}

export function createAvatarObjectKeys(input: {
  userId: string;
  extension: "jpg" | "png" | "webp";
  id?: string;
}): { stagingKey: string; confirmedKey: string } {
  const id = input.id ?? randomUUID();

  assertSafeSegment(input.userId);
  assertSafeSegment(id);

  if (!AVATAR_EXTENSIONS.has(input.extension)) {
    throw new Error("Avatar extension must be jpg, png, or webp");
  }

  const filename = `${id}.${input.extension}`;

  return {
    stagingKey: `original/pending/${input.userId}/${filename}`,
    confirmedKey: `original/confirmed/${input.userId}/${filename}`
  };
}

export function parseAvatarStagingKey(
  key: string,
  expectedUserId: string
): {
  userId: string;
  uploadId: string;
  extension: "jpg" | "png" | "webp";
  confirmedKey: string;
} | null {
  if (!isSafeSegment(expectedUserId)) {
    return null;
  }

  const segments = key.split("/");

  if (segments.length !== 4) {
    return null;
  }

  const [original, pending, userId, filename] = segments;

  if (
    original !== "original" ||
    pending !== "pending" ||
    userId !== expectedUserId ||
    !isSafeSegment(userId)
  ) {
    return null;
  }

  const extensionStart = filename.lastIndexOf(".");

  if (extensionStart <= 0) {
    return null;
  }

  const uploadId = filename.slice(0, extensionStart);
  const extension = filename.slice(extensionStart + 1);

  if (!isSafeSegment(uploadId) || !AVATAR_EXTENSIONS.has(extension)) {
    return null;
  }

  return {
    userId,
    uploadId,
    extension: extension as "jpg" | "png" | "webp",
    confirmedKey: `original/confirmed/${userId}/${filename}`
  };
}
