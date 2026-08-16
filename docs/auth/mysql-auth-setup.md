# MySQL Auth Setup

This auth implementation expects a MySQL database with `users`, `sessions`, and
`drafts` tables.

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
  metadata and nullable confirmation-token columns, so do not run either avatar
  migration afterward.
- **Existing database:** If the `users` table predates the avatar columns, run
  both guarded migrations below, in order, before enabling S3 avatar uploads.
  If the database predates draft persistence, also run the guarded drafts
  migration before exposing `/api/drafts` or the workspace draft shelf.

## Avatar metadata migration

For an existing database, run the
[2026-07-26 avatar metadata migration](migrations/2026-07-26-add-avatar-metadata.sql)
and then the
[2026-07-27 confirmation-token migration](migrations/2026-07-27-add-avatar-confirmation-token.sql)
before any application phase relies on the new columns. Both migrations are
guarded, so they are safe to rerun after a complete execution or an interrupted
partial execution. `avatar_confirmation_token` must remain nullable: it is set
only while a confirmation lease is owned and is cleared on reservation,
completion, or failure.

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

MYSQL_PWD="$MYSQL_PASSWORD" mysql \
  --host="$MYSQL_HOST" \
  --port="${MYSQL_PORT:-3306}" \
  --user="$MYSQL_USER" \
  --database="$MYSQL_DATABASE" \
  --ssl-mode=VERIFY_IDENTITY \
  --ssl-ca="$MYSQL_SSL_CA_PATH" \
  < docs/auth/migrations/2026-07-27-add-avatar-confirmation-token.sql
```

Verify that all four columns exist in the selected database:

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
  AND column_name IN (
    'avatar_key',
    'avatar_status',
    'avatar_updated_at',
    'avatar_confirmation_token'
  )
ORDER BY FIELD(
  column_name,
  'avatar_key',
  'avatar_status',
  'avatar_updated_at',
  'avatar_confirmation_token'
);
SQL
```

Rollback scripts exist beside both migrations. Roll back the confirmation-token
column first, and only after every application revision that references it has
been drained. The metadata rollback drops avatar data; use it only after the
application is on a revision that does not query those columns.

## Drafts migration

For an existing database, run the
[2026-08-16 drafts migration](migrations/2026-08-16-add-drafts.sql) before any
application revision relies on workspace draft save / restore.

```bash
MYSQL_PWD="$MYSQL_PASSWORD" mysql \
  --host="$MYSQL_HOST" \
  --port="${MYSQL_PORT:-3306}" \
  --user="$MYSQL_USER" \
  --database="$MYSQL_DATABASE" \
  --ssl-mode=VERIFY_IDENTITY \
  --ssl-ca="$MYSQL_SSL_CA_PATH" \
  < docs/auth/migrations/2026-08-16-add-drafts.sql
```

Verify that the table exists:

```bash
MYSQL_PWD="$MYSQL_PASSWORD" mysql \
  --host="$MYSQL_HOST" \
  --port="${MYSQL_PORT:-3306}" \
  --user="$MYSQL_USER" \
  --database="$MYSQL_DATABASE" \
  --ssl-mode=VERIFY_IDENTITY \
  --ssl-ca="$MYSQL_SSL_CA_PATH" <<'SQL'
SHOW CREATE TABLE drafts;
SQL
```

If you need to roll it back, drain every application revision that reads or
writes `/api/drafts` first, then run:

```bash
MYSQL_PWD="$MYSQL_PASSWORD" mysql \
  --host="$MYSQL_HOST" \
  --port="${MYSQL_PORT:-3306}" \
  --user="$MYSQL_USER" \
  --database="$MYSQL_DATABASE" \
  --ssl-mode=VERIFY_IDENTITY \
  --ssl-ca="$MYSQL_SSL_CA_PATH" \
  < docs/auth/migrations/2026-08-16-add-drafts.rollback.sql
```

## Confirmation concurrency

Avatar confirmation uses a database lease rather than a process-local lock.
Acquiring or reacquiring a lease writes a fresh
`avatar_confirmation_token`. Every completion or leased failure is a
compare-and-swap update fenced by that same token. A stale request whose lease
was replaced cannot complete or fail the newer owner's work.

`pending_upload` reservations can be reclaimed after five minutes, while a
`confirming` lease can be reacquired after 30 seconds. MySQL
`UTC_TIMESTAMP()` is authoritative for both windows; application clocks do not
decide lease ownership.

## ECS avatar storage prerequisites

The S3 avatar path is supported only by the Node.js application running on ECS
in this phase. Cloudflare/OpenNext remains a build target, but is not an
approved runtime for these avatar endpoints.

Configure the ECS application container with:

- `AVATAR_S3_BUCKET`
- standard `AWS_REGION`

There is no `AVATAR_S3_REGION` fallback. `AWS_REGION` is both the AWS SDK client
region and the runtime value checked before deployment.

The application imports `@aws-sdk/client-s3` and
`@aws-sdk/s3-presigned-post` directly. S3 code carries the `server-only`
boundary marker and must not enter a browser bundle. Do not configure static
AWS access keys: the SDK must use the ECS task credential provider.

The ECS **task role** supplies application S3 permissions. The ECS
**execution role** is used by the ECS agent for activities such as image pulls
and cannot substitute for `taskRoleArn`. The named task-role policy must allow:

- `s3:PutObject` and `s3:GetObject` only under
  `arn:aws:s3:::<bucket>/original/*`
- `s3:ListBucket` on `arn:aws:s3:::<bucket>` with an `s3:prefix` condition
  restricted to `original/*`

The bucket must have all four public-access-block controls enabled,
`BucketOwnerEnforced` object ownership, default SSE-S3 encryption using
`AES256`, a CORS rule that allows `POST` from the exact production origin, and
an enabled one-day expiration rule for `original/pending/`.

The deploy workflow runs the read-only
`scripts/verify-avatar-s3-prerequisites.mjs` gate after OIDC credential setup
and before ECR login. Before rollout, manually confirm that both inline and
attached policies on `github-actions-recontent-deploy` permit:

```text
ecs:DescribeServices
ecs:DescribeTaskDefinition
s3:GetBucketPublicAccessBlock
s3:GetBucketCors
s3:GetLifecycleConfiguration
s3:GetBucketOwnershipControls
s3:GetEncryptionConfiguration
iam:GetRolePolicy
iam:ListRolePolicies
iam:ListAttachedRolePolicies
iam:GetPolicy
iam:GetPolicyVersion
iam:SimulatePrincipalPolicy
```

Use dedicated statements with the exact actions above. `Resource: "*"` is
accepted only for `ecs:DescribeTaskDefinition`, whose authorization model
requires the star resource. Every other allow must name the exact current ECS
service, avatar bucket, task/deploy role, or attached managed-policy ARN that
the command reads. In particular, scope `iam:SimulatePrincipalPolicy` to the
task-role ARN. `iam:GetPolicy` and `iam:GetPolicyVersion` are required only when
either role's listing contains an attached managed policy, and must then cover
each listed policy ARN. An unrelated `Action: "*"`/service wildcard or
`Resource: "*"` attachment does not prove this new read scope.

This read scope is a hard deployment gate. The role also retains its existing
ECR push and ECS deployment permissions. Broad externally managed deployment
attachments are enumerated but do not satisfy the gate and do not make this
task fail solely because they exist. They remain a residual rollout risk that
must be reviewed separately; this change does not claim that the deploy role is
least-privilege.

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

This MySQL auth and avatar-storage path is intended for the Node.js server on
AWS ECS. If you later want to run it on Cloudflare Workers, add a
Cloudflare-compatible database transport such as Hyperdrive and a separately
reviewed object-storage integration instead of assuming the ECS configuration
will carry over unchanged.
