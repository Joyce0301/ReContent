# Avatar S3 Upload Design

## Summary

This ECS-only phase adds the backend and, in a follow-up PR, the profile UI for
a real authenticated browser-to-S3 upload. ReContent issues a short-lived
presigned POST for a staging key, the browser uploads directly to a private S3
bucket, and ReContent confirms and conditionally copies those bytes to a
client-inaccessible key before recording them as uploaded.

This phase stops at durable original-image storage. It does not invoke Lambda,
publish an avatar URL, or present the unprocessed original as the user's final
avatar.

## Goals

- Keep image bytes out of ECS request bodies.
- Restrict every upload to one server-generated object key owned by the
  authenticated user.
- Enforce the 1 byte through 5 MiB range in the S3 POST policy.
- Restrict the declared MIME type to JPEG, PNG, or WebP.
- Confirm the object exists and matches the expected metadata before advancing
  database state.
- Preserve login, profile, workspace, and existing content-generation behavior.
- Leave a clean event boundary for the next S3-to-Lambda phase.

## Non-Goals

- Lambda triggers, image resizing, transcoding, or byte-signature inspection.
- Public S3 objects, public bucket policies, CloudFront, or signed read URLs.
- Displaying the uploaded original as a ready account avatar.
- Multipart uploads, upload resumption, or progress percentages.
- Infrastructure as code migration of the manually created AWS resources.
- Cloudflare/OpenNext runtime support for avatar storage. Existing Cloudflare
  commands remain buildable, but this feature is enabled only by the ECS task
  role and `AVATAR_S3_*` configuration.

## Chosen Upload Mechanism

Use a presigned POST rather than a presigned PUT.

The POST policy supports a native `content-length-range` condition, so S3 rejects
requests outside the accepted size range before storing the object. A PUT URL
can sign selected headers, but it does not provide the same policy-level size
range. Client-side validation and post-upload `HeadObject` checks remain
defense-in-depth, not the primary size boundary.

The policy is valid for five minutes and applies to one exact staging key and
one exact declared content type. It does not grant deletion, reads of other
objects, or writes outside the `original/pending/` key selected by the server.

A presigned POST can be replayed until it expires, so a staging key is not a
stable object identity. Confirmation therefore reads the staging ETag and uses
`CopyObject` with both `CopySourceIfMatch=<observed-etag>` and destination
`IfNoneMatch="*"` to create a deterministic `original/confirmed/` key. The
source condition binds the inspected bytes; the destination condition makes the
first completed copy write-once. The browser never receives write authorization
for the confirmed key. A replay can replace staging bytes, but neither the
browser nor a recovery copy can replace confirmed bytes.

## Existing AWS Resources

This phase consumes the manually configured resources in `us-east-1`:

- Bucket: `recontent-avatar-pipeline-20260726`
- Bucket ownership: `BucketOwnerEnforced`
- Public access block: all four controls enabled
- Default encryption: SSE-S3 (`AES256`)
- ECS task role: `recontent-ecs-task-role`
- Task-role object permissions:
  - `s3:PutObject` on
    `arn:aws:s3:::recontent-avatar-pipeline-20260726/original/*`
  - `s3:GetObject` on the same prefix for `HeadObject` and copy source access
  - `s3:ListBucket` on the bucket, restricted with
    `s3:prefix = original/*`, so a missing current object returns `404` rather
    than an ambiguous `403`
- ECS environment:
  - `AVATAR_S3_BUCKET=recontent-avatar-pipeline-20260726`
  - `AVATAR_S3_REGION=us-east-1`

Before UI deployment, bucket CORS must allow `POST` from the exact ReContent
production origin. `PUT` is not required by this design. A lifecycle rule must
expire `original/pending/` objects after one day so abandoned and replaced
staging uploads cannot accumulate indefinitely.

No static AWS access keys are stored in the application. The AWS SDK uses the
ECS task-role credential provider. A repo-owned AWS preflight script runs in the
deploy workflow after OIDC credential setup and fails deployment unless the
current task definition has the expected task role and both `AVATAR_S3_*`
variables, and the bucket has public access blocked, POST CORS, and pending-key
lifecycle cleanup. The GitHub deploy role must receive only the read permissions
needed by that preflight.

## Object Keys

The server generates a staging and confirmed key from one upload ID:

```text
original/pending/{userId}/{uploadId}.{extension}
original/confirmed/{userId}/{uploadId}.{extension}
```

`userId` comes only from the authenticated server-side session. `uploadId` is a
cryptographically random UUID. The extension is derived from validated MIME
metadata:

- `image/jpeg` -> `jpg`
- `image/png` -> `png`
- `image/webp` -> `webp`

The client cannot supply a key, user ID, prefix, or upload ID when requesting an
upload intent. The existing helper that emits `avatars/originals/...` will be
replaced with helpers for the two deployed `original/` prefixes. A confirmed key
is derived only from a syntactically valid staging key owned by the session user.

## Database State

The existing columns remain sufficient:

```sql
avatar_key VARCHAR(512) NULL
avatar_status VARCHAR(32) NOT NULL DEFAULT 'not_uploaded'
avatar_updated_at DATETIME NULL
```

The application status union adds `confirming` and `uploaded`:

```text
not_uploaded -> pending_upload -> confirming -> uploaded
                         \----------\---------> failed
```

- `not_uploaded`: no current upload intent.
- `pending_upload`: a key has been reserved and a POST has been issued.
- `confirming`: one request owns the copy/finalization lease.
- `uploaded`: S3 confirmation passed; the original awaits the Lambda phase.
- `failed`: S3 confirmation found invalid size or metadata.
- `ready`: retained for the later processed-avatar phase.

Each user may have at most one active or durable original in this pre-Lambda
phase. A non-expired `pending_upload`, any `confirming`, or `uploaded` state
returns `409` instead of issuing another intent. A `pending_upload` older than
the five-minute POST lifetime is atomically replaceable; `failed` may also start
a new intent. Abandoned staging objects are removed by the required one-day
lifecycle rule. This prevents a failed browser POST from permanently locking
the user while limiting one account from accumulating confirmed originals
before the processor and replacement cleanup exist.

Database writes use conditional updates:

- `reserveAvatarUpload(userId, stagingKey)` updates only a user in
  `not_uploaded`, `failed`, or `pending_upload` whose DB timestamp is at least
  five minutes old; zero affected rows maps to `409`.
- `acquireAvatarConfirmationLease(userId, stagingKey)` atomically changes the
  exact current key from `pending_upload` to `confirming`, or refreshes a
  `confirming` lease only when its MySQL timestamp is at least 30 seconds old.
  Both paths set `avatar_updated_at = UTC_TIMESTAMP()`. Zero affected rows
  triggers a fresh state read rather than an unconditional success.
- `completeAvatarConfirmation(userId, stagingKey, confirmedKey)` atomically
  changes `confirming` to `uploaded` and replaces `avatar_key` with the confirmed
  key; zero affected rows maps to `409` unless a fresh read proves the same
  confirmed key is already `uploaded`.
- `failAvatarConfirmation(userId, stagingKey)` conditionally changes the same
  pending or confirming attempt to `failed`. This includes stale `confirming`
  recovery when both the deterministic confirmed key and staging key return
  `404`.
- Repeating confirmation for a staging key whose deterministic confirmed key is
  already current in `uploaded` state returns `200` without contacting S3.
- A stale key from an older intent cannot advance the current state.

All avatar state timestamps and time comparisons use MySQL server time via
`UTC_TIMESTAMP()`. ECS task clocks never decide whether a five-minute intent or
30-second confirmation lease is stale. The existing datetime parser continues
to expose resulting timestamps as UTC ISO strings.

## Upload Intent API

### Endpoint

```text
POST /api/profile/avatar/upload-intent
```

### Request

```json
{
  "fileName": "portrait.webp",
  "contentType": "image/webp",
  "sizeBytes": 245760
}
```

The endpoint reuses the existing bounded JSON reader, metadata validator, and
authentication behavior. It uses the existing process-local limiter as
best-effort throttling at five intents per user per ten minutes. This is not a
deployment-wide quota; the single-durable-original database rule and S3
lifecycle rule are the authoritative storage-abuse controls in this phase.

### Processing Order

1. Authenticate before reading the body.
2. Apply the best-effort per-process/per-user rate limit.
3. Read at most 8 KiB and validate JSON metadata.
4. Reject a user who has non-expired `pending_upload`, `confirming`, or
   `uploaded`; allow the conditional reservation query to replace a
   `pending_upload` older than five minutes.
5. Generate the server-owned staging and confirmed keys.
6. Create a five-minute presigned POST with:
   - exact bucket
   - exact staging key
   - exact `Content-Type`
   - `content-length-range` from 1 through 5 MiB
   - `success_action_status=204`
7. Call `reserveAvatarUpload` to persist the staging key with `pending_upload`.
8. Return the POST target and required form fields.

Presigning happens before persistence. If persistence fails, the URL and fields
are not returned. If persistence succeeds, the response is the only place the
client receives the upload contract.

### Response

```json
{
  "upload": {
    "url": "https://recontent-avatar-pipeline-20260726.s3.us-east-1.amazonaws.com/",
    "fields": {
      "key": "original/pending/server-user-id/random-id.webp",
      "Content-Type": "image/webp",
      "success_action_status": "204",
      "policy": "...",
      "x-amz-algorithm": "AWS4-HMAC-SHA256",
      "x-amz-credential": "...",
      "x-amz-date": "...",
      "x-amz-signature": "...",
      "x-amz-security-token": "..."
    },
    "expiresAt": "2026-07-27T00:05:00.000Z"
  },
  "objectKey": "original/pending/server-user-id/random-id.webp"
}
```

The exact AWS field set varies with credentials and must be treated as opaque by
the client. The client appends every returned field to `FormData`, appends the
file last with `formData.append("file", file)`, and POSTs to `upload.url`.

Presigned fields are temporary credentials. Application logs, analytics, and
user-facing errors must not print the URL query, policy, signature, credential,
or security token.

## Upload Confirmation API

### Endpoint

```text
POST /api/profile/avatar/confirm
```

### Request

```json
{
  "objectKey": "original/pending/server-user-id/random-id.webp"
}
```

The endpoint authenticates first, applies a separate per-user confirmation rate
limit, and reads a bounded JSON body. The key must be a valid staging key owned
by the authenticated user. State branching is exact:

- Matching deterministic confirmed key + `uploaded`: return `200` without S3.
- Matching staging key + `pending_upload`: continue confirmation.
- Matching staging key + `confirming` newer than 30 seconds according to MySQL
  `UTC_TIMESTAMP()`: return `409` because another request owns the lease.
- Matching staging key + stale `confirming`: atomically reacquire the lease,
  then retry recovery against the deterministic confirmed key or retry the
  conditional copy if it does not exist.
- Any other key or state: return `409` before S3.

For an eligible pending or stale-confirming key, it calls `HeadObject` and
verifies:

- the object exists
- `ContentLength` is an integer from 1 through 5 MiB
- `ContentType` is JPEG, PNG, or WebP
- the content type agrees with the key extension
- `ETag` is present

If verification passes, the route atomically acquires or reacquires the
`confirming` lease, then calls `CopyObject` from staging to the deterministic
confirmed key with `CopySourceIfMatch` set to the observed ETag and destination
`IfNoneMatch="*"`. A source precondition failure proves the staging object
changed after inspection and marks the attempt `failed`. A destination `412` or
concurrent-write `409` triggers `HeadObject` on the confirmed key; if that
write-once object exists with valid metadata, recovery completes only the
database transition and never copies over it.

If stale `confirming` recovery finds neither the confirmed key nor the staging
key, `failAvatarConfirmation` uses exact user ID, staging key, and
`confirming`-status predicates to mark the attempt `failed`. This covers a crash
before copy followed by lifecycle deletion and prevents permanent user lockout.

After a successful copy, `completeAvatarConfirmation` atomically stores the
confirmed key, advances the state to `uploaded`, and refreshes
`avatar_updated_at`. A retry in `confirming` first checks the confirmed key; if
it exists with valid metadata, it completes the database transition. A retry
may perform that recovery only after the 30-second lease is stale. Otherwise it
repeats the ETag-bound staging check and copy.

### Responses

- `200`: confirmed, including an idempotent repeat for the same uploaded key.
- `400`: malformed request or unsafe key.
- `401`: no authenticated session.
- `409`: stale intent, conflicting state, or current object not yet present.
- `429`: rate limit exceeded.
- `503`: authentication, database, AWS configuration, credentials, or S3 is
  temporarily unavailable.

S3 authorization and credential details are never returned to the browser.

The task role's prefix-restricted `s3:ListBucket` permission lets a missing
current key surface as `404`; other `403` responses are treated as IAM/service
failures and return `503`, not as a missing upload.

If `HeadObject` finds an invalid size or declared type, or the conditional copy
detects changed staging bytes, the current key is conditionally marked `failed`
and the API returns `400`. Actual image bytes are still untrusted until the
later Lambda processor validates and decodes them.

## Configuration And AWS Client Boundary

Server-only configuration validates:

- `AVATAR_S3_BUCKET` is present and non-empty.
- `AVATAR_S3_REGION` is present and non-empty.

Missing configuration raises a typed avatar-storage configuration error that
the two API routes map to `503`. It must not affect login, sessions, workspace,
or profile rendering before an upload request is made.

The S3 client and presigner live behind a small server-only module so route
tests can inject or mock:

- presigned POST creation
- `HeadObject`
- ETag-conditional `CopyObject`
- not-found errors
- credential and network failures

The project adds direct production dependencies on `@aws-sdk/client-s3` and
`@aws-sdk/s3-presigned-post`; it does not rely on transitive packages. The
browser bundle must not import the AWS SDK, and a module-boundary test protects
that separation.

This phase targets the ECS production runtime only. In a Cloudflare/OpenNext
runtime, missing ECS task-role credentials/configuration leaves avatar storage
unavailable with a controlled `503` while unrelated routes remain functional.

## Backward-Compatible Delivery

Implementation ships in two PRs:

### PR A: Additive Backend

- Add statuses, persistence functions, S3 boundary, upload-intent endpoint,
  confirmation endpoint, AWS preflight, and tests.
- Add only the minimal `confirming` and `uploaded` labels required by the
  exhaustive existing `Record<AvatarStatus, string>`; do not change the
  control's dry-run requests or interaction flow.
- Keep `POST /api/profile/avatar` and all existing dry-run behavior/tests
  unchanged.
- Do not change `AvatarUploadControl` beyond those minimal status labels; keep
  its dry-run requests and interaction flow unchanged.
- Deploy and verify the new endpoints exist before any browser calls them.

### PR B: Profile UI

- Change `AvatarUploadControl` to call the already-deployed additive endpoints.
- Replace dry-run UI assertions with S3 POST and confirmation assertions.
- Keep the old dry-run endpoint available throughout this rollout so an old
  browser bundle routed to a new task still works.

Removal of `POST /api/profile/avatar` is a later cleanup PR after the new UI has
been deployed and caches have aged out. This ordering prevents a rolling ECS
deployment from mixing a new UI with tasks that do not yet expose its APIs.

## Profile UI Flow

The existing local preview and file validator remain.

After selection:

1. Request an upload intent.
2. Build `FormData` from the opaque returned fields.
3. Append the selected file last.
4. POST directly to S3.
5. On a successful S3 response, call the confirmation endpoint.
6. Show `原图已上传，等待图片处理` only after confirmation succeeds.

The control exposes distinct phases:

```text
selected -> preparing -> uploading -> confirming -> uploaded
                                             \----> error
```

The submit control is disabled while work is in flight. Before an intent exists,
selecting another file aborts active application requests, invalidates the local
UI attempt, and revokes the old preview URL. After an intent is reserved, the
control does not issue another intent until the current attempt is confirmed or
failed. A browser abort cannot revoke an issued S3 POST, so the database state
and lifecycle cleanup remain authoritative.

The uploaded original remains private and is not rendered as the account avatar.
The existing initial-based avatar stays visible until a later Lambda phase sets
the status to `ready` and supplies a processed delivery path.

## Error Handling

- Local metadata failure: do not call either API.
- Intent `401`: show the existing login path.
- Intent or confirmation `429`: show a retry-later message.
- A non-expired existing intent returns `409`; once its server-recorded
  five-minute lifetime passes, selecting and submitting again may atomically
  replace it.
- Missing S3 configuration or AWS failure: show temporary service
  unavailability without leaking AWS details.
- S3 POST non-success: do not call confirmation; preserve a retryable UI error.
- Confirmation `409`: report that the upload is stale or not available and ask
  the user to select the file again.
- Malformed API payload: treat as an application failure.
- Aborted application request: do not display stale feedback.

## Security Properties

- Authentication occurs before request-body processing.
- Best-effort process-local throttles are keyed by server-side session user ID.
- Database state permits at most one active or durable original per user before
  the Lambda phase.
- Request JSON is bounded independently of `Content-Length`.
- S3 enforces exact staging key, exact declared MIME, five-minute expiry, and
  1–5 MiB.
- Confirmation copies with the staging ETag as a source precondition and
  `IfNoneMatch="*"` as a destination precondition, so neither the browser nor a
  recovery request can overwrite the confirmed key.
- IAM restricts writes and verification to `original/*`.
- Prefix-restricted bucket listing disambiguates missing objects from IAM
  failures without granting general bucket listing.
- The bucket remains private with ACLs disabled and public access blocked.
- Pending objects expire after one day.
- Confirmation checks current database ownership before S3 access and before
  state transition.
- No static AWS credentials are stored in code, GitHub, ECS variables, or the
  browser.
- Presigned fields are not logged.
- Byte signature, dimensions, decompression bombs, and image decoder safety are
  deferred to the isolated Lambda processor; the original is never treated as
  ready content.

## Testing

### Unit And API Tests

- Staging and confirmed keys match their exact
  `original/{pending|confirmed}/{sessionUserId}/{uuid}.{extension}` forms.
- Unsupported or unsafe key segments are rejected.
- S3 configuration is lazy, server-only, and validates both variables.
- The POST policy contains the exact key, type, expiry, and size range.
- Intent authentication and rate limiting happen before body parsing.
- A successful intent persists `pending_upload` only for an eligible session
  user, and rejects a second active or uploaded original.
- Presign or persistence failures return controlled `503` responses without
  leaking temporary credentials.
- Confirmation rejects stale and cross-user keys before `HeadObject`.
- Confirmation handles missing, malformed, oversized, mistyped, and valid
  objects.
- Tests assert every copy includes both `CopySourceIfMatch=<staging-etag>` and
  destination `IfNoneMatch="*"`.
- Destination `412`/`409` recovery reads and validates the confirmed object and
  never retries an overwriting copy.
- Stale `confirming` with both staging and confirmed objects missing
  conditionally becomes `failed`, allowing a new intent.
- Conditional `pending_upload -> confirming -> uploaded` database updates
  and the 30-second confirmation lease prevent concurrent finalization races
  and recover from copy/database splits.
- Intent expiry and confirmation-lease tests use mocked DB results/SQL and
  assert `UTC_TIMESTAMP()`-based comparisons rather than application clocks.
- Repeated confirmation of the staging key derives the same confirmed key and is
  idempotent after upload.
- Direct AWS SDK dependencies and the server-only module boundary are asserted.
- AWS preflight tests cover missing task role, variables, public-access block,
  POST CORS, and pending lifecycle cleanup.

### UI Tests

- Form fields are treated as opaque and appended before the file.
- The file uses the exact final field operation
  `formData.append("file", file)`.
- Browser upload targets S3 directly rather than an application route.
- Confirmation is called only after S3 success.
- Preparing, uploading, confirming, uploaded, and error states are honest.
- New selection and unmount abort application requests and clean previews.
- Temporary signatures and tokens never appear in rendered errors.

### Regression And Build

- PR A keeps the existing dry-run route, UI, and their tests unchanged while
  adding backend tests.
- PR B deliberately replaces dry-run UI expectations with direct POST and
  confirmation expectations; unrelated auth, profile protection, workspace,
  header, and content-generation tests stay green.
- ESLint, TypeScript production build, CI Docker build, and mobile-width profile
  checks pass.

## Deployment Sequence

1. Add prefix-restricted `s3:ListBucket` to the ECS task role.
2. Add a one-day lifecycle expiration for `original/pending/`.
3. Change bucket CORS from `PUT` to `POST` for the exact production origin.
4. Grant the GitHub deploy role the read-only AWS permissions required by the
   preflight.
5. Run the preflight against the current PRIMARY task definition and bucket.
6. Merge PR A and verify the additive backend deployment while the old UI
   remains unchanged.
7. Exercise upload-intent and confirmation with authenticated API tests.
8. Merge PR B and verify login and the profile page.
9. Upload a small test image and confirm:
   - staging uses `original/pending/{userId}/`
   - confirmation creates `original/confirmed/{userId}/`
   - database status becomes `uploaded` and stores only the confirmed key
   - the confirmed original remains private
   - the UI does not claim the final avatar is ready
10. Verify invalid type, oversized POST, replayed staging upload, stale key, and
    repeated confirmation behavior.

Rollback the application before removing its S3 variables or task-role
permissions. Existing uploaded originals may remain private in S3 during a
rollback.

## Next Phase

The next isolated phase adds an S3 `ObjectCreated` trigger restricted to
`original/confirmed/`, validates and decodes actual image bytes in Lambda,
writes normalized output to `processed/`, and advances the database state to
`ready` or `failed`.

That phase must define loop prevention, Lambda IAM, retry/idempotency behavior,
image-library packaging, output format, private delivery, and stale-upload race
handling before implementation.
