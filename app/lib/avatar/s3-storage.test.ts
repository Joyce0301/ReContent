import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const aws = vi.hoisted(() => ({
  createPresignedPost: vi.fn(),
  send: vi.fn(),
  s3Client: vi.fn(),
  HeadObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
  CopyObjectCommand: class {
    constructor(readonly input: unknown) {}
  }
}));

const originalBucket = process.env.AVATAR_S3_BUCKET;
const originalRegion = process.env.AWS_REGION;

vi.mock("server-only", () => ({}));

vi.mock("@aws-sdk/s3-presigned-post", () => ({
  createPresignedPost: aws.createPresignedPost
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = aws.send;

    constructor(input: unknown) {
      aws.s3Client(input);
    }
  },
  HeadObjectCommand: aws.HeadObjectCommand,
  CopyObjectCommand: aws.CopyObjectCommand
}));

beforeEach(() => {
  process.env.AVATAR_S3_BUCKET = "bucket";
  process.env.AWS_REGION = "us-east-1";
  aws.createPresignedPost.mockResolvedValue({
    url: "https://bucket.s3.amazonaws.com",
    fields: { key: "original/pending/user-1/upload-1.webp" }
  });
});

afterEach(() => {
  if (originalBucket === undefined) {
    delete process.env.AVATAR_S3_BUCKET;
  } else {
    process.env.AVATAR_S3_BUCKET = originalBucket;
  }

  if (originalRegion === undefined) {
    delete process.env.AWS_REGION;
  } else {
    process.env.AWS_REGION = originalRegion;
  }
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.resetModules();
});

async function loadStorage() {
  return import("./s3-storage");
}

describe("createAvatarPresignedPost", () => {
  it("creates a five-minute POST limited to the requested image type and avatar size", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));
    const { createAvatarPresignedPost } = await loadStorage();

    await expect(
      createAvatarPresignedPost({
        stagingKey: "original/pending/user-1/upload-1.webp",
        contentType: "image/webp"
      })
    ).resolves.toEqual({
      url: "https://bucket.s3.amazonaws.com",
      fields: { key: "original/pending/user-1/upload-1.webp" },
      expiresAt: "2026-07-27T12:05:00.000Z"
    });

    expect(aws.s3Client).toHaveBeenCalledWith({ region: "us-east-1" });
    expect(aws.createPresignedPost).toHaveBeenCalledWith(
      expect.anything(),
      {
        Bucket: "bucket",
        Key: "original/pending/user-1/upload-1.webp",
        Expires: 300,
        Fields: {
          "Content-Type": "image/webp",
          success_action_status: "204"
        },
        Conditions: [
          ["eq", "$Content-Type", "image/webp"],
          ["content-length-range", 1, 5 * 1024 * 1024]
        ]
      }
    );
  });
});

describe("headAvatarObject", () => {
  it("returns object metadata including the exact quoted S3 ETag", async () => {
    aws.send.mockResolvedValue({
      ContentLength: 1024,
      ContentType: "image/webp",
      ETag: "\"source-etag\""
    });
    const { headAvatarObject } = await loadStorage();

    await expect(
      headAvatarObject("original/pending/user-1/upload-1.webp")
    ).resolves.toEqual({
      contentLength: 1024,
      contentType: "image/webp",
      eTag: "\"source-etag\""
    });

    expect(aws.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          Bucket: "bucket",
          Key: "original/pending/user-1/upload-1.webp"
        }
      })
    );
  });

  it.each([undefined, "", "   "])(
    "rejects a missing or blank HeadObject ETag before it can be copied: %j",
    async ETag => {
      aws.send.mockResolvedValue({
        ContentLength: 1024,
        ContentType: "image/webp",
        ETag
      });
      const { AvatarStorageUnavailableError } = await import("./storage-errors");
      const { headAvatarObject } = await loadStorage();

      await expect(
        headAvatarObject("original/pending/user-1/upload-1.webp")
      ).rejects.toBeInstanceOf(AvatarStorageUnavailableError);
    }
  );
});

describe("copyAvatarToConfirmed", () => {
  it("passes a quoted source ETag through exactly and prevents destination overwrites", async () => {
    aws.send.mockResolvedValue({});
    const observedETag = "\"source-etag\"";
    const { copyAvatarToConfirmed } = await loadStorage();

    await expect(
      copyAvatarToConfirmed({
        stagingKey: "original/pending/user-1/upload-1.webp",
        confirmedKey: "original/confirmed/user-1/upload-1.webp",
        sourceETag: observedETag
      })
    ).resolves.toBeUndefined();

    expect(aws.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          Bucket: "bucket",
          Key: "original/confirmed/user-1/upload-1.webp",
          CopySource: "bucket/original/pending/user-1/upload-1.webp",
          CopySourceIfMatch: observedETag,
          IfNoneMatch: "*"
        }
      })
    );
  });

  it.each([undefined, "", "   "])(
    "rejects a blank ETag before creating a CopyObject command: %j",
    async sourceETag => {
      const { AvatarStorageUnavailableError } = await import("./storage-errors");
      const { copyAvatarToConfirmed } = await loadStorage();

      await expect(
        copyAvatarToConfirmed({
          stagingKey: "original/pending/user-1/upload-1.webp",
          confirmedKey: "original/confirmed/user-1/upload-1.webp",
          sourceETag: sourceETag as string
        })
      ).rejects.toBeInstanceOf(AvatarStorageUnavailableError);

      expect(aws.send).not.toHaveBeenCalled();
    }
  );
});

describe("S3 error mapping", () => {
  it.each([
    [{ name: "NotFound" }, "AvatarStorageNotFoundError"],
    [{ name: "NoSuchKey" }, "AvatarStorageNotFoundError"],
    [{ $metadata: { httpStatusCode: 404 } }, "AvatarStorageNotFoundError"],
    [{ name: "PreconditionFailed" }, "AvatarStoragePreconditionError"],
    [{ $metadata: { httpStatusCode: 412 } }, "AvatarStoragePreconditionError"],
    [
      { name: "ConditionalRequestConflict" },
      "AvatarStorageConflictError"
    ],
    [{ $metadata: { httpStatusCode: 409 } }, "AvatarStorageConflictError"]
  ])("maps %j to %s", async (awsError, errorName) => {
    aws.send.mockRejectedValue(awsError);
    const errors = await import("./storage-errors");
    const { headAvatarObject } = await loadStorage();

    await expect(
      headAvatarObject("original/pending/user-1/upload-1.webp")
    ).rejects.toBeInstanceOf(errors[errorName as keyof typeof errors]);
  });

  it("redacts credential and S3 request details from unavailable errors", async () => {
    const secret = "AKIA-SECRET-token-policy-signature";
    aws.createPresignedPost.mockRejectedValue({
      name: "CredentialsProviderError",
      message: secret,
      $metadata: {
        httpStatusCode: 403,
        requestId: secret,
        token: secret
      },
      policy: secret,
      signature: secret
    });
    const { AvatarStorageUnavailableError } = await import("./storage-errors");
    const { createAvatarPresignedPost } = await loadStorage();

    await expect(
      createAvatarPresignedPost({
        stagingKey: "original/pending/user-1/upload-1.webp",
        contentType: "image/webp"
      })
    ).rejects.toBeInstanceOf(AvatarStorageUnavailableError);

    await createAvatarPresignedPost({
      stagingKey: "original/pending/user-1/upload-1.webp",
      contentType: "image/webp"
    }).catch(error => {
      expect(error.message).not.toContain(secret);
      expect(error.message).not.toMatch(/request|policy|signature|token/i);
    });
  });
});
