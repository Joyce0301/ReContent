# Task 5 Report: Immutable Upload Confirmation Service And API

## Status

Implemented the token-fenced immutable avatar confirmation service and its
authenticated API without changing the user-store, S3 boundary, object-key
helpers, existing routes, UI, schema, or package files.

Commit: `feat: confirm immutable avatar originals` (this commit).

## Files

- `app/lib/avatar/confirm-upload.ts`
- `app/lib/avatar/confirm-upload.test.ts`
- `app/api/profile/avatar/confirm/route.ts`
- `app/api/profile/avatar/confirm/route.test.ts`
- `.superpowers/sdd/2026-07-27-avatar-s3-backend/task-5-report.md`

## RED Evidence

The orchestrator test was created before the service:

```text
npx vitest run app/lib/avatar/confirm-upload.test.ts

FAIL app/lib/avatar/confirm-upload.test.ts
Error: Cannot find module '/app/lib/avatar/confirm-upload'
Test Files 1 failed (1)
```

The route test was created before the endpoint:

```text
npx vitest run app/api/profile/avatar/confirm/route.test.ts

FAIL app/api/profile/avatar/confirm/route.test.ts
Error: Cannot find module '/app/api/profile/avatar/confirm/route'
Test Files 1 failed (1)
```

Independent code review found that the first route implementation mapped an
oversized body to out-of-contract `413`. The test was changed first:

```text
FAIL maps bounded body failure TOO_LARGE to 400
AssertionError: expected 413 to be 400
Tests 1 failed | 26 passed (27)
```

The minimal route fix then mapped `TOO_LARGE` to the confirmation contract's
`400`.

## Behavior And Fencing

- Malformed and cross-user staging keys are rejected before any DB or S3 call.
- Matching `uploaded` state returns idempotent success without S3 access.
- `pending_upload` heads and validates staging before lease acquisition. A
  lost acquire CAS performs one fresh state read and makes no copy or terminal
  write.
- `confirming` always attempts the database lease CAS; JavaScript never
  compares timestamps. A lost reacquire CAS performs a fresh read with zero S3
  or terminal writes.
- Every leased completion or failure receives the exact token returned to that
  request. A lost terminal CAS succeeds only when a fresh read proves the same
  deterministic confirmed key is already `uploaded`; otherwise it returns
  `IN_PROGRESS`.
- Copy receives the observed staging ETag and deterministic confirmed key.
  After `412` or `409`, recovery only heads confirmed and never copies twice.
- A valid existing confirmed object completes without overwrite. A source
  precondition failure with no confirmed object conditionally fails the lease;
  a `409` with no confirmed object returns `IN_PROGRESS`.
- Stale recovery with both confirmed and staging missing conditionally fails
  with the reacquired token. Invalid size, integer length, type, extension, and
  ETag follow pending or leased conditional failure according to ownership.
- Typed S3 configuration, credential, authorization, and network failures keep
  propagating as unavailable errors. The route returns one fixed redacted
  Chinese `503`; unknown programming errors are rethrown.
- The route authenticates before its independent
  `avatar-upload-confirmation` per-user limiter, then reads at most 2048 bytes.
  It accepts only an exact `{ objectKey: string }` body.

## Reviews

- Independent code review completed. Its single must-fix was the oversized-body
  status mismatch; the TDD fix was re-reviewed and approved with no new
  must-fix findings.
- Independent adversarial review completed across lease loss, stale owners,
  metadata attacks, conditional-copy conflicts, dual 404 recovery, unavailable
  failures, request ordering, and redaction. It found no high-risk must-fix
  issue.

## GREEN And Verification

```text
npx vitest run app/lib/avatar/confirm-upload.test.ts app/api/profile/avatar/confirm/route.test.ts
Test Files 2 passed (2)
Tests 64 passed (64)

npx vitest run app/lib/avatar/*.test.ts app/lib/auth/user-store.test.ts app/api/profile/avatar/upload-intent/route.test.ts app/api/profile/avatar/route.test.ts
Test Files 9 passed (9)
Tests 194 passed (194)

npx tsc --noEmit --incremental false
exit 0

npm run lint
exit 0

git diff --check
exit 0

npm run build
Compiled successfully; TypeScript passed; 15 pages generated.
```

## Risks

- Tests use mocked DB and S3 boundaries. Deployment still depends on the
  existing token-column migration, ECS task-role credentials, S3 permissions,
  bucket configuration, and later production smoke checks.
- The confirmation limiter is process-local and therefore best-effort across
  multiple ECS tasks. Database state and token CAS remain the authoritative
  concurrency controls.
- A destination `409` with no visible confirmed object deliberately leaves the
  lease in `confirming` and returns `IN_PROGRESS`; stale-lease recovery handles
  a later retry.
