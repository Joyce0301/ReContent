import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  confirmAvatarUploadMock,
  consumeRateLimitMock,
  getAuthSessionMock,
  readBoundedJsonMock
} = vi.hoisted(() => ({
  confirmAvatarUploadMock: vi.fn(),
  consumeRateLimitMock: vi.fn(),
  getAuthSessionMock: vi.fn(),
  readBoundedJsonMock: vi.fn()
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

vi.mock("../../../../lib/avatar/confirm-upload", () => ({
  confirmAvatarUpload: confirmAvatarUploadMock
}));

vi.mock("../../../../lib/http/bounded-json", () => ({
  readBoundedJson: readBoundedJsonMock
}));

import { POST } from "./route";

const objectKey = "original/pending/session-user/upload-1.webp";
const confirmedKey = "original/confirmed/session-user/upload-1.webp";
const session = {
  user: {
    id: "session-user",
    email: "joyce@example.com",
    displayName: "Joyce",
    avatarKey: objectKey,
    avatarStatus: "pending_upload" as const,
    avatarUpdatedAt: "2026-07-27T12:00:00.000Z"
  },
  expiresAt: "2026-08-09T09:00:00.000Z"
};

function createRequest() {
  return new Request("http://localhost/api/profile/avatar/confirm", {
    method: "POST",
    body: JSON.stringify({ objectKey })
  });
}

beforeEach(() => {
  getAuthSessionMock.mockResolvedValue(session);
  consumeRateLimitMock.mockReturnValue({
    ok: true,
    retryAfterSeconds: 600
  });
  readBoundedJsonMock.mockResolvedValue({
    ok: true,
    value: { objectKey }
  });
  confirmAvatarUploadMock.mockResolvedValue({
    ok: true,
    status: "uploaded",
    confirmedKey
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/profile/avatar/confirm", () => {
  it("authenticates before rate limiting or reading the body", async () => {
    getAuthSessionMock.mockResolvedValueOnce(null);

    const response = await POST(createRequest());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "请先登录" });
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
    expect(readBoundedJsonMock).not.toHaveBeenCalled();
    expect(confirmAvatarUploadMock).not.toHaveBeenCalled();
  });

  it("uses a separate per-user confirmation rate limit", async () => {
    await POST(createRequest());

    expect(consumeRateLimitMock).toHaveBeenCalledWith({
      bucket: "avatar-upload-confirmation",
      key: "session-user",
      max: 10,
      windowMs: 10 * 60 * 1000
    });
  });

  it("returns 429 before reading the body", async () => {
    consumeRateLimitMock.mockReturnValueOnce({
      ok: false,
      retryAfterSeconds: 29
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("29");
    expect(readBoundedJsonMock).not.toHaveBeenCalled();
    expect(confirmAvatarUploadMock).not.toHaveBeenCalled();
  });

  it("reads at most 2048 bytes", async () => {
    await POST(createRequest());

    expect(readBoundedJsonMock).toHaveBeenCalledWith(expect.any(Request), 2048);
  });

  it.each([
    ["INVALID_CONTENT_LENGTH", 400, "Content-Length 格式错误"],
    ["INVALID_JSON", 400, "请求体格式错误"],
    ["READ_FAILED", 400, "请求体读取失败，请重试"],
    ["TOO_LARGE", 400, "请求体过大"]
  ] as const)("maps bounded body failure %s to %i", async (reason, status, error) => {
    readBoundedJsonMock.mockResolvedValueOnce({ ok: false, reason });

    const response = await POST(createRequest());

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    expect(confirmAvatarUploadMock).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    {},
    { objectKey: 42 },
    { objectKey },
    { objectKey, extra: true }
  ])("accepts only an exact objectKey string body: %j", async body => {
    if (
      typeof body === "object" &&
      body !== null &&
      !Array.isArray(body) &&
      Object.keys(body).length === 1 &&
      typeof (body as { objectKey?: unknown }).objectKey === "string"
    ) {
      return;
    }

    readBoundedJsonMock.mockResolvedValueOnce({ ok: true, value: body });

    const response = await POST(createRequest());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "请求仅支持 objectKey" });
    expect(confirmAvatarUploadMock).not.toHaveBeenCalled();
  });

  it("passes only the session user and validated object key to the service", async () => {
    await POST(createRequest());

    expect(confirmAvatarUploadMock).toHaveBeenCalledWith({
      userId: "session-user",
      stagingKey: objectKey
    });
  });

  it("returns 200 with the confirmed key for uploaded and idempotent success", async () => {
    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "uploaded",
      confirmedKey
    });
  });

  it.each([
    ["INVALID_KEY", 400, "头像上传请求无效"],
    ["INVALID_OBJECT", 400, "头像文件无效"],
    ["STALE_INTENT", 409, "头像上传请求已失效"],
    ["NOT_FOUND", 409, "尚未找到上传的头像文件"],
    ["IN_PROGRESS", 409, "头像上传正在确认中"]
  ] as const)("maps service result %s to %i", async (reason, status, error) => {
    confirmAvatarUploadMock.mockResolvedValueOnce({ ok: false, reason });

    const response = await POST(createRequest());

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
  });

  it.each([
    "AuthConfigurationError",
    "AuthStorageUnavailableError"
  ] as const)("returns a fixed redacted 503 for %s", async errorName => {
    const errors = await import("../../../../lib/auth/errors");
    getAuthSessionMock.mockRejectedValueOnce(
      new errors[errorName]("credential policy signature token DB details")
    );

    const response = await POST(createRequest());
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(serialized).toBe(
      JSON.stringify({ error: "头像服务暂时不可用，请稍后再试" })
    );
    expect(serialized).not.toMatch(/credential|policy|signature|token|DB/i);
  });

  it.each([
    "AvatarStorageConfigurationError",
    "AvatarStorageUnavailableError"
  ] as const)("returns a fixed redacted 503 for %s", async errorName => {
    const errors = await import("../../../../lib/avatar/storage-errors");
    const error = new errors[errorName]();
    error.message = "credential policy signature token S3 details";
    confirmAvatarUploadMock.mockRejectedValueOnce(error);

    const response = await POST(createRequest());
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(serialized).toBe(
      JSON.stringify({ error: "头像服务暂时不可用，请稍后再试" })
    );
    expect(serialized).not.toMatch(/credential|policy|signature|token|S3/i);
  });

  it("returns a fixed redacted 503 for typed DB unavailability", async () => {
    const { AuthStorageUnavailableError } = await import(
      "../../../../lib/auth/errors"
    );
    confirmAvatarUploadMock.mockRejectedValueOnce(
      new AuthStorageUnavailableError(
        "credential policy signature token database details"
      )
    );

    const response = await POST(createRequest());
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(serialized).toBe(
      JSON.stringify({ error: "头像服务暂时不可用，请稍后再试" })
    );
    expect(serialized).not.toMatch(
      /credential|policy|signature|token|database/i
    );
  });

  it("rethrows unknown programming errors without serializing them", async () => {
    const error = new Error("programming invariant failed");
    confirmAvatarUploadMock.mockRejectedValueOnce(error);

    await expect(POST(createRequest())).rejects.toBe(error);
  });
});
