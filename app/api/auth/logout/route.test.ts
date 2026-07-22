import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doUnmock("../../../lib/auth/session");
});

describe("POST /api/auth/logout", () => {
  it("clears the auth cookie", async () => {
    vi.doMock("../../../lib/auth/session", async () => {
      const actual = await vi.importActual<typeof import("../../../lib/auth/session")>(
        "../../../lib/auth/session"
      );

      return {
        ...actual,
        clearCurrentSession: vi.fn()
      };
    });

    const { POST } = await import("./route");
    const response = await POST();
    const cookie = response.headers.get("set-cookie");

    expect(response.status).toBe(200);
    expect(cookie).toContain("recontent_session=");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
  });

  it("still clears the cookie when server-side cleanup fails", async () => {
    vi.resetModules();
    vi.doMock("../../../lib/auth/session", async () => {
      const actual = await vi.importActual<typeof import("../../../lib/auth/session")>(
        "../../../lib/auth/session"
      );

      return {
        ...actual,
        clearCurrentSession: vi.fn().mockRejectedValue(new Error("db down"))
      };
    });

    const { POST } = await import("./route");
    const response = await POST();
    const cookie = response.headers.get("set-cookie");
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toBe("会话退出未完全完成，请稍后重试");
    expect(cookie).toContain("recontent_session=");
    expect(cookie).toContain("Max-Age=0");
  });
});
