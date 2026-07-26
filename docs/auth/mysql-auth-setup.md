# MySQL Auth Setup

This auth implementation expects a MySQL database with `users` and `sessions`
tables.

## Required environment

Use either:

- `DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE`
- `DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE?sslMode=required`

Or the discrete variables:

- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`
- `MYSQL_SSL_MODE` (`required` or `disabled`)
- `MYSQL_SSL_CA_PATH` or `MYSQL_SSL_CA_PEM` when TLS verification is required
- `MYSQL_SSL_ALLOW_SELF_SIGNED=true` only as an explicit temporary fallback when
  you cannot yet provide a trusted CA bundle

Also set:

- `AUTH_SESSION_SECRET`

## Schema

- **Fresh database:** Apply [mysql-auth-schema.sql](mysql-auth-schema.sql) before
  enabling the auth routes. The current schema already includes the avatar
  columns, so do not run the avatar migration afterward.
- **Existing database:** If the `users` table predates the avatar columns, run
  the guarded migration below before relying on avatar metadata.

## Avatar metadata migration

For an existing database, run the
[2026-07-26 avatar metadata migration](migrations/2026-07-26-add-avatar-metadata.sql)
before any application phase relies on the new columns. The migration guards
each column independently, so it is safe to rerun after a complete execution or
an interrupted partial execution.

Core user reads in this app revision first select the avatar columns, then retry
the legacy query only when MySQL reports one of those avatar columns as missing.
That narrow fallback protects existing login and session-backed routes if an
automatic ECS deployment reaches the database before the migration. It does not
replace the migration; apply the migration before relying on avatar metadata.

With the discrete MySQL environment variables configured, apply the migration
from the repository root. `MYSQL_SSL_CA_PATH` must point to a trusted Amazon RDS
global CA bundle:

```bash
MYSQL_PWD="$MYSQL_PASSWORD" mysql \
  --host="$MYSQL_HOST" \
  --port="${MYSQL_PORT:-3306}" \
  --user="$MYSQL_USER" \
  --database="$MYSQL_DATABASE" \
  --ssl-mode=VERIFY_IDENTITY \
  --ssl-ca="$MYSQL_SSL_CA_PATH" \
  < docs/auth/migrations/2026-07-26-add-avatar-metadata.sql
```

Verify that all three columns exist in the selected database:

```bash
MYSQL_PWD="$MYSQL_PASSWORD" mysql \
  --host="$MYSQL_HOST" \
  --port="${MYSQL_PORT:-3306}" \
  --user="$MYSQL_USER" \
  --database="$MYSQL_DATABASE" \
  --ssl-mode=VERIFY_IDENTITY \
  --ssl-ca="$MYSQL_SSL_CA_PATH" <<'SQL'
SELECT column_name, column_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'users'
  AND column_name IN ('avatar_key', 'avatar_status', 'avatar_updated_at')
ORDER BY FIELD(
  column_name,
  'avatar_key',
  'avatar_status',
  'avatar_updated_at'
);
SQL
```

A rollback script exists at
`docs/auth/migrations/2026-07-26-add-avatar-metadata.rollback.sql`. Its
per-column guards make repeated and partial rollback attempts safe, but it still
drops the avatar columns and their data. Use it only after the application has
already been rolled back to a revision that does not query these columns.

## ECS / AWS notes

- For ECS, you can choose either:
  - a single `DATABASE_URL` secret plus `AUTH_SESSION_SECRET`
  - or discrete `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`,
    `MYSQL_DATABASE` settings plus `AUTH_SESSION_SECRET`
- ECS environment validation in CI accepts either of those two setups.
- If you use Amazon RDS managed master credentials, keep `MYSQL_HOST`,
  `MYSQL_PORT`, and `MYSQL_DATABASE` as normal environment variables, then map
  the RDS-managed secret JSON keys into ECS secrets for:
  - `MYSQL_USER` -> `username`
  - `MYSQL_PASSWORD` -> `password`
- Ensure the ECS security group can reach the MySQL security group on `3306`.
- Run the database in a private subnet when possible.
- For Amazon RDS, TLS is enabled by default when the host ends with
  `.rds.amazonaws.com`. You can also set `sslMode=required` in `DATABASE_URL`,
  or set `MYSQL_SSL_MODE=required` explicitly.
- Amazon RDS hosts use mysql2's built-in `Amazon RDS` SSL profile by default.
- For non-RDS MySQL servers, provide a trusted CA bundle through one of:
  - `MYSQL_SSL_CA_PATH=/path/to/server-ca.pem`
  - `MYSQL_SSL_CA_PEM=<full PEM contents>`
  - `NODE_EXTRA_CA_CERTS=/path/to/server-ca.pem`
- If you need a short-lived escape hatch while fixing CA distribution, set
  `MYSQL_SSL_ALLOW_SELF_SIGNED=true`. Keep this as temporary as possible because
  it disables certificate verification.

## Runtime target

This MySQL auth path is intended for Node.js server deployments such as AWS ECS.
If you later want to run the auth flow on Cloudflare Workers, add a Cloudflare-
compatible database transport such as Hyperdrive instead of assuming the ECS
configuration will carry over unchanged.
