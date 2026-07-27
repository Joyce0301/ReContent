import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  consumeRateLimitMock,
  getAuthSessionMock,
  objectKeyModuleLoaded,
  userStoreModuleLoaded,
  validateAvatarUploadIntentMock
} = vi.hoisted(() => ({
  consumeRateLimitMock: vi.fn(),
  getAuthSessionMock: vi.fn(),
  objectKeyModuleLoaded: { value: false },
  userStoreModuleLoaded: { value: false },
  validateAvatarUploadIntentMock: vi.fn()
}));

vi.mock("../../../lib/auth/rate-limit", () => ({
  consumeRateLimit: consumeRateLimitMock
}));

vi.mock("../../../lib/auth/session", async () => {
  const { AuthConfigurationError, AuthStorageUnavailableError } =
    await vi.importActual<typeof import("../../../lib/auth/errors")>(
      "../../../lib/auth/errors"
    );

  return {
    getAuthSession: getAuthSessionMock,
    isAuthServiceError: (error: unknown) =>
      error instanceof AuthConfigurationError ||
      error instanceof AuthStorageUnavailableError
  };
});

vi.mock("../../../lib/auth/user-store", () => ({
  reserveAvatarUpload: (() => {
    userStoreModuleLoaded.value = true;
    return vi.fn();
  })()
}));

vi.mock("../../../lib/avatar/object-key", () => ({
  createAvatarObjectKey: (() => {
    objectKeyModuleLoaded.value = true;
    return vi.fn();
  })(),
  createAvatarObjectKeys: vi.fn()
}));

vi.mock("../../../lib/avatar/validation", () => ({
  validateAvatarUploadIntent: validateAvatarUploadIntentMock
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

function createRequest(
  body = JSON.stringify({
    fileName: "avatar.webp",
    contentType: "image/webp",
    sizeBytes: 1024
  }),
  headers: Record<string, string> = {}
) {
  return new Request("http://localhost/api/profile/avatar", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body
  });
}

function createJsonBodyWithByteLength(byteLength: number) {
  const json = JSON.stringify({
    fileName: "avatar.webp",
    contentType: "image/webp",
    sizeBytes: 1024
  });
  const paddingLength = byteLength - new TextEncoder().encode(json).byteLength;

  if (paddingLength < 0) {
    throw new Error("Requested body length is smaller than the JSON fixture");
  }

  return `${json}${" ".repeat(paddingLength)}`;
}

beforeEach(() => {
  getAuthSessionMock.mockResolvedValue(session);
  consumeRateLimitMock.mockReturnValue({
    ok: true,
    retryAfterSeconds: 600
  });
  validateAvatarUploadIntentMock.mockReturnValue({
    ok: true,
    value: {
      fileName: "avatar.webp",
      contentType: "image/webp",
      sizeBytes: 1024,
      extension: "webp"
    }
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("POST /api/profile/avatar", () => {
  it("has no persistence or object-key module dependency", () => {
    expect(userStoreModuleLoaded.value).toBe(false);
    expect(objectKeyModuleLoaded.value).toBe(false);
  });

  it("authenticates before reading input and returns 401 without a session", async () => {
    getAuthSessionMock.mockResolvedValueOnce(null);
    const request = createRequest("{");
    const jsonSpy = vi.spyOn(request, "json");

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
  });

  it.each(["AuthConfigurationError", "AuthStorageUnavailableError"] as const)(
    "returns 503 for %s",
    async errorName => {
      const errors = await import("../../../lib/auth/errors");
      getAuthSessionMock.mockRejectedValueOnce(new errors[errorName]());

      const response = await POST(createRequest());

      expect(response.status).toBe(503);
    }
  );

  it("returns 413 for a declared body over 8 KiB before parsing JSON", async () => {
    const request = createRequest("{", { "Content-Length": "9000" });
    const jsonSpy = vi.spyOn(request, "json");

    const response = await POST(request);

    expect(getAuthSessionMock).toHaveBeenCalledOnce();
    expect(response.status).toBe(413);
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(consumeRateLimitMock).toHaveBeenCalledOnce();
  });

  it.each(["-1", "invalid", "1, 2", "1.5"])(
    "returns 400 for malformed Content-Length %j after consuming quota",
    async contentLength => {
      const request = createRequest("{}", { "Content-Length": contentLength });
      const jsonSpy = vi.spyOn(request, "json");

      const response = await POST(request);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Content-Length 格式错误"
      });
      expect(jsonSpy).not.toHaveBeenCalled();
      expect(consumeRateLimitMock).toHaveBeenCalledOnce();
    }
  );

  it("returns 413 when an undeclared actual body exceeds 8 KiB", async () => {
    const request = createRequest(createJsonBodyWithByteLength(8193));

    expect(request.headers.get("content-length")).toBeNull();

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(consumeRateLimitMock).toHaveBeenCalledOnce();
    expect(validateAvatarUploadIntentMock).not.toHaveBeenCalled();
  });

  it("returns 413 when the actual body exceeds an under-limit declaration", async () => {
    const response = await POST(
      createRequest(createJsonBodyWithByteLength(8193), {
        "Content-Length": "100"
      })
    );

    expect(response.status).toBe(413);
    expect(consumeRateLimitMock).toHaveBeenCalledOnce();
    expect(validateAvatarUploadIntentMock).not.toHaveBeenCalled();
  });

  it("accepts a valid JSON body whose actual size is exactly 8 KiB", async () => {
    const request = createRequest(createJsonBodyWithByteLength(8192));
    const jsonSpy = vi.spyOn(request, "json");

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(validateAvatarUploadIntentMock).toHaveBeenCalledWith({
      fileName: "avatar.webp",
      contentType: "image/webp",
      sizeBytes: 1024
    });
  });

  it("returns 413 for an actual body of 8193 bytes", async () => {
    const request = createRequest(createJsonBodyWithByteLength(8193));
    const jsonSpy = vi.spyOn(request, "json");

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const request = createRequest("{");
    const jsonSpy = vi.spyOn(request, "json");
    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "请求体格式错误" });
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it("returns a stable 400 when the request stream fails", async () => {
    const streamError = new Error("request aborted");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(streamError);
      }
    });
    const request = new Request("http://localhost/api/profile/avatar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body,
      duplex: "half"
    } as RequestInit & { duplex: "half" });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "请求体读取失败，请重试"
    });
  });

  it("returns 400 for invalid metadata", async () => {
    validateAvatarUploadIntentMock.mockReturnValueOnce({
      ok: false,
      error: "仅支持 JPEG、PNG 或 WebP 图片"
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "仅支持 JPEG、PNG 或 WebP 图片"
    });
  });

  it("uses the authenticated user rate-limit bucket", async () => {
    await POST(createRequest());

    expect(consumeRateLimitMock).toHaveBeenCalledWith({
      bucket: "avatar-upload-intent",
      key: "session-user",
      max: 20,
      windowMs: 10 * 60 * 1000
    });
  });

  it("returns 429 with Retry-After when throttled", async () => {
    consumeRateLimitMock.mockReturnValueOnce({
      ok: false,
      retryAfterSeconds: 37
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("37");
  });

  it("returns 429 before checking an oversized authenticated body", async () => {
    consumeRateLimitMock.mockReturnValueOnce({
      ok: false,
      retryAfterSeconds: 37
    });

    const response = await POST(
      createRequest(createJsonBodyWithByteLength(8193), {
        "Content-Length": "9000"
      })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("37");
  });

  it("returns the exact dry-run response without leaking identifiers", async () => {
    const clientBody = {
      fileName: "private-avatar-name.webp",
      contentType: "image/webp",
      sizeBytes: 1024
    };

    const response = await POST(createRequest(JSON.stringify(clientBody)));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      validation: {
        status: "ready_for_storage"
      },
      message: "头像信息已通过校验，图片尚未上传或保存"
    });
    expect(JSON.stringify(data)).not.toContain("session-user");
    expect(JSON.stringify(data)).not.toContain("private-avatar-name");
  });

  it("rethrows unexpected errors", async () => {
    const error = new Error("unexpected");
    validateAvatarUploadIntentMock.mockImplementationOnce(() => {
      throw error;
    });

    await expect(POST(createRequest())).rejects.toBe(error);
  });
});
