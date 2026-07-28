import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const MANAGED_ENVIRONMENT = [
  "AVATAR_S3_BUCKET",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_REGION"
] as const;
const originalEnvironment = Object.fromEntries(
  MANAGED_ENVIRONMENT.map(name => [name, process.env[name]])
);

beforeAll(() => {
  process.env.AVATAR_S3_BUCKET = "avatar-policy-test-bucket";
  process.env.AWS_ACCESS_KEY_ID = "AKIDEXAMPLE";
  process.env.AWS_SECRET_ACCESS_KEY =
    "example-secret-access-key-for-local-signing-only";
  delete process.env.AWS_SESSION_TOKEN;
  process.env.AWS_REGION = "us-east-1";
});

afterAll(async () => {
  for (const name of MANAGED_ENVIRONMENT) {
    const originalValue = originalEnvironment[name];
    if (originalValue === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = originalValue;
    }
  }

  const { resetAvatarS3StorageForTests } = await import("./s3-storage");
  resetAvatarS3StorageForTests();
});

describe("createAvatarPresignedPost real AWS policy", () => {
  it("signs an exact five-minute avatar POST contract without network access", async () => {
    const before = Date.now();
    const { createAvatarPresignedPost } = await import("./s3-storage");
    const result = await createAvatarPresignedPost({
      stagingKey: "original/pending/user-1/upload-1.webp",
      contentType: "image/webp"
    });
    const after = Date.now();
    const encodedPolicy = result.fields.Policy ?? result.fields.policy;

    expect(encodedPolicy).toBeTypeOf("string");
    const policy = JSON.parse(
      Buffer.from(encodedPolicy, "base64").toString("utf8")
    ) as {
      expiration: string;
      conditions: Array<
        Record<string, string> | [string, string, string] | [string, number, number]
      >;
    };

    expect(policy.conditions).toContainEqual({
      bucket: "avatar-policy-test-bucket"
    });
    expect(policy.conditions).toContainEqual({
      key: "original/pending/user-1/upload-1.webp"
    });
    expect(policy.conditions).toContainEqual({
      "Content-Type": "image/webp"
    });
    expect(policy.conditions).toContainEqual({
      success_action_status: "204"
    });
    expect(policy.conditions).toContainEqual([
      "eq",
      "$Content-Type",
      "image/webp"
    ]);
    expect(policy.conditions).toContainEqual([
      "content-length-range",
      1,
      5 * 1024 * 1024
    ]);

    const policyExpiration = Date.parse(policy.expiration);
    expect(policyExpiration).toBeGreaterThanOrEqual(before + 295_000);
    expect(policyExpiration).toBeLessThanOrEqual(after + 305_000);
    expect(Date.parse(result.expiresAt)).toBeGreaterThanOrEqual(
      before + 295_000
    );
    expect(Date.parse(result.expiresAt)).toBeLessThanOrEqual(after + 305_000);
  });
});
