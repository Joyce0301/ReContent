# Avatar Upload Foundation Design

## Summary

This phase adds the data model, authenticated upload-intent API, validation,
and profile-page interaction needed for avatar uploads. It deliberately does
not transfer image bytes, create AWS resources, sign S3 requests, invoke
Lambda, or display a processed avatar.

The API boundary is designed so the next phase can add an S3 presigned URL to
the successful response without changing the client request or database
metadata model.

## Goals

- Store avatar object metadata and processing state on the existing `users`
  row.
- Let an authenticated user select a candidate avatar on `/profile`.
- Validate the candidate's declared filename, MIME type, and byte size.
- Create a user-scoped object key and persist a `pending_upload` state.
- Show accurate pending, success, and failure feedback without claiming that
  image bytes were uploaded.
- Preserve all existing authentication, workspace, and logout behavior.

## Non-Goals

- Sending image bytes to the Next.js server.
- S3 buckets, presigned requests, AWS SDK dependencies, IAM, or CORS.
- Lambda image compression, image dimension validation, malware scanning, or
  file-signature inspection.
- Public or signed avatar delivery URLs.
- Rendering a stored avatar in the workspace header.
- Automatic database schema mutation during application startup.

## Approaches Considered

### Upload intent with metadata only

The browser sends a small JSON request containing the selected file's name,
declared MIME type, and size. The server validates it, creates a user-scoped
future S3 object key, and records `pending_upload`.

This is the selected approach. It avoids temporary ECS disk storage and large
request bodies while preserving the exact contract needed for the S3 phase.

### Store image bytes on ECS local disk

This would make the UI look complete sooner, but files could disappear during
task replacement or scaling. It is incompatible with stateless ECS
deployments and is rejected.

### Add S3 presigned upload immediately

This would deliver a complete upload path, but it combines database, API, IAM,
bucket CORS, and cloud deployment work in one change. It is deferred to keep
the current phase isolated and reviewable.

## Database Model

The existing `users` table gains three nullable/defaulted columns:

```sql
avatar_key VARCHAR(512) NULL
avatar_status VARCHAR(32) NOT NULL DEFAULT 'not_uploaded'
avatar_updated_at DATETIME NULL
```

Supported application states are:

- `not_uploaded`: no avatar intent has been created.
- `pending_upload`: metadata passed validation and an object key is reserved.
- `ready`: reserved for the later Lambda-completed flow.
- `failed`: reserved for a later upload or processing failure.

This phase writes only `pending_upload`. Existing users receive
`not_uploaded` through the column default. Registration remains compatible
because the new columns do not need to appear in the current insert.

The repository will contain a forward migration and a documented rollback.
The application must never run `ALTER TABLE` automatically.

## User And Session Types

`AuthUserRecord` and `AuthSessionUser` gain:

```ts
avatarKey: string | null;
avatarStatus: AvatarStatus;
avatarUpdatedAt: string | null;
```

`findUserByEmail()` and `findUserById()` select and map the new columns.
`getAuthSession()` continues to load the user from MySQL on every protected
request, so `/profile` receives current avatar metadata without changing the
signed cookie payload.

Unknown database values are mapped to `not_uploaded` rather than trusted as an
application state. Internal user IDs and object keys are not rendered in the
profile page.

## Upload-Intent API

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

The request is JSON; image bytes are not included.

### Authentication

The route calls `getAuthSession()` before accepting input. An absent session
returns `401`. Existing auth configuration or storage failures return `503`.
Unexpected errors are rethrown.

### Validation

- `fileName` must be a non-empty string of at most 255 characters.
- `contentType` must be `image/jpeg`, `image/png`, or `image/webp`.
- `sizeBytes` must be an integer from 1 through 5 MiB.
- The filename extension must agree with the declared MIME type:
  `.jpg`/`.jpeg`, `.png`, or `.webp`.
- Requests with a declared `Content-Length` greater than 8 KiB return `413`.
- Invalid metadata returns `400` with a concise user-facing error.

This validation is intentionally preliminary. The later S3/Lambda phase must
inspect actual bytes and dimensions because browser-declared metadata is not
a security boundary.

### Rate Limit

The existing in-memory rate limiter uses an `avatar-upload-intent` bucket keyed
by authenticated user ID. The limit is 20 intents per 10 minutes. A rejected
request returns `429` and `Retry-After`.

### Object Key

After validation, the route creates:

```text
avatars/originals/<user-id>/<uuid>.<normalized-extension>
```

The user ID is taken only from the authenticated server session. Client input
cannot choose the user segment or object key.

### Persistence And Response

The route updates only the authenticated user's row:

```sql
UPDATE users
SET avatar_key = ?, avatar_status = 'pending_upload', avatar_updated_at = ?
WHERE id = ?
```

A successful response is `201`:

```json
{
  "avatar": {
    "status": "pending_upload",
    "updatedAt": "2026-07-26T09:00:00.000Z"
  },
  "message": "头像文件已通过校验，S3 存储将在下一阶段接入"
}
```

The response does not expose the internal object key. If the user row cannot
be updated, the route returns `404`; storage/configuration errors return
`503`.

## Profile UI

The static placeholder in `ProfileView` is replaced by a focused client
component, `AvatarUploadControl`.

The control:

- Uses a file input restricted to JPEG, PNG, and WebP.
- Shows the selected image through a temporary local object URL.
- Performs the same basic MIME/size checks before making a request.
- Sends only `fileName`, `file.type`, and `file.size`.
- Shows `准备中`, `正在校验`, `待接入 S3`, or an error message.
- Disables duplicate submissions while a request is pending.
- Revokes old object URLs when selection changes or the component unmounts.
- Clearly says that the image has not yet been stored.

The existing avatar initial remains the fallback. A local preview is labelled
as a preview and must not be presented as the saved account avatar.

## Error Handling

- Invalid local selection: no request; show the validation message.
- `400`: show the API validation message.
- `401`: tell the user the session expired and provide the existing auth path.
- `429`: show a retry-later message.
- `503`: show that avatar preparation is temporarily unavailable.
- Network or malformed-response failure: show a generic retry message.

Errors do not remove the existing avatar initial or account details.

## Testing

### Data and validation

- Maps nullable avatar columns and known statuses.
- Maps unknown statuses to `not_uploaded`.
- Persists a pending upload only for the supplied authenticated user ID.
- Accepts valid JPEG, PNG, and WebP metadata.
- Rejects empty/long names, unsupported MIME types, mismatched extensions,
  zero bytes, non-integers, and files above 5 MiB.

### API

- Returns `401` without a session.
- Returns `400` for invalid metadata.
- Returns `413` for an oversized JSON request declaration.
- Returns `429` with `Retry-After` when throttled.
- Returns `201` and persists a server-generated key for valid metadata.
- Does not return the key or internal user ID.
- Returns `503` for recognized auth/database failures.
- Rethrows unexpected errors.

### UI

- Shows the current avatar status.
- Rejects invalid files before `fetch`.
- Sends metadata only for a valid selection.
- Shows an honest pending-S3 success message.
- Prevents duplicate submissions.
- Cleans up local preview URLs.

### Regression

- Existing auth/session tests remain green with the new optional metadata.
- Profile protection, workspace header, logout, lint, and production build
  remain green.

## Deployment Sequence

1. Apply the SQL migration to the target Aurora MySQL database.
2. Deploy the application revision.
3. Verify existing login and `/profile`.
4. Select a valid image and confirm the user row becomes `pending_upload`.
5. Verify no binary is stored and the UI does not claim upload completion.

Deploying the application before the migration would make auth user queries
reference missing columns, so the migration is a required pre-deployment gate.

## Next Phase

The S3 phase will create the bucket/CORS/IAM resources and return a presigned
PUT URL from the same `POST /api/profile/avatar` response. The browser will
upload directly to the reserved `avatar_key`. S3 will then trigger Lambda,
which validates and compresses the original, writes a processed object, and
updates the user's status to `ready` or `failed`.
