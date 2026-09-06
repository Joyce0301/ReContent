import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { getAuthPool } from "../app/lib/auth/db";

export async function migrateCampaigns(connection: PoolConnection, checkOnly = false) {
  const rows = async (sql: string, values: string[] = []) => (await connection.query<RowDataPacket[]>(sql, values))[0];
  const [lock] = await rows("SELECT GET_LOCK('recontent_campaigns_v1', 30) AS acquired");
  if (lock?.acquired !== 1) throw new Error("Campaign migration lock unavailable");
  try {
    // Bound metadata-lock waits rather than blocking an application deployment indefinitely.
    await connection.query("SET SESSION lock_wait_timeout = 30");
    const [userId] = await rows("SELECT CHARACTER_SET_NAME AS charset, COLLATION_NAME AS collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id'");
    if (!userId || !/^[a-zA-Z0-9_]+$/.test(userId.charset) || !/^[a-zA-Z0-9_]+$/.test(userId.collation)) throw new Error("users.id schema is unavailable");
    const [draftUser] = await rows("SELECT COLLATION_NAME AS collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'drafts' AND COLUMN_NAME = 'user_id'");
    if (draftUser?.collation !== userId.collation) throw new Error("drafts.user_id must exist and match users.id collation");
    const encoding = `CHARACTER SET ${userId.charset} COLLATE ${userId.collation}`;
    if (!checkOnly) {
      await connection.query(`CREATE TABLE IF NOT EXISTS campaigns (
        id CHAR(36) ${encoding} NOT NULL PRIMARY KEY,
        user_id CHAR(36) ${encoding} NOT NULL,
        name VARCHAR(100) NOT NULL,
        goal VARCHAR(500) NOT NULL,
        audience VARCHAR(500) NOT NULL,
        key_message TEXT NOT NULL,
        cta VARCHAR(500) NOT NULL,
        source_text MEDIUMTEXT NOT NULL,
        source_url VARCHAR(2048) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_campaign_owner (id, user_id),
        INDEX idx_campaign_user_updated (user_id, updated_at),
        CONSTRAINT fk_campaign_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    }
    const [column] = await rows("SELECT IS_NULLABLE AS nullable, COLUMN_TYPE AS type, COLLATION_NAME AS collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'drafts' AND COLUMN_NAME = 'campaign_id'");
    if (!column && !checkOnly) await connection.query(`ALTER TABLE drafts ADD COLUMN campaign_id CHAR(36) ${encoding} NULL`);
    else if (!column || column.nullable !== "YES" || column.type !== "char(36)" || column.collation !== userId.collation) throw new Error("drafts.campaign_id schema mismatch");

    const constraints = await rows("SELECT COLUMN_NAME AS col, REFERENCED_TABLE_NAME AS target, REFERENCED_COLUMN_NAME AS targetCol FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'drafts' AND CONSTRAINT_NAME = 'fk_draft_campaign_owner' ORDER BY ORDINAL_POSITION");
    if (!constraints.length && !checkOnly) {
      await connection.query("ALTER TABLE drafts ADD CONSTRAINT fk_draft_campaign_owner FOREIGN KEY (campaign_id, user_id) REFERENCES campaigns(id, user_id) ON DELETE CASCADE");
    } else if (JSON.stringify(constraints.map(row => [row.col, row.target, row.targetCol])) !== JSON.stringify([["campaign_id", "campaigns", "id"], ["user_id", "campaigns", "user_id"]])) throw new Error("Campaign ownership constraint missing or mismatched");

    // These reads also fail fast on incomplete tables left by an interrupted/manual migration.
    await connection.query("SELECT id, user_id, name, goal, audience, key_message, cta, source_text, source_url, created_at, updated_at FROM campaigns LIMIT 0");
    await connection.query("SELECT campaign_id FROM drafts LIMIT 0");
  } finally {
    await connection.query("SELECT RELEASE_LOCK('recontent_campaigns_v1')");
  }
}

if (require.main === module) {
  const pool = getAuthPool();
  (async () => {
    const connection = await pool.getConnection();
    try { await migrateCampaigns(connection, process.argv.includes("--check")); }
    finally { connection.release(); }
    console.log("PASS campaign schema");
  })().catch(error => {
    console.error("FAIL campaign schema", { code: error?.code, message: error?.code ? "Database migration failed; inspect schema and database permissions" : error.message });
    process.exitCode = 1;
  }).finally(() => pool.end());
}
