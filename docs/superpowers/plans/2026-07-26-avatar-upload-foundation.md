# Avatar Upload Foundation Implementation Plan

> This plan records the final safety-scoped implementation. It intentionally
> stops at authenticated metadata validation and does not persist an upload
> intent.

**Goal:** Prepare the schema, auth model, validation boundary, and profile UI
for a later S3 avatar phase without uploading or saving an image.

**Architecture:** Core user reads prefer the avatar-aware schema and use a
narrow legacy-query fallback only when MySQL reports a missing avatar column.
The protected API authenticates, rate-limits, bounds, parses, and validates
metadata before returning a dry-run response. The profile UI presents a local
preview and honest storage-not-connected feedback.

**Tech Stack:** Next.js App Router, React 19, TypeScript, MySQL/Aurora, Vitest,
Testing Library, Tailwind CSS.

---

## Final Scope

Included:

- Avatar columns, status types, normalization, and user/session mappings.
- Guarded forward and rollback migrations.
- Rollout-safe legacy reads for existing databases awaiting migration.
- Metadata validation and a standalone future object-key helper.
- Authenticated, rate-limited, bounded dry-run API.
- Local profile preview and honest `待接入 S3` feedback.
- Required CI coverage and migration operations documentation.

Excluded:

- Image-byte transfer.
- Object-key generation inside `POST /api/profile/avatar`.
- Avatar database writes or `pending_upload` mutation.
- A missing-update `404` path.
- S3, presigned URLs, IAM, CORS, Lambda, or stored-avatar rendering.

## File Map

- `docs/auth/mysql-auth-schema.sql`: avatar columns for fresh databases.
- `docs/auth/migrations/2026-07-26-add-avatar-metadata.sql`: guarded forward
  migration for existing databases.
- `docs/auth/migrations/2026-07-26-add-avatar-metadata.rollback.sql`: guarded,
  destructive rollback.
- `docs/auth/mysql-auth-setup.md`: verified-TLS migration and rollout guidance.
- `app/lib/avatar/types.ts`: avatar states and normalization.
- `app/lib/avatar/validation.ts`: declared metadata validation.
- `app/lib/avatar/object-key.ts`: standalone helper reserved for the next S3
  phase; the current route must not import it.
- `app/lib/auth/types.ts`: normalized avatar fields on user/session types.
- `app/lib/auth/user-store.ts`: avatar-aware reads and precise legacy fallback.
- `app/api/profile/avatar/route.ts`: authenticated metadata-validation dry run.
- `app/profile/avatar-upload-control.tsx`: local preview and dry-run UI.
- `.github/workflows/ci.yml`: required non-live regression coverage.

## Task 1: Schema, Mapping, And Rollout Safety

### Schema And Types

The current `users` schema contains:

```sql
avatar_key VARCHAR(512) NULL
avatar_status VARCHAR(32) NOT NULL DEFAULT 'not_uploaded'
avatar_updated_at DATETIME NULL
```

`AuthUserRecord` and `AuthSessionUser` contain:

```ts
avatarKey: string | null;
avatarStatus: AvatarStatus;
avatarUpdatedAt: string | null;
```

Keep `not_uploaded`, `pending_upload`, `ready`, and `failed` in the type model
for future storage/processing phases. Unknown database status values normalize
to `not_uploaded`. This phase does not write any of those states.

### Precise Legacy Fallback

Implement email and ID reads in this order:

1. Query `avatar_key`, `avatar_status`, and `avatar_updated_at` with the core
   user columns.
2. Return the fully mapped user when the query succeeds.
3. Retry the legacy query only for MySQL `ER_BAD_FIELD_ERROR`/1054 whose error
   text names `avatar_key`, `avatar_status`, or `avatar_updated_at`.
4. Map a legacy row to null avatar key/timestamp and `not_uploaded`.
5. Rethrow every unrelated SQL, connectivity, configuration, or missing-column
   error.

This fallback protects login and session-backed routes when an automatic ECS
deployment is ahead of the migration. It must not mask general schema drift.

### Repeat-Safe Migrations

The forward migration checks each column through
`information_schema.columns`, adding only a missing column. Each guard is
independent so rerunning after a partial migration completes the remaining
work.

The rollback checks each column independently and drops only columns that
exist, in reverse order. It is repeat-safe and partial-run-safe, but remains
destructive and may run only after rolling the application back.

Fresh databases apply `mysql-auth-schema.sql` only. Existing databases apply
the guarded forward migration before relying on avatar metadata.

### Verification

```bash
npx vitest run \
  app/lib/avatar/types.test.ts \
  app/lib/auth/user-store.test.ts \
  app/lib/auth/session.test.ts
```

Required cases:

- Avatar-aware reads and normalized mapping.
- Legacy fallback for each missing avatar column.
- No fallback for unrelated missing fields or other database failures.
- Forward and rollback migration guards for complete and partial states.

## Task 2: Bounded Metadata Dry-Run API

### Validation Domain

Accept:

- Non-empty `fileName` up to 255 characters.
- `image/jpeg`, `image/png`, or `image/webp`.
- Integer `sizeBytes` from 1 through 5 MiB.
- Matching `.jpg`/`.jpeg`, `.png`, or `.webp` extension.

Normalize `.jpeg` to `jpg` in validation output. Do not trust a client-provided
user ID or object key.

The standalone object-key helper and its tests may remain for the next phase.
The current route must have no import or dependency on that helper.

### Route Order

`POST /api/profile/avatar`:

1. Load the auth session before reading input.
2. Return `401` when the session is absent.
3. Consume the `avatar-upload-intent` rate-limit bucket using the authenticated
   user ID, with 20 requests per 10 minutes.
4. Return `429` with `Retry-After` when throttled.
5. Validate `Content-Length`; reject malformed values with `400` and values
   over 8 KiB with `413`.
6. Read and count the actual stream up to 8 KiB, regardless of its declaration.
7. Return `413` for an oversized actual body.
8. Return a controlled `400` for malformed JSON or an aborted/failing stream.
9. Validate the metadata and return `400` for invalid values.
10. Return the exact `200` dry-run response.

Recognized auth configuration/storage errors return `503`. Unexpected errors
remain visible to the framework.

### Success Contract

```json
{
  "validation": {
    "status": "ready_for_storage"
  },
  "message": "头像信息已通过校验，图片尚未上传或保存"
}
```

The route must not:

- Generate an object key.
- Call an avatar persistence function.
- Write any user row.
- Change `avatar_status` to `pending_upload`.
- Return `201` or a missing-update `404`.
- Claim upload or save completion.

### Verification

```bash
npx vitest run \
  app/lib/avatar/*.test.ts \
  app/api/profile/avatar/route.test.ts \
  app/lib/auth/user-store.test.ts
```

Required cases include unauthenticated access, auth failures, per-user
throttling, malformed `Content-Length`, declared and actual body boundaries,
malformed JSON, failed streams, metadata boundaries, the exact `200` response,
and absence of persistence/object-key route dependencies.

## Task 3: Honest Profile Dry-Run UI

The client control receives only the avatar initial and normalized initial
status. It must not receive user IDs, object keys, cookies, or tokens.

On selection:

- Validate metadata before requesting the API.
- Show a temporary preview labelled `本地预览，尚未保存`.
- Send only `fileName`, `file.type`, and `file.size`.
- Keep the existing avatar initial visible as the persisted-state fallback.

On the exact successful response:

- Show `待接入 S3`.
- Show `头像信息已通过校验，图片尚未上传或保存`.
- Never show an uploaded/saved success claim.
- Disable repeat submission until the user selects a new file.

On cleanup:

- Revoke replaced and unmounted object URLs.
- Abort an in-flight request on unmount.
- Ignore the resulting abort rather than showing a stale network error.

### Verification

```bash
npx vitest run \
  app/profile/avatar-upload-control.test.tsx \
  app/profile/profile-view.test.tsx \
  app/profile/page.test.tsx \
  app/components/recontent/header.test.tsx \
  app/workspace/page.test.tsx \
  app/page.test.tsx
```

Verify local validation, metadata-only requests, exact success text, no
upload/save claim, response errors, malformed responses, request abort, preview
cleanup, profile protection, header, workspace, and home-page regressions.

## Task 4: CI And Deployment Documentation

PR CI runs:

```bash
npx vitest run \
  app/api/repurpose/*.test.ts \
  app/api/auth/*/route.test.ts \
  app/api/profile/avatar/route.test.ts \
  app/lib/auth/*.test.ts \
  app/lib/avatar/*.test.ts \
  app/components/recontent/header.test.tsx \
  app/profile/*.test.tsx \
  app/workspace/*.test.tsx \
  app/page.test.tsx \
  --exclude app/api/repurpose/content-extraction.live.test.ts
```

Keep the opt-in live extraction suite outside required CI. Preserve lint,
production build, Docker build, permissions, concurrency, and docs-only
`paths-ignore`.

Deployment documentation must state:

- Existing databases should run the guarded migration over verified TLS before
  relying on avatar metadata.
- A late migration does not break existing auth because core reads have the
  precise legacy fallback.
- Fresh databases use the current full schema and do not run the forward
  migration afterward.
- Rollback is guarded but destructive and follows application rollback only.

## Final Gate

Run:

```bash
npx vitest run \
  app/api/repurpose/*.test.ts \
  app/api/auth/*/route.test.ts \
  app/api/profile/avatar/route.test.ts \
  app/lib/auth/*.test.ts \
  app/lib/avatar/*.test.ts \
  app/components/recontent/header.test.tsx \
  app/profile/*.test.tsx \
  app/workspace/*.test.tsx \
  app/page.test.tsx \
  --exclude app/api/repurpose/content-extraction.live.test.ts
npm run lint
NEXT_TELEMETRY_DISABLED=1 npm run build
git diff --check
```

Independent code review and adversarial review should prioritize fallback
precision, migration partial-run safety, bounded stream failures, accidental
persistence, misleading UI claims, secret/key exposure, regressions, and
deployment differences.
