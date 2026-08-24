import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthConfigurationError,
  AuthStorageUnavailableError
} from "../../../lib/auth/errors";

const { queryOneMock } = vi.hoisted(() => ({
  queryOneMock: vi.fn()
}));

vi.mock("../../../lib/auth/db", () => ({
  queryOne: queryOneMock
}));

describe("GET /api/health/deps", () => {
  afterEach(() => {
    queryOneMock.mockReset();
  });

  it("returns 200 when the database check succeeds", async () => {
    queryOneMock.mockResolvedValue({ ok: 1 });

    const { GET } = await import("./route");
    const res = await GET();
    const data = await res.json();

    expect(queryOneMock).toHaveBeenCalledWith("SELECT 1 AS ok", []);
    expect(res.status).toBe(200);
    expect(data).toEqual({
      database: "ok",
      ok: true
    });
  });

  it("returns 503 when auth storage is unavailable", async () => {
    queryOneMock.mockRejectedValue(
      new AuthStorageUnavailableError("Unable to query the auth database.")
    );

    const { GET } = await import("./route");
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data).toEqual({
      database: "error",
      message: "Unable to query the auth database.",
      ok: false
    });
  });

  it("returns 503 when database configuration is incomplete", async () => {
    queryOneMock.mockRejectedValue(
      new AuthConfigurationError(
        "Set DATABASE_URL or MYSQL_HOST / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE before using auth."
      )
    );

    const { GET } = await import("./route");
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data).toEqual({
      database: "error",
      message:
        "Set DATABASE_URL or MYSQL_HOST / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE before using auth.",
      ok: false
    });
  });
});
