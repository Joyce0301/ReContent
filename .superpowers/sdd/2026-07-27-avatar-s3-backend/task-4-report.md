# Task 4 Report: Additive Upload Intent API

## Status

Implemented the additive authenticated S3 upload-intent endpoint without
changing the existing avatar dry-run route, database boundary, UI, S3 boundary,
or package files.

Commit: `feat: issue avatar S3 upload intents` (the Task 4 commit containing
this report).

## Files

- `app/api/profile/avatar/upload-intent/route.ts`
- `app/api/profile/avatar/upload-intent/route.test.ts`
- `.superpowers/sdd/2026-07-27-avatar-s3-backend/task-4-report.md`

## Behavior

- Authentication and the five-per-user/ten-minute process-local rate limit run
  before the bounded request body is read.
- The route maps bounded-body and metadata failures to stable `400`/`413`
  responses, unauthenticated requests to `401`, throttling to `429`, and typed
  auth, DB storage, S3 configuration, and S3 availability failures to the same
  fixed Chinese `503`.
- Object keys use only `session.user.id`; request-provided user identifiers are
  ignored by the validator and never used to generate or reserve keys.
- `confirming` and `uploaded` return `409` before key generation or presigning.
  A missing user state also fails safely with a generic `409`.
- `pending_upload` proceeds to `reserveAvatarUpload`; MySQL's conditional update
  is the only authority that accepts a stale reservation or rejects a fresh or
  raced reservation. No JavaScript timestamp comparison was added.
- Presigning occurs before reservation. A presign failure cannot persist state,
  and a lost reservation CAS returns `409` without exposing the generated
  upload contract.
- Successful responses return the opaque presigned `url`, `fields`, and
  `expiresAt` unchanged, plus the server-generated staging key as `objectKey`.

## RED Evidence

Initial route test:

```text
npx vitest run app/api/profile/avatar/upload-intent/route.test.ts

FAIL app/api/profile/avatar/upload-intent/route.test.ts
Error: Cannot find module '/app/api/profile/avatar/upload-intent/route'
Test Files 1 failed (1)
Tests no tests
```

This was the expected initial RED because the route test was created before the
production route.

The independent reviews then found that the first implementation rejected all
`pending_upload` states before the DB CAS. Tests were corrected first and
produced the second RED:

```text
Test Files 1 failed (1)
Tests 2 failed | 22 passed (24)

expected 409 to be 200
expected reserveAvatarUpload to be called once, but got 0 times
```

This proved stale pending reservations could not reach the database decision.
The route was then minimally changed to allow `pending_upload` through to
`reserveAvatarUpload`.

## GREEN And Verification

Final focused and legacy route regression command:

```text
npx vitest run app/api/profile/avatar/upload-intent/route.test.ts app/api/profile/avatar/route.test.ts

Test Files 2 passed (2)
Tests 47 passed (47)
```

Additional required verification:

```text
npx tsc --noEmit
exit 0

npm run lint
exit 0

git diff --check
exit 0
```

The generated untracked `tsconfig.tsbuildinfo` was deleted after the TypeScript
check and is not part of the Task 4 commit.

## Reviews

- Independent code review completed. Its initial stale-pending/CAS must-fix was
  repaired with test-first evidence; re-review approved the scoped files with
  zero remaining must-fix findings.
- Independent adversarial review completed. It identified the same CAS issue;
  re-review confirmed the fix, DB typed-error redaction coverage, and zero
  remaining must-fix findings.

## Risks

- The existing rate limiter is process-local and therefore best-effort across
  multiple instances. The database reservation CAS remains the authoritative
  per-user state boundary.
- If presigning succeeds but the reservation CAS loses, the unused presigned
  POST remains valid until its short expiry, but it is never returned to the
  caller and no database state is persisted by this request.
- Tests mock the DB and S3 boundaries. Deployment still depends on the existing
  ECS task-role credentials, S3 configuration, database migration, and
  operational smoke checks from the broader backend plan.
