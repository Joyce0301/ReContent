import { afterEach, describe, expect, it, vi } from "vitest";

type LoginRouteModule = typeof import("./route");

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doUnmock("../../../lib/auth/password");
  vi.doUnmock("../../../lib/auth/rate-limit");
  vi.doUnmock("../../../lib/auth/session");
  vi.doUnmock("../../../lib/auth/user-store");
  vi.unstubAllEnvs();
});

async function loadLoginRouteModule(): Promise<LoginRouteModule> {
  return import("./route");
}

describe("POST /api/auth/login", () => {
  it("returns 401 when the account does not exist", async () => {
    vi.doMock("../../../lib/auth/rate-limit", () => ({
      getClientAddress: vi.fn().mockReturnValue("127.0.0.1"),
      consumeRateLimit: vi.fn().mockReturnValue({
        ok: true,
        retryAfterSeconds: 60
      })
    }));
    vi.doMock("../../../lib/auth/user-store", () => ({
      findUserByEmail: vi.fn().mockResolvedValue(null)
    }));

    const { POST } = await loadLoginRouteModule();
    const response = await POST(
      new Request("http://localhost/api/auth/login", {
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

    expect(response.status).toBe(401);
    expect(data.error).toBe("账号或密码不正确，请重新输入");
  });

  it("returns 401 when the password is wrong", async () => {
    vi.doMock("../../../lib/auth/rate-limit", () => ({
      getClientAddress: vi.fn().mockReturnValue("127.0.0.1"),
      consumeRateLimit: vi.fn().mockReturnValue({
        ok: true,
        retryAfterSeconds: 60
      })
    }));
    vi.doMock("../../../lib/auth/user-store", () => ({
      findUserByEmail: vi.fn().mockResolvedValue({
        id: "user-1",
        email: "joyce@example.com",
        displayName: "Joyce",
        passwordHash: "hashed-password",
        avatarKey: null,
        avatarStatus: "not_uploaded",
        avatarUpdatedAt: null,
        createdAt: "2026-07-22T00:00:00.000Z"
      })
    }));
    vi.doMock("../../../lib/auth/password", () => ({
      verifyPassword: vi.fn().mockResolvedValue(false)
    }));

    const { POST } = await loadLoginRouteModule();
    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: "joyce@example.com",
          password: "wrong-password"
        })
      })
    );

    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("账号或密码不正确，请重新输入");
  });

  it("sets a session cookie after successful login", async () => {
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
    vi.doMock("../../../lib/auth/user-store", () => ({
      findUserByEmail: vi.fn().mockResolvedValue({
        id: "user-1",
        email: "joyce@example.com",
        displayName: "Joyce",
        passwordHash: "hashed-password",
        avatarKey: null,
        avatarStatus: "not_uploaded",
        avatarUpdatedAt: null,
        createdAt: "2026-07-22T00:00:00.000Z"
      })
    }));
    vi.doMock("../../../lib/auth/password", () => ({
      verifyPassword: vi.fn().mockResolvedValue(true)
    }));

    const { POST } = await loadLoginRouteModule();
    const response = await POST(
      new Request("http://localhost/api/auth/login", {
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

    expect(response.status).toBe(200);
    expect(data.user.displayName).toBe("Joyce");
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
        findUserByEmail: vi.fn().mockRejectedValue(new AuthConfigurationError())
      };
    });

    const { POST } = await loadLoginRouteModule();
    const response = await POST(
      new Request("http://localhost/api/auth/login", {
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

  it("returns 400 for malformed login input types instead of throwing", async () => {
    const { POST } = await loadLoginRouteModule();
    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: 123,
          password: {}
        })
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns 429 when login is throttled", async () => {
    vi.doMock("../../../lib/auth/rate-limit", () => ({
      getClientAddress: vi.fn().mockReturnValue("127.0.0.1"),
      consumeRateLimit: vi.fn().mockReturnValue({
        ok: false,
        retryAfterSeconds: 45
      })
    }));

    const { POST } = await loadLoginRouteModule();
    const response = await POST(
      new Request("http://localhost/api/auth/login", {
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
    expect(response.headers.get("Retry-After")).toBe("45");
  });
});
