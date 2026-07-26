# Avatar Upload Foundation Design

## Summary

This phase prepares ReContent for a later S3 avatar flow without uploading or
saving an image. It adds avatar columns and normalized user/session mappings,
rollout-safe legacy reads, an authenticated metadata-validation endpoint, and
an honest profile-page dry-run interaction.

The current endpoint validates only browser-declared metadata. It does not
generate an object key, write avatar metadata to MySQL, mutate
`pending_upload`, transfer image bytes, or reserve storage.

## Goals

- Add the avatar columns, application types, and user/session mapping needed by
  the next S3 phase.
- Keep login and protected user reads available if an automatic ECS deployment
  reaches an existing database before its avatar migration.
- Validate candidate filename, MIME type, and byte size through an authenticated,
  rate-limited, bounded endpoint.
- Let `/profile` provide a local preview and clearly report `待接入 S3`.
- Preserve existing authentication, workspace, header, and logout behavior.

## Non-Goals

- Uploading image bytes or saving avatar metadata.
- Generating or reserving an S3 object key in the API route.
- Mutating `avatar_status` to `pending_upload`.
- S3 buckets, presigned requests, AWS SDK dependencies, IAM, CORS, or Lambda.
- Image dimension, file-signature, malware, or server-side byte inspection.
- Public or signed avatar delivery URLs.
- Rendering a stored avatar in the workspace header.
- Automatic database schema mutation during application startup.

## Database Model

The current `users` schema includes:

```sql
avatar_key VARCHAR(512) NULL
avatar_status VARCHAR(32) NOT NULL DEFAULT 'not_uploaded'
avatar_updated_at DATETIME NULL
```

The application model recognizes `not_uploaded`, `pending_upload`, `ready`, and
`failed`. These states and columns exist for the later storage and processing
flow; this phase does not write any avatar state. Fresh registrations map to
`not_uploaded` with null key and timestamp values.

`AuthUserRecord` and `AuthSessionUser` expose:

```ts
avatarKey: string | null;
avatarStatus: AvatarStatus;
avatarUpdatedAt: string | null;
```

Unknown database status values normalize to `not_uploaded`. Internal user IDs
and object keys are never rendered in the profile UI.

## Rollout-Safe User Reads

Core reads by email and ID first select the new avatar columns. They retry with
the legacy column list only when MySQL reports `ER_BAD_FIELD_ERROR`/1054 and the
error identifies one of these missing columns:

- `avatar_key`
- `avatar_status`
- `avatar_updated_at`

The fallback must not catch unrelated missing columns, connectivity failures,
syntax errors, or other database problems. Those errors retain their normal
failure behavior. A legacy row maps to `avatarKey: null`,
`avatarStatus: "not_uploaded"`, and `avatarUpdatedAt: null`.

This narrow fallback prevents a late migration from breaking existing login and
session-backed routes during an automatic ECS rollout. It is a deployment
safety net, not a replacement for applying the migration.

## Migration Safety

The forward migration checks each avatar column independently before adding it.
It can therefore be rerun after either a complete migration or an interrupted
partial run. The rollback similarly checks each column independently before
dropping it and is repeat-safe after complete or partial execution.

Existing databases should apply the forward migration before relying on avatar
metadata. Fresh databases apply the current base schema only and must not run
the forward migration afterward. The application never executes `ALTER TABLE`
at runtime.

Rollback remains destructive because it removes avatar metadata. It may be used
only after the application has been rolled back to a revision that does not
query the avatar columns.

## Metadata Validation API

### Endpoint

`POST /api/profile/avatar`

### Request

```json
{
  "fileName": "avatar.webp",
  "contentType": "image/webp",
  "sizeBytes": 245760
}
```

The JSON body contains metadata only. Image bytes are not accepted.

### Authentication And Rate Limit

The route authenticates with `getAuthSession()` before reading request input.
No session returns `401`; recognized auth configuration or storage failures
return `503`; unexpected errors are rethrown.

Authenticated requests consume the `avatar-upload-intent` rate-limit bucket
keyed by the server-side session user ID. The limit is 20 requests per 10
minutes. A rejected request returns `429` with `Retry-After`.

### Bounded Input

The route accepts at most 8 KiB of JSON:

- A valid declared `Content-Length` over 8 KiB returns `413`.
- An invalid or ambiguous `Content-Length` returns `400`.
- The stream is counted while being read, so an absent or understated header
  cannot bypass the limit.
- An actual body over 8 KiB returns `413`.
- Malformed JSON or an aborted/failing request stream returns a controlled
  `400`.

### Metadata Rules

- `fileName` is a non-empty string of at most 255 characters.
- `contentType` is `image/jpeg`, `image/png`, or `image/webp`.
- `sizeBytes` is an integer from 1 through 5 MiB.
- The filename extension matches the declared MIME type:
  `.jpg`/`.jpeg`, `.png`, or `.webp`.

This validation is preliminary. Browser-declared metadata is not a security
boundary; the later S3 processing flow must inspect actual bytes.

### Dry-Run Response

Valid metadata returns `200` with exactly:

```json
{
  "validation": {
    "status": "ready_for_storage"
  },
  "message": "头像信息已通过校验，图片尚未上传或保存"
}
```

`ready_for_storage` describes validation readiness only. The route does not
generate an object key, update MySQL, change `avatar_status`, or return a
missing-user `404` path. A standalone object-key helper may exist in the
repository for the next phase, but the current route does not import or invoke
it.

## Profile UI

`AvatarUploadControl`:

- Accepts JPEG, PNG, and WebP selection.
- Shows a temporary local preview labelled `本地预览，尚未保存`.
- Performs the same basic metadata checks before requesting the API.
- Sends only `fileName`, `file.type`, and `file.size`.
- Shows `待接入 S3` after the exact dry-run success response.
- Displays the exact message
  `头像信息已通过校验，图片尚未上传或保存`.
- Never claims the file or avatar was uploaded or saved.
- Prevents duplicate submission after success until a new file is selected.
- Aborts an in-flight request on unmount and revokes stale object URLs.

The existing avatar initial remains visible as the account-avatar fallback.
The local preview is not presented as a persisted account avatar.

## Error Handling

- Invalid local selection: do not call the API; show validation feedback.
- `400`: show the controlled validation or request-body error.
- `401`: report expiration and expose the existing login path.
- `429`: ask the user to retry later.
- `503`: report temporary avatar-service unavailability.
- Malformed API response or network failure: show a generic retry message.
- Aborted component request: do not display a stale failure.

## Testing

### Database And Migration

- Map present, nullable, and unknown avatar values.
- Try the avatar-aware read first.
- Fall back only for error 1054 naming an avatar column.
- Never fall back for unrelated database failures or unrelated missing columns.
- Verify forward and rollback SQL guards for complete, repeated, and partial
  states.

### API

- Authenticate before reading input.
- Enforce per-user rate limiting.
- Enforce declared and actual 8 KiB boundaries.
- Return controlled `400` responses for malformed JSON and failed streams.
- Validate metadata boundaries.
- Return the exact `200` dry-run contract.
- Assert that the route has no persistence or object-key dependency.

### UI And Regression

- Send metadata only and render the exact honest response.
- Show `待接入 S3` without upload/save claims.
- Clean up previews and aborted requests.
- Keep profile protection, login, session, header, workspace, logout, CI lint,
  production build, and Docker build behavior green.

## Deployment Sequence

For an existing database:

1. Apply the guarded forward migration using the verified-TLS command in
   [MySQL Auth Setup](../../auth/mysql-auth-setup.md).
2. Deploy or continue the automatic ECS rollout.
3. Verify login and protected routes.
4. Verify the three avatar columns, then exercise the dry-run endpoint and UI.

If deployment starts before the migration completes, the narrow legacy read
fallback keeps existing auth reads working. Operators should still apply the
migration before any later phase relies on persisted avatar metadata.

For a fresh database, apply the current
[base schema](../../auth/mysql-auth-schema.sql) and do not run the forward
migration afterward.

## Next Phase

The S3 phase can use the existing types, columns, validator, and standalone key
helper to add server-owned object-key generation, persistence, and a presigned
upload contract. Those behaviors require a new API contract and tests; they
must not be inferred from the current `ready_for_storage` dry run.
