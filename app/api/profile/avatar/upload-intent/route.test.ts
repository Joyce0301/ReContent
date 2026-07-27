import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  consumeRateLimitMock,
  createAvatarObjectKeysMock,
  createAvatarPresignedPostMock,
  getAuthSessionMock,
  getAvatarUploadStateMock,
  readBoundedJsonMock,
  reserveAvatarUploadMock,
  validateAvatarUploadIntentMock
} = vi.hoisted(() => ({
  consumeRateLimitMock: vi.fn(),
  createAvatarObjectKeysMock: vi.fn(),
  createAvatarPresignedPostMock: vi.fn(),
  getAuthSessionMock: vi.fn(),
  getAvatarUploadStateMock: vi.fn(),
  readBoundedJsonMock: vi.fn(),
  reserveAvatarUploadMock: vi.fn(),
  validateAvatarUploadIntentMock: vi.fn()
}));

vi.mock("../../../../lib/auth/rate-limit", () => ({
  consumeRateLimit: consumeRateLimitMock
}));

vi.mock("../../../../lib/auth/session", async () => {
  const { AuthConfigurationError, AuthStorageUnavailableError } =
    await vi.importActual<typeof import("../../../../lib/auth/errors")>(
      "../../../../lib/auth/errors"
    );

  return {
    getAuthSession: getAuthSessionMock,
    isAuthServiceError: (error: unknown) =>
      error instanceof AuthConfigurationError ||
      error instanceof AuthStorageUnavailableError
  };
});

vi.mock("../../../../lib/auth/user-store", () => ({
  getAvatarUploadState: getAvatarUploadStateMock,
  reserveAvatarUpload: reserveAvatarUploadMock
}));

vi.mock("../../../../lib/avatar/object-key", () => ({
  createAvatarObjectKeys: createAvatarObjectKeysMock
}));

vi.mock("../../../../lib/avatar/s3-storage", () => ({
  createAvatarPresignedPost: createAvatarPresignedPostMock
}));

vi.mock("../../../../lib/avatar/validation", () => ({
  validateAvatarUploadIntent: validateAvatarUploadIntentMock
}));

vi.mock("../../../../lib/http/bounded-json", () => ({
  readBoundedJson: readBoundedJsonMock
}));

import { POST } from "./route";

const session = {
  user: {
    id: "session-user",
    email: "joyce@example.com",
    displayName: "Joyce",
    avatarKey: null,
    avatarStatus: "not_uploaded" as const,
    avatarUpdatedAt: null
  },
  expiresAt: "2026-08-09T09:00:00.000Z"
};

const requestBody = {
  fileName: "avatar.webp",
  contentType: "image/webp",
  sizeBytes: 1024,
  userId: "attacker-user"
};

const validatedIntent = {
  fileName: "avatar.webp",
  contentType: "image/webp" as const,
  sizeBytes: 1024,
  extension: "webp" as const
};

const objectKeys = {
  stagingKey: "original/pending/session-user/upload-1.webp",
  confirmedKey: "original/confirmed/session-user/upload-1.webp"
};

const upload = {
  url: "https://upload.example.test/",
  fields: {
    key: objectKeys.stagingKey,
    policy: "opaque-policy",
    "x-amz-signature": "opaque-signature",
    "x-amz-security-token": "opaque-token"
  },
  expiresAt: "2026-07-27T00:05:00.000Z"
};

function createRequest() {
  return new Request(
    "http://localhost/api/profile/avatar/upload-intent",
    {
      method: "POST",
      body: JSON.stringify(requestBody)
    }
  );
}

beforeEach(() => {
  getAuthSessionMock.mockResolvedValue(session);
  consumeRateLimitMock.mockReturnValue({
    ok: true,
    retryAfterSeconds: 600
  });
  readBoundedJsonMock.mockResolvedValue({ ok: true, value: requestBody });
  validateAvatarUploadIntentMock.mockReturnValue({
    ok: true,
    value: validatedIntent
  });
  getAvatarUploadStateMock.mockResolvedValue({
    key: null,
    status: "not_uploaded",
    updatedAt: null
  });
  createAvatarObjectKeysMock.mockReturnValue(objectKeys);
  createAvatarPresignedPostMock.mockResolvedValue(upload);
  reserveAvatarUploadMock.mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/profile/avatar/upload-intent", () => {
  it("authenticates before reading the body and returns 401", async () => {
    getAuthSessionMock.mockResolvedValueOnce(null);

    const response = await POST(createRequest());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "请先登录" });
    expect(readBoundedJsonMock).not.toHaveBeenCalled();
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
  });

  it("uses the authenticated user's five-per-ten-minute rate limit", async () => {
    await POST(createRequest());

    expect(consumeRateLimitMock).toHaveBeenCalledWith({
      bucket: "avatar-upload-intent",
      key: "session-user",
      max: 5,
      windowMs: 10 * 60 * 1000
    });
  });

  it("returns 429 with Retry-After before reading the body", async () => {
    consumeRateLimitMock.mockReturnValueOnce({
      ok: false,
      retryAfterSeconds: 37
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("37");
    expect(readBoundedJsonMock).not.toHaveBeenCalled();
  });

  it.each([
    ["INVALID_CONTENT_LENGTH", 400, "Content-Length 格式错误"],
    ["INVALID_JSON", 400, "请求体格式错误"],
    ["READ_FAILED", 400, "请求体读取失败，请重试"],
    ["TOO_LARGE", 413, "请求体过大"]
  ] as const)("maps %s to %i", async (reason, status, message) => {
    readBoundedJsonMock.mockResolvedValueOnce({ ok: false, reason });

    const response = await POST(createRequest());

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: message });
    expect(validateAvatarUploadIntentMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid avatar metadata", async () => {
    validateAvatarUploadIntentMock.mockReturnValueOnce({
      ok: false,
      error: "仅支持 JPEG、PNG 或 WebP 图片"
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "仅支持 JPEG、PNG 或 WebP 图片"
    });
    expect(getAvatarUploadStateMock).not.toHaveBeenCalled();
  });

  it.each(["confirming", "uploaded"] as const)(
    "returns 409 without issuing an intent for %s",
    async status => {
      getAvatarUploadStateMock.mockResolvedValueOnce({
        key: objectKeys.stagingKey,
        status,
        updatedAt: "2026-07-26T00:00:00.000Z"
      });

      const response = await POST(createRequest());

      expect(response.status).toBe(409);
      expect(createAvatarObjectKeysMock).not.toHaveBeenCalled();
      expect(createAvatarPresignedPostMock).not.toHaveBeenCalled();
      expect(reserveAvatarUploadMock).not.toHaveBeenCalled();
    }
  );

  it("lets the reservation CAS accept a stale pending upload", async () => {
    getAvatarUploadStateMock.mockResolvedValueOnce({
      key: "old-staging-key",
      status: "pending_upload",
      updatedAt: "2026-07-26T00:00:00.000Z"
    });
    reserveAvatarUploadMock.mockResolvedValueOnce(true);

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(reserveAvatarUploadMock).toHaveBeenCalledWith({
      userId: "session-user",
      stagingKey: objectKeys.stagingKey
    });
    expect(await response.json()).toEqual({
      upload,
      objectKey: objectKeys.stagingKey
    });
  });

  it("returns 409 when the reservation CAS rejects a pending upload", async () => {
    getAvatarUploadStateMock.mockResolvedValueOnce({
      key: "current-staging-key",
      status: "pending_upload",
      updatedAt: "2026-07-27T00:00:00.000Z"
    });
    reserveAvatarUploadMock.mockResolvedValueOnce(false);

    const response = await POST(createRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(reserveAvatarUploadMock).toHaveBeenCalledOnce();
    expect(body).toEqual({
      error: "当前头像状态不允许创建上传请求"
    });
    expect(body).not.toHaveProperty("upload");
    expect(body).not.toHaveProperty("objectKey");
  });

  it("returns a generic 409 when the session user no longer exists", async () => {
    getAvatarUploadStateMock.mockResolvedValueOnce(null);

    const response = await POST(createRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      error: "当前头像状态不允许创建上传请求"
    });
    expect(JSON.stringify(body)).not.toContain("session-user");
    expect(createAvatarPresignedPostMock).not.toHaveBeenCalled();
  });

  it("allows failed state to create a new reservation", async () => {
    getAvatarUploadStateMock.mockResolvedValueOnce({
      key: "old-key",
      status: "failed",
      updatedAt: "2026-07-26T00:00:00.000Z"
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(reserveAvatarUploadMock).toHaveBeenCalledOnce();
    expect(reserveAvatarUploadMock).toHaveBeenCalledWith({
      userId: "session-user",
      stagingKey: objectKeys.stagingKey
    });
  });

  it("uses only the server session user ID to create and reserve keys", async () => {
    await POST(createRequest());

    expect(createAvatarObjectKeysMock).toHaveBeenCalledWith({
      userId: "session-user",
      extension: "webp"
    });
    expect(reserveAvatarUploadMock).toHaveBeenCalledWith({
      userId: "session-user",
      stagingKey: objectKeys.stagingKey
    });
    expect(createAvatarObjectKeysMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: "attacker-user" })
    );
  });

  it("creates the presigned post before persisting the reservation", async () => {
    const callOrder: string[] = [];
    createAvatarPresignedPostMock.mockImplementationOnce(async () => {
      callOrder.push("presign");
      return upload;
    });
    reserveAvatarUploadMock.mockImplementationOnce(async () => {
      callOrder.push("reserve");
      return true;
    });

    await POST(createRequest());

    expect(createAvatarPresignedPostMock).toHaveBeenCalledWith({
      stagingKey: objectKeys.stagingKey,
      contentType: "image/webp"
    });
    expect(callOrder).toEqual(["presign", "reserve"]);
  });

  it("does not persist when presigning fails", async () => {
    const { AvatarStorageUnavailableError } = await import(
      "../../../../lib/avatar/storage-errors"
    );
    createAvatarPresignedPostMock.mockRejectedValueOnce(
      new AvatarStorageUnavailableError()
    );

    const response = await POST(createRequest());

    expect(response.status).toBe(503);
    expect(reserveAvatarUploadMock).not.toHaveBeenCalled();
  });

  it("returns 409 without an upload intent when reservation loses the CAS", async () => {
    reserveAvatarUploadMock.mockResolvedValueOnce(false);

    const response = await POST(createRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      error: "当前头像状态不允许创建上传请求"
    });
    expect(body).not.toHaveProperty("upload");
    expect(body).not.toHaveProperty("objectKey");
  });

  it("returns the opaque presigned fields and staging key unchanged", async () => {
    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      upload,
      objectKey: objectKeys.stagingKey
    });
  });

  it.each([
    "AuthConfigurationError",
    "AuthStorageUnavailableError"
  ] as const)("returns a fixed redacted 503 for %s", async errorName => {
    const errors = await import("../../../../lib/auth/errors");
    getAuthSessionMock.mockRejectedValueOnce(
      new errors[errorName]("policy signature token SDK details")
    );

    const response = await POST(createRequest());
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(serialized).toBe(
      JSON.stringify({ error: "头像服务暂时不可用，请稍后再试" })
    );
    expect(serialized).not.toMatch(/policy|signature|token|SDK/i);
  });

  it.each([
    ["state read", getAvatarUploadStateMock],
    ["reservation", reserveAvatarUploadMock]
  ] as const)(
    "returns a fixed redacted 503 when the DB %s is unavailable",
    async (_operation, operationMock) => {
      const { AuthStorageUnavailableError } = await import(
        "../../../../lib/auth/errors"
      );
      operationMock.mockRejectedValueOnce(
        new AuthStorageUnavailableError(
          "policy signature token SDK database details"
        )
      );

      const response = await POST(createRequest());
      const serialized = JSON.stringify(await response.json());

      expect(response.status).toBe(503);
      expect(serialized).toBe(
        JSON.stringify({ error: "头像服务暂时不可用，请稍后再试" })
      );
      expect(serialized).not.toMatch(/policy|signature|token|SDK|database/i);
    }
  );

  it.each([
    "AvatarStorageConfigurationError",
    "AvatarStorageUnavailableError"
  ] as const)("returns a fixed redacted 503 for %s", async errorName => {
    const errors = await import("../../../../lib/avatar/storage-errors");
    const error = new errors[errorName]();
    error.message = "policy signature token SDK details";
    createAvatarPresignedPostMock.mockRejectedValueOnce(error);

    const response = await POST(createRequest());
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(serialized).toBe(
      JSON.stringify({ error: "头像服务暂时不可用，请稍后再试" })
    );
    expect(serialized).not.toMatch(/policy|signature|token|SDK/i);
  });

  it("rethrows unexpected errors without serializing them", async () => {
    const error = new Error("policy signature token SDK details");
    createAvatarPresignedPostMock.mockRejectedValueOnce(error);

    await expect(POST(createRequest())).rejects.toBe(error);
  });
});
