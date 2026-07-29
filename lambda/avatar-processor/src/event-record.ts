import { AvatarProcessorError } from "./errors";

export type AvatarObjectJob = {
  sourceKey: string;
  destinationKey: string;
  userId: string;
  uploadId: string;
};

export type ParsedAvatarEvent =
  | { kind: "test-event" }
  | { kind: "records"; records: unknown[] };

const CONFIRMED_PREFIX = "original/confirmed/";
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;
const CONFIRMED_KEY =
  /^original\/confirmed\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\.(jpg|png|webp)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidEvent(): never {
  throw new AvatarProcessorError("INVALID_EVENT");
}

export function parseAvatarEvent(event: unknown): ParsedAvatarEvent {
  if (!isRecord(event)) {
    return invalidEvent();
  }

  if (event.Event === "s3:TestEvent") {
    return { kind: "test-event" };
  }

  if (!Array.isArray(event.Records) || event.Records.length === 0) {
    return invalidEvent();
  }

  return { kind: "records", records: event.Records };
}

export function parseAvatarRecord(
  record: unknown,
  expectedBucket: string
): AvatarObjectJob | null {
  if (
    !isRecord(record) ||
    record.eventSource !== "aws:s3" ||
    typeof record.eventName !== "string" ||
    !record.eventName.startsWith("ObjectCreated:") ||
    !isRecord(record.s3) ||
    !isRecord(record.s3.bucket) ||
    !isRecord(record.s3.object) ||
    typeof record.s3.bucket.name !== "string" ||
    typeof record.s3.object.key !== "string"
  ) {
    return invalidEvent();
  }

  if (record.s3.bucket.name !== expectedBucket) {
    throw new AvatarProcessorError("WRONG_BUCKET");
  }

  let sourceKey: string;

  try {
    sourceKey = decodeURIComponent(record.s3.object.key.replaceAll("+", " "));
  } catch {
    throw new AvatarProcessorError("INVALID_OBJECT_KEY_ENCODING");
  }

  if (!sourceKey.startsWith(CONFIRMED_PREFIX)) {
    return null;
  }

  const match = CONFIRMED_KEY.exec(sourceKey);

  if (!match) {
    throw new AvatarProcessorError("INVALID_OBJECT_KEY");
  }

  const [, userId, uploadId, extension] = match;

  if (
    !userId ||
    !uploadId ||
    !extension ||
    !SAFE_SEGMENT.test(userId) ||
    !SAFE_SEGMENT.test(uploadId)
  ) {
    throw new AvatarProcessorError("INVALID_OBJECT_KEY");
  }

  return {
    sourceKey,
    destinationKey:
      `processed/ready/${userId}/${uploadId}-${extension}.webp`,
    userId,
    uploadId
  };
}
