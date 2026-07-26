import { randomUUID } from "node:crypto";

const AVATAR_EXTENSIONS = new Set(["jpg", "png", "webp"]);

function assertSafeSegment(segment: string) {
  if (
    segment.trim().length === 0 ||
    segment.includes("/") ||
    segment.includes("\\") ||
    segment.includes("..")
  ) {
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
