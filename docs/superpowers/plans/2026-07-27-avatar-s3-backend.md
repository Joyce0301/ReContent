# Avatar S3 Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the ECS-only backend that issues bounded presigned S3 POST uploads, confirms immutable original bytes, persists a race-safe avatar upload state, and gates deployment on the manually configured AWS prerequisites.

**Architecture:** PR A is additive. It keeps the existing `/api/profile/avatar` dry-run route and profile interaction unchanged while adding `/upload-intent` and `/confirm`. Browser bytes go to `original/pending/`; confirmation validates staging metadata, acquires or reacquires a DB lease according to the persisted state, and conditionally copies to write-once `original/confirmed/` before storing the confirmed key.

**Tech Stack:** Next.js 16 route handlers, TypeScript 5.6, Vitest 4, MySQL 8/Aurora, AWS SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-presigned-post`), ECS task-role credentials, S3, GitHub Actions OIDC.

## Global Constraints

- This plan implements backend PR A only; it must not connect `AvatarUploadControl` to S3.
- Avatar storage is ECS-only in this phase; Cloudflare/OpenNext receives a
  controlled `503` from the new endpoints when task-role storage is unavailable.
- Keep `POST /api/profile/avatar` and its exact dry-run contract available.
- Use `AVATAR_S3_BUCKET` and the standard SDK variable `AWS_REGION`; never add
  static AWS access keys.
- Presigned POST lifetime is 300 seconds.
- Accepted files are `image/jpeg`, `image/png`, and `image/webp`, from 1 byte through 5 MiB.
- Staging keys are `original/pending/{userId}/{uploadId}.{extension}`.
- Confirmed keys are `original/confirmed/{userId}/{uploadId}.{extension}`.
- Every copy signs both `CopySourceIfMatch=<staging-etag>` and destination `IfNoneMatch="*"`.
- All state timing uses MySQL `UTC_TIMESTAMP()`, never ECS task time.
- Every confirmation lease has a fresh server-only UUID token; terminal
  `confirming` writes must match that token and clear it.
- Keep the bucket private; no public ACL, public bucket policy, or public object URL.
- AWS SDK code is server-only and must not enter the browser bundle.
- The existing process-local limiter is best-effort; database state and S3 lifecycle are the storage-abuse boundaries.

---

## File Map

**Create**

- `app/lib/http/bounded-json.ts`: reusable bounded JSON reader for avatar routes.
- `app/lib/http/bounded-json.test.ts`: declared/actual size, malformed JSON, and stream-failure tests.
- `app/lib/avatar/storage-errors.ts`: typed configuration, unavailable, not-found, precondition, and conflict errors.
- `app/lib/avatar/s3-config.ts`: lazy server-only environment parsing.
- `app/lib/avatar/s3-config.test.ts`: environment validation and cache reset tests.
- `app/lib/avatar/s3-storage.ts`: presigned POST, `HeadObject`, and conditional `CopyObject` boundary.
- `app/lib/avatar/s3-storage.test.ts`: exact AWS command/policy and error-mapping tests.
- `app/lib/avatar/confirm-upload.ts`: confirmation state-machine orchestration.
- `app/lib/avatar/confirm-upload.test.ts`: replay, lease, recovery, and idempotency tests.
- `app/api/profile/avatar/upload-intent/route.ts`: authenticated intent endpoint.
- `app/api/profile/avatar/upload-intent/route.test.ts`: route contract and failure tests.
- `app/api/profile/avatar/confirm/route.ts`: authenticated confirmation endpoint.
- `app/api/profile/avatar/confirm/route.test.ts`: bounded request and error-contract tests.
- `scripts/verify-avatar-s3-prerequisites.mjs`: read-only ECS/S3 deployment preflight.
- `scripts/verify-avatar-s3-prerequisites.test.ts`: preflight parsing and rejection tests.
- `docs/auth/avatar-s3-smoke-test.md`: authenticated post-deploy compatibility,
  immutability, and idempotency smoke procedure.
- `docs/auth/migrations/2026-07-27-add-avatar-confirmation-token.sql`:
  idempotent nullable lease-token migration.
- `docs/auth/migrations/2026-07-27-add-avatar-confirmation-token.rollback.sql`:
  guarded rollback for the lease-token column.

**Modify**

- `package.json`, `package-lock.json`: direct AWS SDK dependencies.
- `app/lib/avatar/types.ts`, `app/lib/avatar/types.test.ts`: `confirming` and `uploaded`.
- `app/lib/avatar/object-key.ts`, `app/lib/avatar/object-key.test.ts`: pending/confirmed key helpers and parser.
- `app/lib/auth/user-store.ts`, `app/lib/auth/user-store.test.ts`: conditional state writes and state read.
- `docs/auth/mysql-auth-schema.sql`: include the nullable confirmation token in
  fresh schemas.
- `app/profile/avatar-upload-control.tsx`: add only exhaustive labels for the two statuses.
- `app/profile/avatar-upload-control.test.tsx`: assert labels without changing dry-run flow.
- `app/api/profile/avatar/route.ts`, `app/api/profile/avatar/route.test.ts`: reuse bounded reader with unchanged responses.
- `.github/workflows/deploy.yml`: run AWS preflight after OIDC credential setup and before ECR/image work.
- `.github/workflows/ci.yml`: include new backend and script tests.
- `docs/auth/mysql-auth-setup.md`: document new status meanings and ECS/S3 prerequisites.

---

### Task 1: Shared Request Boundary, Statuses, And Object Keys

**Files:**
- Create: `app/lib/http/bounded-json.ts`
- Create: `app/lib/http/bounded-json.test.ts`
- Modify: `app/api/profile/avatar/route.ts`
- Modify: `app/api/profile/avatar/route.test.ts`
- Modify: `app/lib/avatar/types.ts`
- Modify: `app/lib/avatar/types.test.ts`
- Modify: `app/lib/avatar/object-key.ts`
- Modify: `app/lib/avatar/object-key.test.ts`
- Modify: `app/profile/avatar-upload-control.tsx`
- Modify: `app/profile/avatar-upload-control.test.tsx`

**Interfaces:**
- Produces:

```ts
export type BoundedJsonResult =
  | { ok: true; value: unknown }
  | {
      ok: false;
      reason:
        | "INVALID_CONTENT_LENGTH"
        | "TOO_LARGE"
        | "INVALID_JSON"
        | "READ_FAILED";
    };

export async function readBoundedJson(
  request: Request,
  maxBytes: number
): Promise<BoundedJsonResult>;

export type AvatarStatus =
  | "not_uploaded"
  | "pending_upload"
  | "confirming"
  | "uploaded"
  | "ready"
  | "failed";

export function createAvatarObjectKeys(input: {
  userId: string;
  extension: "jpg" | "png" | "webp";
  id?: string;
}): { stagingKey: string; confirmedKey: string };

export function parseAvatarStagingKey(
  key: string,
  expectedUserId: string
): {
  userId: string;
  uploadId: string;
  extension: "jpg" | "png" | "webp";
  confirmedKey: string;
} | null;
```

- [ ] **Step 1: Write failing bounded-reader tests**

Cover valid JSON, invalid/non-decimal `Content-Length`, declared size over 8192,
actual stream over 8192, malformed JSON, and a stream whose `read()` rejects.

```ts
expect(await readBoundedJson(request, 8192)).toEqual({
  ok: false,
  reason: "READ_FAILED"
});
```

- [ ] **Step 2: Run the bounded-reader test and verify RED**

Run:

```bash
npx vitest run app/lib/http/bounded-json.test.ts
```

Expected: fail because the module does not exist.

- [ ] **Step 3: Implement `readBoundedJson` and migrate the dry-run route**

Move the stream-counting behavior out of the existing route. Map each result
back to its current Chinese response and status so `/api/profile/avatar` remains
behaviorally identical.

- [ ] **Step 4: Write failing status and key tests**

Assert:

```ts
expect(normalizeAvatarStatus("confirming")).toBe("confirming");
expect(normalizeAvatarStatus("uploaded")).toBe("uploaded");
expect(createAvatarObjectKeys({
  userId: "user-1",
  extension: "webp",
  id: "upload-1"
})).toEqual({
  stagingKey: "original/pending/user-1/upload-1.webp",
  confirmedKey: "original/confirmed/user-1/upload-1.webp"
});
expect(
  parseAvatarStagingKey(
    "original/pending/user-1/upload-1.webp",
    "user-1"
  )
).toEqual({
  userId: "user-1",
  uploadId: "upload-1",
  extension: "webp",
  confirmedKey: "original/confirmed/user-1/upload-1.webp"
});
```

Reject blank segments, slash/backslash injection, `..`, wrong prefixes, extra
segments, unsupported extensions, and keys for another user.

- [ ] **Step 5: Implement statuses, helpers, and minimal labels**

Use label values:

```ts
confirming: "正在确认上传",
uploaded: "原图已上传，等待处理"
```

Do not change fetch calls, button behavior, or the existing dry-run message.

- [ ] **Step 6: Run focused and regression tests**

Run:

```bash
npx vitest run \
  app/lib/http/bounded-json.test.ts \
  app/lib/avatar/types.test.ts \
  app/lib/avatar/object-key.test.ts \
  app/api/profile/avatar/route.test.ts \
  app/profile/avatar-upload-control.test.tsx
```

Expected: all pass, including the exact old dry-run response.

- [ ] **Step 7: Commit**

```bash
git add \
  app/lib/http/bounded-json.ts \
  app/lib/http/bounded-json.test.ts \
  app/api/profile/avatar/route.ts \
  app/api/profile/avatar/route.test.ts \
  app/lib/avatar/types.ts \
  app/lib/avatar/types.test.ts \
  app/lib/avatar/object-key.ts \
  app/lib/avatar/object-key.test.ts \
  app/profile/avatar-upload-control.tsx \
  app/profile/avatar-upload-control.test.tsx
git commit -m "refactor: prepare avatar upload boundaries"
```

### Task 2: Conditional Avatar Persistence State Machine

**Files:**
- Modify: `app/lib/auth/user-store.ts`
- Modify: `app/lib/auth/user-store.test.ts`
- Modify: `docs/auth/mysql-auth-schema.sql`
- Create: `docs/auth/migrations/2026-07-27-add-avatar-confirmation-token.sql`
- Create: `docs/auth/migrations/2026-07-27-add-avatar-confirmation-token.rollback.sql`

**Interfaces:**
- Produces:

```ts
export type AvatarUploadState = {
  key: string | null;
  status: AvatarStatus;
  updatedAt: string | null;
};

export async function getAvatarUploadState(
  userId: string
): Promise<AvatarUploadState | null>;

export async function reserveAvatarUpload(input: {
  userId: string;
  stagingKey: string;
}): Promise<boolean>;

export async function acquireAvatarConfirmationLease(input: {
  userId: string;
  stagingKey: string;
}): Promise<string | null>;

export async function completeAvatarConfirmation(input: {
  userId: string;
  stagingKey: string;
  confirmedKey: string;
  leaseToken: string;
}): Promise<boolean>;

export async function failPendingAvatarUpload(input: {
  userId: string;
  stagingKey: string;
}): Promise<boolean>;

export async function failAvatarConfirmation(input: {
  userId: string;
  stagingKey: string;
  leaseToken: string;
}): Promise<boolean>;
```

- [ ] **Step 1: Write failing SQL contract tests**

Mock `queryOne` and `execute`. Assert exact predicates:

```sql
avatar_status IN ('not_uploaded', 'failed')
OR (
  avatar_status = 'pending_upload'
  AND avatar_updated_at <= UTC_TIMESTAMP() - INTERVAL 5 MINUTE
)
```

Lease acquisition must accept `pending_upload` or a `confirming` row at least
30 seconds old, assign a fresh `randomUUID()` token, and assign
`avatar_updated_at = UTC_TIMESTAMP()`. Tests must prove the returned token is
the value used by SQL only when exactly one row changes; zero or multiple rows
return `null`.

Terminal-write tests must model owner A acquiring, owner B reacquiring with a
new token, and owner A's completion/failure affecting zero rows because its
token no longer matches.

- [ ] **Step 2: Run the state tests and verify RED**

```bash
npx vitest run app/lib/auth/user-store.test.ts
```

Expected: fail because the six exported functions do not exist.

- [ ] **Step 3: Implement affected-row helpers and state read**

Read `ResultSetHeader.affectedRows` from the first `execute()` tuple item.
Boolean transitions return `true` only for exactly one affected row. Lease
acquisition returns its generated token only for exactly one affected row and
otherwise returns `null`. Never treat zero or multiple rows as success.

- [ ] **Step 4: Implement the five conditional writes**

Use parameterized SQL. Reservation clears `avatar_confirmation_token`.
Completion clears the token and must use:

```sql
WHERE id = ?
  AND avatar_key = ?
  AND avatar_status = 'confirming'
  AND avatar_confirmation_token = ?
```

Pending failure must use the same user/key binding and:

```sql
avatar_status = 'pending_upload'
```

Leased failure clears the token and must use:

```sql
avatar_status = 'confirming'
AND avatar_confirmation_token = ?
```

- [ ] **Step 5: Add the backward-compatible migration**

Add `avatar_confirmation_token CHAR(36) NULL` to the base schema after
`avatar_updated_at`. Create independently guarded, rerunnable forward and
rollback migration files following the existing avatar migration style.
Existing ECS revisions must remain valid because they do not read this nullable
column. The column may remain indefinitely. The rollback migration must not run
until every deployed revision that references it has been drained and the
application rollback is verified stable.

- [ ] **Step 6: Verify state and existing auth regressions**

```bash
npx vitest run \
  app/lib/auth/user-store.test.ts \
  app/lib/auth/session.test.ts \
  app/api/auth/login/route.test.ts \
  app/api/auth/register/route.test.ts
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add \
  app/lib/auth/user-store.ts \
  app/lib/auth/user-store.test.ts \
  docs/auth/mysql-auth-schema.sql \
  docs/auth/migrations/2026-07-27-add-avatar-confirmation-token.sql \
  docs/auth/migrations/2026-07-27-add-avatar-confirmation-token.rollback.sql
git commit -m "feat: add avatar upload state transitions"
```

### Task 3: Server-Only S3 Storage Boundary

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `app/lib/avatar/storage-errors.ts`
- Create: `app/lib/avatar/s3-config.ts`
- Create: `app/lib/avatar/s3-config.test.ts`
- Create: `app/lib/avatar/s3-storage.ts`
- Create: `app/lib/avatar/s3-storage.test.ts`

**Interfaces:**
- Produces:

```ts
export type AvatarObjectMetadata = {
  contentLength: number;
  contentType: string;
  eTag: string;
};

export async function createAvatarPresignedPost(input: {
  stagingKey: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
}): Promise<{
  url: string;
  fields: Record<string, string>;
  expiresAt: string;
}>;

export async function headAvatarObject(
  key: string
): Promise<AvatarObjectMetadata>;

export async function copyAvatarToConfirmed(input: {
  stagingKey: string;
  confirmedKey: string;
  sourceETag: string;
}): Promise<void>;
```

- [ ] **Step 1: Add direct AWS and server-boundary dependencies**

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-presigned-post server-only
```

Verify all three packages appear under `dependencies`, not `devDependencies`.
`server-only` makes the import resolvable in both Next.js and Vitest while
preserving the build-time client-import guard.

- [ ] **Step 2: Write failing lazy-config tests**

Test missing bucket, missing region, whitespace-only values, valid values, and
that importing the module does not read configuration until a storage function
is called.

- [ ] **Step 3: Implement typed storage errors and lazy config**

Use `import "server-only"` in S3 modules. Export a test-only cache reset if a
client/config singleton is used.

- [ ] **Step 4: Write failing AWS command tests**

Mock `createPresignedPost` and `S3Client.send`. Assert the POST input includes:

```ts
{
  Bucket: "bucket",
  Key: "original/pending/user-1/upload-1.webp",
  Expires: 300,
  Fields: {
    "Content-Type": "image/webp",
    success_action_status: "204"
  },
  Conditions: [
    ["eq", "$Content-Type", "image/webp"],
    ["content-length-range", 1, 5 * 1024 * 1024]
  ]
}
```

Assert a real quoted ETag returned by `HeadObject` is passed through exactly,
without adding or removing quotes:

```ts
const observedETag = "\"source-etag\"";

{
  CopySourceIfMatch: observedETag,
  IfNoneMatch: "*"
}
```

- [ ] **Step 5: Implement presign, head, copy, and error mapping**

Reject a missing, blank, or whitespace-only `HeadObject` ETag before creating a
`CopyObjectCommand`. Do not synthesize an ETag or wrap it in another pair of
quotes.

Map:

- S3 404 / `NotFound` / `NoSuchKey` -> typed not-found error.
- S3 412 / `PreconditionFailed` -> typed precondition error.
- S3 409 / `ConditionalRequestConflict` -> typed conflict error.
- Credential, timeout, 403, and other AWS errors -> typed unavailable error.

Do not include AWS request objects, policy fields, signatures, or security
tokens in error messages.

- [ ] **Step 6: Run S3 boundary tests**

```bash
npx vitest run \
  app/lib/avatar/s3-config.test.ts \
  app/lib/avatar/s3-storage.test.ts
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add \
  package.json package-lock.json \
  app/lib/avatar/storage-errors.ts \
  app/lib/avatar/s3-config.ts \
  app/lib/avatar/s3-config.test.ts \
  app/lib/avatar/s3-storage.ts \
  app/lib/avatar/s3-storage.test.ts
git commit -m "feat: add secure S3 avatar storage boundary"
```

### Task 4: Additive Upload Intent API

**Files:**
- Create: `app/api/profile/avatar/upload-intent/route.ts`
- Create: `app/api/profile/avatar/upload-intent/route.test.ts`

**Interfaces:**
- Consumes: `readBoundedJson`, `validateAvatarUploadIntent`,
  `createAvatarObjectKeys`, `createAvatarPresignedPost`,
  `getAvatarUploadState`, and `reserveAvatarUpload`.
- Produces:

```ts
type UploadIntentResponse = {
  upload: {
    url: string;
    fields: Record<string, string>;
    expiresAt: string;
  };
  objectKey: string;
};
```

- [ ] **Step 1: Write failing route tests**

Cover:

- auth before body read
- 401, 400, 413, 429, and 503
- five requests per ten minutes
- no intent for `pending_upload`, `confirming`, or `uploaded`
- stale pending reservation decided by the DB CAS
- exact server session user ID in both keys
- presign before persistence
- no response when persistence returns false
- response fields are passed through opaquely
- no policy/signature/token in errors

- [ ] **Step 2: Run the route test and verify RED**

```bash
npx vitest run app/api/profile/avatar/upload-intent/route.test.ts
```

Expected: fail because the route does not exist.

- [ ] **Step 3: Implement the minimal route**

Use rate-limit input:

```ts
{
  bucket: "avatar-upload-intent",
  key: session.user.id,
  max: 5,
  windowMs: 10 * 60 * 1000
}
```

Return `409` when the current state blocks an intent or the reservation CAS
loses a race. Map typed auth/storage errors to a generic Chinese `503`.

- [ ] **Step 4: Run intent and foundation route tests**

```bash
npx vitest run \
  app/api/profile/avatar/upload-intent/route.test.ts \
  app/api/profile/avatar/route.test.ts
```

Expected: both additive and old routes pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/profile/avatar/upload-intent
git commit -m "feat: issue avatar S3 upload intents"
```

### Task 5: Immutable Upload Confirmation Service And API

**Files:**
- Create: `app/lib/avatar/confirm-upload.ts`
- Create: `app/lib/avatar/confirm-upload.test.ts`
- Create: `app/api/profile/avatar/confirm/route.ts`
- Create: `app/api/profile/avatar/confirm/route.test.ts`

**Interfaces:**
- Produces:

```ts
export type ConfirmAvatarResult =
  | { ok: true; status: "uploaded"; confirmedKey: string }
  | {
      ok: false;
      reason:
        | "INVALID_KEY"
        | "STALE_INTENT"
        | "NOT_FOUND"
        | "INVALID_OBJECT"
        | "IN_PROGRESS";
    };

export async function confirmAvatarUpload(input: {
  userId: string;
  stagingKey: string;
}): Promise<ConfirmAvatarResult>;
```

- [ ] **Step 1: Write failing orchestrator tests**

Cover:

- malformed/cross-user key rejected before DB/S3
- same deterministic confirmed key already `uploaded` -> idempotent success
- `pending_upload` -> head staging -> acquire tokenized lease -> conditional copy -> token-matched complete
- lease CAS loss -> fresh state read -> success only for matching uploaded key,
  with no copy, complete, or failure call
- fresh `confirming` lease -> `IN_PROGRESS`
- stale `confirming` lease reacquired atomically with a fresh token
- stale recovery with valid confirmed object -> token-matched complete without copy
- stale owner completion/failure after reacquisition -> lost CAS and no state mutation
- source ETag change / source 412 with no confirmed object -> conditional failure
- destination 412 or 409 with valid confirmed object -> complete without overwrite
- destination 409 with no confirmed object -> `IN_PROGRESS`
- stale confirming with both keys 404 -> conditionally mark failed
- invalid length/type/extension -> conditionally mark failed
- 403 and credential/network failures remain typed unavailable errors

- [ ] **Step 2: Run orchestrator tests and verify RED**

```bash
npx vitest run app/lib/avatar/confirm-upload.test.ts
```

Expected: fail because the service does not exist.

- [ ] **Step 3: Implement metadata validation and state branching**

Never compare lease timestamps in JavaScript. Attempt the DB lease CAS and use
its affected-row result to decide whether recovery owns the lease.

Use these explicit branches and ordering:

- `pending_upload`: `HeadObject` staging, validate metadata and nonblank ETag;
  invalid metadata uses `failPendingAvatarUpload`. Otherwise acquire and retain
  the lease token. If acquisition returns `null`, stop before copy, read fresh
  state, and return success only for the matching uploaded key or else return
  `IN_PROGRESS`. If acquisition returns a token, proceed to the conditional
  copy with that token.
- fresh `confirming`: return `IN_PROGRESS` without touching S3.
- stale `confirming`: reacquire and retain a fresh lease token first, then
  `HeadObject` confirmed. If reacquisition returns `null`, stop before all S3
  and terminal writes, read fresh state, and return success only for the
  matching uploaded key; otherwise return `IN_PROGRESS`. If reacquisition
  succeeds and confirmed is absent, `HeadObject` and validate staging before
  conditionally copying.
- matching `uploaded`: return idempotent success without touching S3.
- stale `confirming` with both confirmed and staging absent: conditionally mark
  the upload failed only while still owning the same lease token.

- [ ] **Step 4: Implement copy and recovery**

The only copy call must receive both the observed staging ETag and deterministic
confirmed key. After any destination precondition/conflict error, only
`HeadObject` the confirmed key; never issue an unconditional copy.

Every completion and every failure after lease acquisition must pass the same
token returned by `acquireAvatarConfirmationLease`. A lost terminal CAS causes
a fresh state read; it must never be treated as unconditional success or retry
with a token not acquired by that request.

Tests must assert that a `null` acquire/reacquire result causes zero
`CopyObject`, completion, pending-failure, and leased-failure calls.

- [ ] **Step 5: Write failing route tests**

The route authenticates before reading at most 2048 bytes of JSON:

```json
{
  "objectKey": "original/pending/user-1/upload-1.webp"
}
```

Map results to:

- `200`: uploaded/idempotent
- `400`: invalid key or invalid object
- `401`: unauthenticated
- `409`: stale, missing, or in progress
- `429`: confirmation throttle
- `503`: auth, DB, configuration, credential, or S3 unavailable

- [ ] **Step 6: Implement and verify the confirmation route**

```bash
npx vitest run \
  app/lib/avatar/confirm-upload.test.ts \
  app/api/profile/avatar/confirm/route.test.ts
```

Expected: all pass without exposing S3 error details.

- [ ] **Step 7: Commit**

```bash
git add \
  app/lib/avatar/confirm-upload.ts \
  app/lib/avatar/confirm-upload.test.ts \
  app/api/profile/avatar/confirm
git commit -m "feat: confirm immutable avatar originals"
```

### Task 6: Deployment Preflight And Documentation

**Files:**
- Create: `scripts/verify-avatar-s3-prerequisites.mjs`
- Create: `scripts/verify-avatar-s3-prerequisites.test.ts`
- Create: `docs/auth/avatar-s3-smoke-test.md`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/auth/mysql-auth-setup.md`

**Interfaces:**
- Script environment:

```text
AWS_REGION=us-east-1
ECS_CLUSTER=default
ECS_SERVICE=recontent-b13f
ECS_CONTAINER_NAME=Main
AVATAR_S3_BUCKET=recontent-avatar-pipeline-20260726
EXPECTED_AVATAR_RUNTIME_REGION=us-east-1
EXPECTED_AVATAR_TASK_ROLE_ARN=arn:aws:iam::881424867096:role/recontent-ecs-task-role
AVATAR_TASK_ROLE_NAME=recontent-ecs-task-role
AVATAR_TASK_POLICY_NAME=recontent-avatar-originals-access
GITHUB_DEPLOY_ROLE_NAME=github-actions-recontent-deploy
AVATAR_ALLOWED_ORIGIN=https://re-6718725ab2374d34942ac6eee4abd640.ecs.us-east-1.on.aws
```

- [ ] **Step 1: Write failing pure preflight tests**

Export parsers/validators and inject an `aws(args)` executor. Test failures for:

- missing/incorrect task role
- missing or incorrect `AVATAR_S3_BUCKET` and `AWS_REGION` container
  variables; compare the runtime region with
  `EXPECTED_AVATAR_RUNTIME_REGION` rather than assuming the AWS CLI region is
  the container configuration
- any public-access block flag not `true`
- object ownership not exactly `BucketOwnerEnforced`
- missing SSE-S3 encryption or a default algorithm other than `AES256`
- missing POST CORS for the exact origin
- lifecycle without one-day expiration for `original/pending/`
- task-role policy missing `s3:PutObject` or `s3:GetObject` on
  `arn:aws:s3:::${AVATAR_S3_BUCKET}/original/*`
- task-role policy missing `s3:ListBucket` on the bucket ARN with a
  `s3:prefix` condition restricted to `original/*`
- task-role policy containing an object resource broader than `original/*`
- effective task-role simulation does not allow the three required operations,
  or allows the same object operations outside `original/*`
- AWS command failure with a redacted error

- [ ] **Step 2: Run preflight tests and verify RED**

```bash
npx vitest run scripts/verify-avatar-s3-prerequisites.test.ts
```

- [ ] **Step 3: Implement the read-only preflight**

Use AWS CLI JSON calls:

```text
ecs describe-services
ecs describe-task-definition
s3api get-public-access-block
s3api get-bucket-cors
s3api get-bucket-lifecycle-configuration
s3api get-bucket-ownership-controls
s3api get-bucket-encryption
iam get-role-policy
iam list-role-policies
iam list-attached-role-policies
iam get-policy
iam get-policy-version
iam simulate-principal-policy
```

Validate the named task-role policy structurally, including action, resource,
and `s3:prefix` condition. Enumerate every additional inline/attached policy and
reject broader S3 grants. Use `simulate-principal-policy` to confirm effective
allow for `PutObject`/`GetObject` under `original/*` and prefix-conditioned
`ListBucket`, plus no allow for object access outside `original/*`. Never print
container secrets, full task-definition JSON, or IAM policy documents.

- [ ] **Step 4: Add the deploy gate**

Run preflight immediately after `Configure AWS credentials` and before ECR login
or image build. Pass fixed expected values through workflow `env`.

- [ ] **Step 5: Expand CI and docs**

Include new route, avatar, HTTP, auth-store, and preflight tests. Document:

- ECS-only runtime
- task role vs execution role
- required nullable `avatar_confirmation_token` migration and token-fenced
  lease behavior
- required prefix-restricted `s3:ListBucket`
- `BucketOwnerEnforced` and default `AES256` SSE-S3
- POST CORS
- one-day pending lifecycle
- two direct SDK dependencies plus the `server-only` boundary marker
- no static credentials

Add `docs/auth/avatar-s3-smoke-test.md` with exact authenticated production
steps for the old dry-run route, intent issuance, actual multipart S3 POST,
confirmation, replay, repeated confirmation, cross-user rejection, and DB/S3
inspection.

Treat the deploy role's **additional preflight read scope** as a manual hard
gate before PR. Inspect both inline and attached policies for
`GITHUB_DEPLOY_ROLE_NAME` and confirm the role can perform every read below.
The same role necessarily retains ECR push and ECS deployment permissions used
later in the existing workflow. Its externally managed broad deployment
attachments are out of scope for PR A: record them as an explicit residual
rollout risk, but do not block PR A merely because those pre-existing deploy
permissions are broader than this preflight list.

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

- [ ] **Step 6: Verify**

```bash
npx vitest run scripts/verify-avatar-s3-prerequisites.test.ts
npm run lint
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add \
  scripts/verify-avatar-s3-prerequisites.mjs \
  scripts/verify-avatar-s3-prerequisites.test.ts \
  .github/workflows/deploy.yml \
  .github/workflows/ci.yml \
  docs/auth/mysql-auth-setup.md \
  docs/auth/avatar-s3-smoke-test.md
git commit -m "ci: gate avatar S3 deployment prerequisites"
```

### Task 7: PR A Full Verification And Review Gates

**Files:**
- Verify all PR A files.
- Do not add profile S3 interaction code.

- [ ] **Step 1: Run the complete backend test set**

```bash
npx vitest run \
  app/api/repurpose/*.test.ts \
  app/api/auth/*/route.test.ts \
  app/api/profile/avatar/route.test.ts \
  app/api/profile/avatar/upload-intent/route.test.ts \
  app/api/profile/avatar/confirm/route.test.ts \
  app/lib/auth/*.test.ts \
  app/lib/avatar/*.test.ts \
  app/lib/http/*.test.ts \
  app/components/recontent/header.test.tsx \
  app/profile/*.test.tsx \
  app/workspace/*.test.tsx \
  app/page.test.tsx \
  scripts/verify-avatar-s3-prerequisites.test.ts \
  --exclude app/api/repurpose/content-extraction.live.test.ts
```

- [ ] **Step 2: Run static and production checks**

```bash
npm run lint
NEXT_TELEMETRY_DISABLED=1 npm run build
npx opennextjs-cloudflare build
git diff --check
```

The OpenNext command is build-only. It must not preview, upload, or deploy.
Include this non-deploying compatibility build in CI so the ECS-only routes do
not break the existing Cloudflare/OpenNext target.

- [ ] **Step 3: Run the AWS preflight against the live prerequisites**

Before the AWS preflight, apply
`docs/auth/migrations/2026-07-27-add-avatar-confirmation-token.sql` to the
production database and verify:

```sql
SELECT column_name, column_type, is_nullable
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'users'
  AND column_name = 'avatar_confirmation_token';
```

Expected: one `char(36)` nullable column. This database migration is a hard
gate before merging because the deployment workflow publishes code
automatically.

After the migration, the user has added POST CORS, one-day pending lifecycle,
prefix-restricted `s3:ListBucket`, and deploy-role read permissions:

```bash
AWS_REGION=us-east-1 \
ECS_CLUSTER=default \
ECS_SERVICE=recontent-b13f \
ECS_CONTAINER_NAME=Main \
AVATAR_S3_BUCKET=recontent-avatar-pipeline-20260726 \
EXPECTED_AVATAR_RUNTIME_REGION=us-east-1 \
EXPECTED_AVATAR_TASK_ROLE_ARN=arn:aws:iam::881424867096:role/recontent-ecs-task-role \
AVATAR_TASK_ROLE_NAME=recontent-ecs-task-role \
AVATAR_TASK_POLICY_NAME=recontent-avatar-originals-access \
GITHUB_DEPLOY_ROLE_NAME=github-actions-recontent-deploy \
AVATAR_ALLOWED_ORIGIN=https://re-6718725ab2374d34942ac6eee4abd640.ecs.us-east-1.on.aws \
node scripts/verify-avatar-s3-prerequisites.mjs
```

Expected: every check reports pass without printing secrets.

Before opening the PR, complete and record the deploy-role preflight-read hard
gate from Task 6. Do not describe the overall deploy role as least privilege;
record its pre-existing broad deployment attachments as a residual risk while
requiring every new preflight read to succeed.

- [ ] **Step 4: Independent code review**

Dispatch a code-review subagent over the complete branch diff. Fix all Critical
and Important findings, then rerun Steps 1–3.

- [ ] **Step 5: Independent adversarial review**

Dispatch a separate adversarial subagent focused on POST replay, destination
overwrite, token-fenced stale lease ownership, DB/S3 split recovery, cross-user
keys, AWS error redaction, and rolling deployment compatibility. Fix all
Critical and Important findings, then rerun Steps 1–3.

- [ ] **Step 6: Create PR A**

Push `codex/avatar-s3-upload` and create a PR that states:

- backend-only additive scope
- old dry-run route/UI retained
- required manual AWS prerequisites
- tests/build/preflight performed
- Lambda and UI upload excluded

- [ ] **Step 7: Observe CI and ECS deployment**

Wait for CI, Docker build, deploy preflight, ECS service stability, ALB target
health, and `/api/health`.

- [ ] **Step 8: Run the authenticated post-deploy smoke gate**

Follow `docs/auth/avatar-s3-smoke-test.md` against the deployed ECS origin and
record sanitized evidence for all of these:

- the old `POST /api/profile/avatar` returns its exact dry-run response
- upload intent returns a five-minute POST contract for the session user
- the multipart POST writes the expected pending key
- confirmation stores the deterministic confirmed key and `uploaded` state
- resubmitting different bytes to the still-valid pending POST cannot overwrite
  the confirmed object
- repeated confirmation returns the same confirmed key idempotently
- a different user's key and a stale key are rejected
- DB state plus S3 `HeadObject` output confirm the pending/confirmed locations
  and unchanged confirmed ETag

Do not log cookies, presigned fields, database passwords, or security tokens.
Do not start PR B until PR A is merged, deployed, and this gate passes.

---

## Follow-Up Plan Boundary

After PR A is deployed, create a new worktree and plan for PR B. PR B changes
only `AvatarUploadControl` and its UI tests to:

```text
request intent -> FormData POST to S3 -> confirm -> show uploaded/waiting
```

The old `/api/profile/avatar` route remains until a later compatibility cleanup.
