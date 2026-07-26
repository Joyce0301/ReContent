import { afterEach, describe, expect, it, vi } from "vitest";

const createPoolMock = vi.fn();
const readFileSyncMock = vi.fn();

vi.mock("mysql2/promise", () => ({
  createPool: createPoolMock
}));

vi.mock("node:fs", () => ({
  readFileSync: readFileSyncMock
}));

describe("getAuthPool", () => {
  afterEach(async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    createPoolMock.mockReset();
    readFileSyncMock.mockReset();
  });

  it("configures MySQL DATETIME values to use UTC", async () => {
    vi.stubEnv("MYSQL_HOST", "mysql.internal.example.com");
    vi.stubEnv("MYSQL_PORT", "3306");
    vi.stubEnv("MYSQL_USER", "admin");
    vi.stubEnv("MYSQL_PASSWORD", "secret");
    vi.stubEnv("MYSQL_DATABASE", "Recontentclient");
    vi.stubEnv("MYSQL_SSL_MODE", "disabled");

    const { getAuthPool } = await import("./db");

    getAuthPool();

    expect(createPoolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        timezone: "Z"
      })
    );
  });

  it("uses the built-in Amazon RDS SSL profile for RDS hosts", async () => {
    vi.stubEnv(
      "MYSQL_HOST",
      "database-recontent-login.cq3q6wayumqz.us-east-1.rds.amazonaws.com"
    );
    vi.stubEnv("MYSQL_PORT", "3306");
    vi.stubEnv("MYSQL_USER", "admin");
    vi.stubEnv("MYSQL_PASSWORD", "secret");
    vi.stubEnv("MYSQL_DATABASE", "Recontentclient");
    vi.stubEnv("MYSQL_SSL_MODE", "required");

    const { getAuthPool } = await import("./db");

    getAuthPool();

    expect(createPoolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ssl: "Amazon RDS"
      })
    );
  });

  it("uses a provided CA bundle for non-RDS required TLS", async () => {
    vi.stubEnv(
      "MYSQL_HOST",
      "mysql.internal.example.com"
    );
    vi.stubEnv("MYSQL_PORT", "3306");
    vi.stubEnv("MYSQL_USER", "admin");
    vi.stubEnv("MYSQL_PASSWORD", "secret");
    vi.stubEnv("MYSQL_DATABASE", "Recontentclient");
    vi.stubEnv("MYSQL_SSL_MODE", "required");
    vi.stubEnv("MYSQL_SSL_CA_PATH", "/tmp/internal-ca.pem");
    readFileSyncMock.mockReturnValue("pem-data");

    const { getAuthPool } = await import("./db");

    getAuthPool();

    expect(createPoolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ssl: {
          ca: "pem-data",
          rejectUnauthorized: true
        }
      })
    );
  });

  it("allows an explicit self-signed fallback when requested", async () => {
    vi.stubEnv("MYSQL_HOST", "mysql.internal.example.com");
    vi.stubEnv("MYSQL_PORT", "3306");
    vi.stubEnv("MYSQL_USER", "admin");
    vi.stubEnv("MYSQL_PASSWORD", "secret");
    vi.stubEnv("MYSQL_DATABASE", "Recontentclient");
    vi.stubEnv("MYSQL_SSL_MODE", "required");
    vi.stubEnv("MYSQL_SSL_ALLOW_SELF_SIGNED", "true");

    const { getAuthPool } = await import("./db");

    getAuthPool();

    expect(createPoolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ssl: {
          rejectUnauthorized: false
        }
      })
    );
  });

  it("fails fast when required TLS has no trusted CA bundle", async () => {
    vi.stubEnv("MYSQL_HOST", "mysql.internal.example.com");
    vi.stubEnv("MYSQL_PORT", "3306");
    vi.stubEnv("MYSQL_USER", "admin");
    vi.stubEnv("MYSQL_PASSWORD", "secret");
    vi.stubEnv("MYSQL_DATABASE", "Recontentclient");
    vi.stubEnv("MYSQL_SSL_MODE", "required");

    const { AuthConfigurationError } = await import("./errors");
    const { getAuthPool } = await import("./db");

    expect(() => getAuthPool()).toThrowError(AuthConfigurationError);
    expect(createPoolMock).not.toHaveBeenCalled();
  });
});
