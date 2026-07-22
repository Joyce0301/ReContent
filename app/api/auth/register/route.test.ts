import { afterEach, describe, expect, it, vi } from "vitest";

type RegisterRouteModule = typeof import("./route");

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doUnmock("../../../lib/auth/password");
  vi.doUnmock("../../../lib/auth/rate-limit");
  vi.doUnmock("../../../lib/auth/session");
  vi.doUnmock("../../../lib/auth/user-store");
  vi.unstubAllEnvs();
});

async function loadRegisterRouteModule(): Promise<RegisterRouteModule> {
  return import("./route");
}

describe("POST /api/auth/register", () => {
  it("returns 400 for invalid registration input", async () => {
    const { POST } = await loadRegisterRouteModule();
    const response = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: "bad-email",
          password: "short"
        })
      })
    );

    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("请输入有效的邮箱地址");
  });

  it("returns 409 when the email already exists", async () => {
    vi.doMock("../../../lib/auth/rate-limit", () => ({
      getClientAddress: vi.fn().mockReturnValue("127.0.0.1"),
      consumeRateLimit: vi.fn().mockReturnValue({
        ok: true,
        retryAfterSeconds: 60
      })
    }));
    vi.doMock("../../../lib/auth/password", () => ({
      hashPassword: vi.fn().mockResolvedValue("hashed-password")
    }));
    vi.doMock("../../../lib/auth/user-store", () => ({
      findUserByEmail: vi.fn().mockResolvedValue(null),
      createUser: vi.fn().mockResolvedValue({
        ok: false,
        error: "EMAIL_EXISTS"
      })
    }));

    const { POST } = await loadRegisterRouteModule();
    const response = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: "joyce@example.com",
          password: "password-123"
        })
      })
    );

    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("这个邮箱已经注册过了，请直接登录");
  });

  it("sets a session cookie after successful registration", async () => {
    vi.doMock("../../../lib/auth/session", async () => {
      const actual = await vi.importActual<typeof import("../../../lib/auth/session")>(
        "../../../lib/auth/session"
      );

      return {
        ...actual,
        attachSessionCookieForUser: vi.fn(async response => {
          response.cookies.set("recontent_session", "mock-session-token", {
            httpOnly: true,
            sameSite: "lax",
            path: "/"
          });
        })
      };
    });
    vi.doMock("../../../lib/auth/rate-limit", () => ({
      getClientAddress: vi.fn().mockReturnValue("127.0.0.1"),
      consumeRateLimit: vi.fn().mockReturnValue({
        ok: true,
        retryAfterSeconds: 60
      })
    }));
    vi.doMock("../../../lib/auth/password", () => ({
      hashPassword: vi.fn().mockResolvedValue("hashed-password")
    }));
    vi.doMock("../../../lib/auth/user-store", () => ({
      findUserByEmail: vi.fn().mockResolvedValue(null),
      createUser: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          id: "user-1",
          email: "joyce@example.com",
          displayName: "Joyce",
          passwordHash: "hashed-password",
          createdAt: "2026-07-22T00:00:00.000Z"
        }
      })
    }));

    const { POST } = await loadRegisterRouteModule();
    const response = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: "joyce@example.com",
          password: "password-123",
          displayName: "Joyce"
        })
      })
    );

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.user.email).toBe("joyce@example.com");
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("recontent_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
  });

  it("returns 503 when auth storage is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SESSION_SECRET", "prod-secret");
    vi.doMock("../../../lib/auth/session", async () => {
      const actual = await vi.importActual<typeof import("../../../lib/auth/session")>(
        "../../../lib/auth/session"
      );

      return {
        ...actual,
        attachSessionCookieForUser: vi.fn()
      };
    });
    vi.doMock("../../../lib/auth/rate-limit", () => ({
      getClientAddress: vi.fn().mockReturnValue("127.0.0.1"),
      consumeRateLimit: vi.fn().mockReturnValue({
        ok: true,
        retryAfterSeconds: 60
      })
    }));
    vi.doMock("../../../lib/auth/user-store", async () => {
      const { AuthConfigurationError } = await vi.importActual<
        typeof import("../../../lib/auth/errors")
      >("../../../lib/auth/errors");

      return {
        findUserByEmail: vi.fn().mockResolvedValue(null),
        createUser: vi.fn().mockRejectedValue(new AuthConfigurationError())
      };
    });

    const { POST } = await loadRegisterRouteModule();
    const response = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: "joyce@example.com",
          password: "password-123"
        })
      })
    );

    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toContain("DATABASE_URL");
  });

  it("returns 400 for malformed field types instead of throwing", async () => {
    const { POST } = await loadRegisterRouteModule();
    const response = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: 123,
          password: {},
          displayName: []
        })
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns 429 when registration is throttled", async () => {
    vi.doMock("../../../lib/auth/rate-limit", () => ({
      getClientAddress: vi.fn().mockReturnValue("127.0.0.1"),
      consumeRateLimit: vi.fn().mockReturnValue({
        ok: false,
        retryAfterSeconds: 60
      })
    }));

    const { POST } = await loadRegisterRouteModule();
    const response = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: "joyce@example.com",
          password: "password-123"
        })
      })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
  });
});
