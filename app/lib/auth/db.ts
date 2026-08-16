import { readFileSync } from "node:fs";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { AuthConfigurationError, AuthStorageUnavailableError } from "./errors";

type MysqlSslMode = "disabled" | "required";

type MysqlEnvConfig = {
  allowSelfSignedTls: boolean;
  database: string;
  host: string;
  password: string;
  port: number;
  sslCaPath?: string;
  sslCaPem?: string;
  sslMode: MysqlSslMode;
  user: string;
};

type SqlValue = boolean | Date | null | number | string;

let pool: Pool | null = null;

function isAwsRdsHost(host: string) {
  return host.endsWith(".rds.amazonaws.com");
}

function parseBooleanEnv(value?: string) {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseDatabaseUrl(value: string): MysqlEnvConfig {
  const url = new URL(value);

  if (!url.protocol.startsWith("mysql")) {
    throw new AuthConfigurationError("DATABASE_URL must use the mysql protocol.");
  }

  const sslModeParam = url.searchParams.get("sslMode") ?? url.searchParams.get("ssl");
  const requiresTlsByDefault = isAwsRdsHost(url.hostname);

  return {
    allowSelfSignedTls: parseBooleanEnv(process.env.MYSQL_SSL_ALLOW_SELF_SIGNED),
    host: url.hostname,
    port: Number(url.port || "3306"),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    sslCaPath: process.env.MYSQL_SSL_CA_PATH || process.env.NODE_EXTRA_CA_CERTS || undefined,
    sslCaPem: process.env.MYSQL_SSL_CA_PEM || undefined,
    sslMode:
      sslModeParam === "true" || sslModeParam === "1" || sslModeParam === "required"
        ? "required"
        : requiresTlsByDefault
          ? "required"
          : "disabled"
  };
}

function getMysqlConfig(): MysqlEnvConfig {
  if (process.env.DATABASE_URL) {
    return parseDatabaseUrl(process.env.DATABASE_URL);
  }

  const host = process.env.MYSQL_HOST;
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DATABASE;
  const port = Number(process.env.MYSQL_PORT || "3306");
  const sslMode =
    process.env.MYSQL_SSL_MODE === "required" ||
    host && isAwsRdsHost(host)
      ? "required"
      : "disabled";

  if (!host || !user || !password || !database) {
    throw new AuthConfigurationError(
      "Set DATABASE_URL or MYSQL_HOST / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE before using auth."
    );
  }

  return {
    allowSelfSignedTls: parseBooleanEnv(process.env.MYSQL_SSL_ALLOW_SELF_SIGNED),
    host,
    user,
    password,
    database,
    port,
    sslCaPath: process.env.MYSQL_SSL_CA_PATH || process.env.NODE_EXTRA_CA_CERTS || undefined,
    sslCaPem: process.env.MYSQL_SSL_CA_PEM || undefined,
    sslMode
  };
}

function getMysqlSslOptions(config: MysqlEnvConfig) {
  if (config.sslMode !== "required") {
    return undefined;
  }

  if (isAwsRdsHost(config.host)) {
    return "Amazon RDS";
  }

  if (config.sslCaPem) {
    return {
      ca: config.sslCaPem,
      rejectUnauthorized: true
    };
  }

  if (config.sslCaPath) {
    return {
      ca: readFileSync(config.sslCaPath, "utf8"),
      rejectUnauthorized: true
    };
  }

  if (config.allowSelfSignedTls) {
    return {
      rejectUnauthorized: false
    };
  }

  throw new AuthConfigurationError(
    "TLS is required for MySQL, but no trusted CA bundle is configured. Set MYSQL_SSL_CA_PATH, MYSQL_SSL_CA_PEM, or explicitly opt in to MYSQL_SSL_ALLOW_SELF_SIGNED=true."
  );
}

export function getAuthPool() {
  if (pool) {
    return pool;
  }

  const config = getMysqlConfig();

  pool = createPool({
    database: config.database,
    host: config.host,
    password: config.password,
    port: config.port,
    ssl: getMysqlSslOptions(config),
    timezone: "Z",
    user: config.user,
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60_000,
    queueLimit: 0
  });

  return pool;
}

export async function queryOne<T extends RowDataPacket>(
  sql: string,
  values: SqlValue[]
) {
  try {
    const [rows] = await getAuthPool().query<T[]>(sql, values);
    return rows[0] ?? null;
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      throw error;
    }

    throw new AuthStorageUnavailableError("Unable to query the auth database.", {
      cause: error
    });
  }
}

export async function queryAll<T extends RowDataPacket>(
  sql: string,
  values: SqlValue[]
) {
  try {
    const [rows] = await getAuthPool().query<T[]>(sql, values);
    return rows;
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      throw error;
    }

    throw new AuthStorageUnavailableError("Unable to query the auth database.", {
      cause: error
    });
  }
}

export async function execute(sql: string, values: SqlValue[]) {
  try {
    return await getAuthPool().execute(sql, values);
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      throw error;
    }

    throw new AuthStorageUnavailableError("Unable to write to the auth database.", {
      cause: error
    });
  }
}
