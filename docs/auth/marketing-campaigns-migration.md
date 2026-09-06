# Marketing Campaigns Migration

Campaigns are personal projects. The application stores their brief in `campaigns`,
and stores every generated result in the existing `drafts.results_json` field.
The nullable `drafts.campaign_id` associates a draft with a campaign. Existing
drafts remain independent. Every application query uses the authenticated user ID;
the composite foreign key additionally prevents cross-user associations in MySQL.

## Deployment Order

1. `npm run build` builds Next.js and bundles `scripts/migrate-campaigns.ts`.
2. Docker includes the compiled migration and `mysql2` in its standalone runtime.
3. Deploy renders the new ECS image, then `run-campaign-migration.mjs` runs a
   one-off Fargate task in the service's network with the same database secrets.
4. The task acquires a MySQL advisory lock, creates `campaigns`, adds the nullable
   draft reference and ownership foreign key, and verifies the schema.
5. Only exit code 0 permits the workflow to update the ECS service. Inspect the
   logged task ARN and its CloudWatch logs if migration fails.

The database credential must have CREATE, ALTER, INDEX, REFERENCES and SELECT
permissions on the application database. The deployment role needs ECS
RegisterTaskDefinition, RunTask, DescribeTasks, StopTask, DescribeServices and
PassRole for the existing task/execution roles. No database credentials are
passed through GitHub logs. No production migration is performed by local builds.

## Local / Operator Commands

Configure `DATABASE_URL` or the existing `MYSQL_*` variables through the normal
secret environment. Do not put a production password into a committed file.

```bash
npm run build:migration
npm run migrate:campaigns
npm run migrate:campaigns -- --check
```

The migration expects `users` and `drafts` to exist, and reuses the collation of
`users.id`. For a fresh database apply `mysql-auth-schema.sql` first. The script
is rerunnable after partial DDL completion; incompatible existing columns or
constraints cause it to fail instead of replacing data. `--check` performs no DDL.

Rolling back the application does not require dropping the added schema. Do not
drop `campaigns` or `campaign_id` during rollback. The MVP has no campaign deletion
API. Deleting a user cascades through their campaigns and drafts; the campaign
foreign key also cascades, so manually deleting a campaign deletes its drafts.

## Verification

CI runs a disposable MySQL 8 database. This integration test creates and drops
only its own randomly named test database, never the database named in the URL:

```bash
CAMPAIGN_TEST_DATABASE_URL=mysql://root:TEST_PASSWORD@127.0.0.1:3306 \
  npx vitest run scripts/migrate-campaigns.test.ts
```

It checks repeat migration, read-only verification, preservation of old drafts,
campaign create/edit, draft ownership, legacy-client association preservation,
and user deletion. Frontend tests cover creation, automatic save, history restore,
and unsaved changes. Generation tests verify use of the server-loaded brief.

Not included: teams, bulk platform generation, publishing, scheduling, or campaign
deletion. Brief edits affect future generations; saved results are not rewritten.
