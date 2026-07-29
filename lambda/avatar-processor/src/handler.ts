import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import type { Context, S3Event } from "aws-lambda";

import { AvatarProcessorError } from "./errors";
import {
  parseAvatarEvent,
  parseAvatarRecord,
  type AvatarObjectJob
} from "./event-record";
import {
  MAX_INPUT_BYTES,
  transformAvatar
} from "./image-transform";

export type HandlerDependencies = {
  getBucketName: () => string | undefined;
  log: (entry: Record<string, unknown>) => void;
  s3: { send(command: unknown): Promise<unknown> };
  transform(input: Uint8Array): Promise<Buffer>;
};

type S3Body = {
  transformToByteArray(): Promise<Uint8Array>;
};

function isReadableBody(value: unknown): value is S3Body {
  return (
    typeof value === "object" &&
    value !== null &&
    "transformToByteArray" in value &&
    typeof value.transformToByteArray === "function"
  );
}

function errorCode(error: unknown, fallback: string) {
  return error instanceof AvatarProcessorError ? error.code : fallback;
}

async function readSource(
  dependencies: HandlerDependencies,
  bucket: string,
  job: AvatarObjectJob
) {
  let response: unknown;

  try {
    response = await dependencies.s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: job.sourceKey })
    );
  } catch {
    throw new AvatarProcessorError("S3_READ_FAILED");
  }

  if (typeof response !== "object" || response === null) {
    throw new AvatarProcessorError("S3_READ_FAILED");
  }

  const { Body, ContentLength } = response as {
    Body?: unknown;
    ContentLength?: unknown;
  };

  if (
    typeof ContentLength === "number" &&
    ContentLength > MAX_INPUT_BYTES
  ) {
    throw new AvatarProcessorError("INPUT_TOO_LARGE");
  }

  if (!isReadableBody(Body)) {
    throw new AvatarProcessorError("S3_READ_FAILED");
  }

  let bytes: Uint8Array;

  try {
    bytes = await Body.transformToByteArray();
  } catch {
    throw new AvatarProcessorError("S3_READ_FAILED");
  }

  if (bytes.byteLength > MAX_INPUT_BYTES) {
    throw new AvatarProcessorError("INPUT_TOO_LARGE");
  }

  return bytes;
}

async function processJob(
  dependencies: HandlerDependencies,
  bucket: string,
  job: AvatarObjectJob
) {
  const source = await readSource(dependencies, bucket, job);
  const output = await dependencies.transform(source);

  try {
    await dependencies.s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: job.destinationKey,
        Body: output,
        ContentType: "image/webp",
        CacheControl: "private, max-age=31536000, immutable"
      })
    );
  } catch {
    throw new AvatarProcessorError("S3_WRITE_FAILED");
  }
}

export function createHandler(dependencies: HandlerDependencies) {
  return async (event: S3Event | unknown, context: Context): Promise<void> => {
    const bucket = dependencies.getBucketName();

    if (!bucket) {
      throw new AvatarProcessorError("CONFIGURATION_ERROR");
    }

    const parsed = parseAvatarEvent(event);

    if (parsed.kind === "test-event") {
      dependencies.log({
        requestId: context.awsRequestId,
        stage: "event",
        result: "test_event_ignored"
      });
      return;
    }

    let failureCount = 0;

    for (const record of parsed.records) {
      let job: AvatarObjectJob | null = null;

      try {
        job = parseAvatarRecord(record, bucket);

        if (!job) {
          dependencies.log({
            requestId: context.awsRequestId,
            stage: "record",
            result: "outside_prefix_ignored"
          });
          continue;
        }

        await processJob(dependencies, bucket, job);
        dependencies.log({
          requestId: context.awsRequestId,
          stage: "write",
          result: "ready",
          uploadId: job.uploadId
        });
      } catch (error) {
        failureCount += 1;
        dependencies.log({
          requestId: context.awsRequestId,
          stage: "record",
          result: "failed",
          errorCode: errorCode(error, "PROCESSING_FAILED"),
          ...(job ? { uploadId: job.uploadId } : {})
        });
      }
    }

    if (failureCount > 0) {
      throw new AvatarProcessorError("BATCH_PROCESSING_FAILED");
    }
  };
}

const s3Client = new S3Client({});

export const handler = createHandler({
  getBucketName: () => process.env.AVATAR_S3_BUCKET,
  log: entry => console.log(JSON.stringify(entry)),
  s3: {
    send: command =>
      s3Client.send(command as GetObjectCommand | PutObjectCommand)
  },
  transform: transformAvatar
});
