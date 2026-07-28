import "server-only";

import {
  CopyObjectCommand,
  HeadObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

import { MAX_AVATAR_SIZE_BYTES } from "./validation";
import { getAvatarS3Config } from "./s3-config";
import { parseAvatarStagingKey } from "./object-key";
import {
  AvatarStorageConflictError,
  AvatarStorageNotFoundError,
  AvatarStoragePreconditionError,
  AvatarStorageUnavailableError
} from "./storage-errors";

const PRESIGNED_POST_EXPIRES_SECONDS = 5 * 60;

let client: S3Client | undefined;
let clientRegion: string | undefined;

export type AvatarObjectMetadata = {
  contentLength: number;
  contentType: string;
  eTag: string;
};

function getS3Client(region: string) {
  if (!client || clientRegion !== region) {
    // Credentials are intentionally omitted so the AWS SDK uses its ECS/runtime provider chain.
    client = new S3Client({ region });
    clientRegion = region;
  }

  return client;
}

function mapStorageError(error: unknown): Error {
  if (
    error instanceof AvatarStorageNotFoundError ||
    error instanceof AvatarStoragePreconditionError ||
    error instanceof AvatarStorageConflictError ||
    error instanceof AvatarStorageUnavailableError
  ) {
    return error;
  }

  const awsError = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  const name = typeof awsError?.name === "string" ? awsError.name : "";
  const statusCode = awsError?.$metadata?.httpStatusCode;

  if (statusCode === 404 || name === "NotFound" || name === "NoSuchKey") {
    return new AvatarStorageNotFoundError();
  }

  if (statusCode === 412 || name === "PreconditionFailed") {
    return new AvatarStoragePreconditionError();
  }

  if (statusCode === 409 || name === "ConditionalRequestConflict") {
    return new AvatarStorageConflictError();
  }

  return new AvatarStorageUnavailableError();
}

function assertCompleteObjectMetadata(output: {
  ContentLength?: number;
  ContentType?: string;
  ETag?: string;
}): asserts output is {
  ContentLength: number;
  ContentType: string;
  ETag: string;
} {
  if (
    typeof output.ContentLength !== "number" ||
    typeof output.ContentType !== "string" ||
    output.ContentType.trim().length === 0 ||
    typeof output.ETag !== "string" ||
    output.ETag.trim().length === 0
  ) {
    throw new AvatarStorageUnavailableError();
  }
}

export async function createAvatarPresignedPost(input: {
  stagingKey: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
}): Promise<{
  url: string;
  fields: Record<string, string>;
  expiresAt: string;
}> {
  const config = getAvatarS3Config();
  const expiresAt = new Date(
    Date.now() + PRESIGNED_POST_EXPIRES_SECONDS * 1000
  ).toISOString();

  try {
    const post = await createPresignedPost(getS3Client(config.region), {
      Bucket: config.bucket,
      Key: input.stagingKey,
      Expires: PRESIGNED_POST_EXPIRES_SECONDS,
      Fields: {
        "Content-Type": input.contentType,
        success_action_status: "204"
      },
      Conditions: [
        ["eq", "$Content-Type", input.contentType],
        ["content-length-range", 1, MAX_AVATAR_SIZE_BYTES]
      ]
    });

    return { ...post, expiresAt };
  } catch (error) {
    throw mapStorageError(error);
  }
}

export async function headAvatarObject(
  key: string
): Promise<AvatarObjectMetadata> {
  const config = getAvatarS3Config();

  try {
    const output = await getS3Client(config.region).send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: key })
    );

    assertCompleteObjectMetadata(output);

    return {
      contentLength: output.ContentLength,
      contentType: output.ContentType,
      eTag: output.ETag
    };
  } catch (error) {
    throw mapStorageError(error);
  }
}

export async function copyAvatarToConfirmed(input: {
  stagingKey: string;
  confirmedKey: string;
  sourceETag: string;
}): Promise<void> {
  const stagingUserId =
    typeof input.stagingKey === "string"
      ? input.stagingKey.split("/")[2] ?? ""
      : "";
  const parsedStagingKey =
    typeof input.stagingKey === "string"
      ? parseAvatarStagingKey(input.stagingKey, stagingUserId)
      : null;

  if (
    typeof input.confirmedKey !== "string" ||
    !parsedStagingKey ||
    parsedStagingKey.confirmedKey !== input.confirmedKey
  ) {
    throw new AvatarStoragePreconditionError();
  }

  if (
    typeof input.sourceETag !== "string" ||
    input.sourceETag.trim().length === 0
  ) {
    throw new AvatarStorageUnavailableError();
  }

  const config = getAvatarS3Config();

  try {
    await getS3Client(config.region).send(
      new CopyObjectCommand({
        Bucket: config.bucket,
        Key: input.confirmedKey,
        CopySource: `${config.bucket}/${input.stagingKey}`,
        CopySourceIfMatch: input.sourceETag,
        IfNoneMatch: "*"
      })
    );
  } catch (error) {
    throw mapStorageError(error);
  }
}

// Test-only reset for the lazy S3 client singleton.
export function resetAvatarS3StorageForTests() {
  client = undefined;
  clientRegion = undefined;
}
