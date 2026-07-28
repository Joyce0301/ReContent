# Avatar S3 Frontend Loop Design

## Goal

Connect the existing profile avatar control to the deployed S3 upload
backend. A signed-in user can select an image, preview it locally, upload the
original directly to S3, confirm the upload, and see:

```text
原图已上传，等待处理
```

## User Flow

1. The user selects a JPEG, PNG, or WebP file no larger than 5 MiB.
2. The page validates the file locally and keeps the existing object-URL
   preview.
3. The page posts the file metadata to
   `POST /api/profile/avatar/upload-intent`.
4. The page creates `FormData`, appends every `upload.fields` entry in
   iteration order, calls `formData.append("file", selectedFile)` last, and
   posts the form directly to `upload.url` without manually setting a
   multipart `Content-Type` header.
5. Only after S3 returns HTTP `204`, the page posts the returned `objectKey`
   to `POST /api/profile/avatar/confirm`.
6. Only after confirmation returns `status: "uploaded"` does the page show
   `原图已上传，等待处理`.

`AvatarUploadControl` no longer calls the legacy dry-run
`POST /api/profile/avatar` route. The route remains unchanged for rolling
deployment compatibility with older browser bundles.

## Component State

The existing avatar control owns a separate `selectedFile: File | null`, its
preview URL, and these visible phases:

- local validation
- requesting upload intent
- uploading original
- confirming upload
- uploaded
- error

The file input and submit button are disabled while a request is active.
Unmounting the component aborts active fetches and revokes the local preview
URL. Aborting a browser request does not cancel a reservation already persisted
by the upload-intent API. A later intent can therefore return `409` until the
server-side reservation becomes eligible again; the UI reports that the
current upload could not complete and asks the user to try again later. Retry
orchestration remains out of scope. The successful local preview remains
visible for this version.

`AvatarUploadIntent` remains the server-side validated metadata type containing
`fileName`, `contentType`, `sizeBytes`, and the derived `extension`. It is not
extended with a browser `File`. The client serializes only the three fields
accepted by the upload-intent endpoint:

```ts
{
  fileName: string;
  contentType: string;
  sizeBytes: number;
}
```

`extension` is derived during validation and must not be included in the
request body because the endpoint rejects unknown fields.

## Response Handling

The upload-intent request sends only the locally validated file metadata. The
client accepts the response only when it matches the deployed nesting:

```ts
{
  upload: {
    url: string;
    fields: Record<string, string>;
    expiresAt: string;
  };
  objectKey: string;
}
```

`upload.url`, `upload.expiresAt`, and the top-level `objectKey` must be
non-empty strings. Every value in `upload.fields` must be a string. The client
must not interpret `url` or `fields` as top-level properties.

The confirmation request sends exactly:

```ts
{ objectKey: string }
```

The client accepts confirmation only when the response contains
`status: "uploaded"` and a non-empty string `confirmedKey`.

Malformed responses, non-`204` S3 responses, network failures, and API error
responses produce a user-facing error and never show success. Presigned
fields, policies, signatures, security tokens, object keys, API or S3 error
bodies, and raw AWS errors are never rendered or written through
`console.log`, `console.info`, `console.warn`, or `console.error`.

API status handling preserves the existing profile behavior:

- `401`: show the expired-login message and login link
- `400`: show a fixed invalid-upload message without exposing the response body
- `413`: show that the upload request is too large and ask the user to choose a
  smaller file
- `409`: show that the upload cannot continue and ask the user to try later
- `429`: show the rate-limit message
- `503`: show the service-unavailable message
- malformed or unexpected responses: show a fixed generic upload error

Error bodies are accepted only for the existing bounded `{ error: string }`
shape and are never used to expose S3 or AWS response bodies.

## Testing

Component tests cover:

- local preview followed by the three requests in order
- every `upload.fields` entry being copied to `FormData`, followed by the file
  as the final `file` entry
- the S3 POST using `upload.url` without a manually supplied multipart
  `Content-Type` header
- `formData.append("file", selectedFile)` being the final form entry
- confirmation running only after S3 returns `204`
- the final success status and message
- malformed upload-intent and confirmation responses never showing success
- S3 network rejection and HTTP `200`, `201`, or `400` never calling confirm
  and never showing success
- intent, S3, and confirmation failures not rendering or logging presigned
  fields, object keys, signatures, tokens, or raw error bodies
- the intent request containing exactly `fileName`, `contentType`, and
  `sizeBytes`, without the derived `extension`
- `400`, `413`, `401`, `409`, `429`, and `503` retaining their defined
  user-facing behavior without showing success
- replacing legacy dry-run assertions with the intent/S3/confirm sequence and
  asserting that the component never calls `POST /api/profile/avatar`
- repeated submit attempts while a request is active not starting another
  upload sequence

## Out Of Scope

- Lambda compression
- processed-avatar delivery or final avatar rendering
- retry orchestration
- upload cancellation API
- progress percentages
- changes to the existing backend contracts
