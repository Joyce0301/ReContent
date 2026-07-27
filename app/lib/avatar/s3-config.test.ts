import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const originalBucket = process.env.AVATAR_S3_BUCKET;
const originalRegion = process.env.AVATAR_S3_REGION;

afterEach(() => {
  if (originalBucket === undefined) {
    delete process.env.AVATAR_S3_BUCKET;
  } else {
    process.env.AVATAR_S3_BUCKET = originalBucket;
  }

  if (originalRegion === undefined) {
    delete process.env.AVATAR_S3_REGION;
  } else {
    process.env.AVATAR_S3_REGION = originalRegion;
  }

  vi.resetModules();
});

describe("getAvatarS3Config", () => {
  it("does not read S3 configuration when the module is imported", async () => {
    delete process.env.AVATAR_S3_BUCKET;
    delete process.env.AVATAR_S3_REGION;

    const { AvatarStorageConfigurationError } = await import("./storage-errors");
    const { getAvatarS3Config } = await import("./s3-config");

    expect(() => getAvatarS3Config()).toThrow(AvatarStorageConfigurationError);
  });

  it.each([
    [undefined, "us-east-1"],
    ["", "us-east-1"],
    ["   ", "us-east-1"],
    ["bucket", undefined],
    ["bucket", ""],
    ["bucket", "   "]
  ])("rejects invalid bucket or region values", async (bucket, region) => {
    if (bucket === undefined) {
      delete process.env.AVATAR_S3_BUCKET;
    } else {
      process.env.AVATAR_S3_BUCKET = bucket;
    }

    if (region === undefined) {
      delete process.env.AVATAR_S3_REGION;
    } else {
      process.env.AVATAR_S3_REGION = region;
    }

    const { AvatarStorageConfigurationError } = await import("./storage-errors");
    const { getAvatarS3Config } = await import("./s3-config");

    expect(() => getAvatarS3Config()).toThrow(AvatarStorageConfigurationError);
  });

  it("returns valid S3 configuration without trimming its values", async () => {
    process.env.AVATAR_S3_BUCKET = "avatar-bucket";
    process.env.AVATAR_S3_REGION = "ap-southeast-1";

    const { getAvatarS3Config } = await import("./s3-config");

    expect(getAvatarS3Config()).toEqual({
      bucket: "avatar-bucket",
      region: "ap-southeast-1"
    });
  });
});
