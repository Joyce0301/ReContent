# Avatar Upload Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add avatar metadata to MySQL, an authenticated upload-intent API, and an honest profile-page file preparation flow without sending image bytes or creating AWS resources.

**Architecture:** Extend the existing user record and server-loaded auth session with normalized avatar metadata. A small avatar domain module validates client-declared file metadata and generates a user-scoped future S3 key; the protected API persists `pending_upload`. A focused client component provides local preview and status feedback while keeping the server-rendered profile boundary intact.

**Tech Stack:** Next.js App Router, React 19, TypeScript, MySQL/Aurora, Vitest, Testing Library, Tailwind CSS.

---

## File Map

- Create `docs/auth/migrations/2026-07-26-add-avatar-metadata.sql`: one-time Aurora MySQL forward migration.
- Create `docs/auth/migrations/2026-07-26-add-avatar-metadata.rollback.sql`: explicit rollback.
- Modify `docs/auth/mysql-auth-schema.sql`: make fresh database installs include avatar columns.
- Create `app/lib/avatar/types.ts`: avatar states and normalization.
- Create `app/lib/avatar/types.test.ts`: state normalization tests.
- Create `app/lib/avatar/validation.ts`: upload-intent request validation.
- Create `app/lib/avatar/validation.test.ts`: metadata boundary tests.
- Create `app/lib/avatar/object-key.ts`: server-owned avatar key generation.
- Create `app/lib/avatar/object-key.test.ts`: key ownership/extension tests.
- Modify `app/lib/auth/types.ts`: add normalized avatar metadata to user/session types.
- Modify `app/lib/auth/user-store.ts`: select/map avatar fields and reserve a pending upload.
- Create `app/lib/auth/user-store.test.ts`: query mapping and update ownership tests.
- Create `app/api/profile/avatar/route.ts`: authenticated upload-intent endpoint.
- Create `app/api/profile/avatar/route.test.ts`: API behavior and failure-path tests.
- Create `app/profile/avatar-upload-control.tsx`: client selection, preview, request, and status UI.
- Create `app/profile/avatar-upload-control.test.tsx`: client validation and request tests.
- Modify `app/profile/profile-view.tsx`: mount the focused upload control.
- Modify `app/profile/profile-view.test.tsx`: replace the static-placeholder expectations.
- Modify `.github/workflows/ci.yml`: include auth/profile/avatar tests in PR CI.
- Modify `docs/auth/mysql-auth-setup.md`: document migration-before-deploy ordering.

## Task 1: Database Metadata And Auth Mapping

**Files:**
- Create: `docs/auth/migrations/2026-07-26-add-avatar-metadata.sql`
- Create: `docs/auth/migrations/2026-07-26-add-avatar-metadata.rollback.sql`
- Modify: `docs/auth/mysql-auth-schema.sql`
- Create: `app/lib/avatar/types.ts`
- Create: `app/lib/avatar/types.test.ts`
- Modify: `app/lib/auth/types.ts`
- Modify: `app/lib/auth/user-store.ts`
- Create: `app/lib/auth/user-store.test.ts`

- [ ] **Step 1: Write avatar-state normalization tests**

Create `app/lib/avatar/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeAvatarStatus } from "./types";

describe("normalizeAvatarStatus", () => {
  it.each(["not_uploaded", "pending_upload", "ready", "failed"] as const)(
    "keeps known status %s",
    status => {
      expect(normalizeAvatarStatus(status)).toBe(status);
    }
  );

  it.each([null, undefined, "", "processing", 1])(
    "maps unknown value %j to not_uploaded",
    value => {
      expect(normalizeAvatarStatus(value)).toBe("not_uploaded");
    }
  );
});
```

- [ ] **Step 2: Run the state test and verify RED**

Run:

```bash
npx vitest run app/lib/avatar/types.test.ts
```

Expected: FAIL because `app/lib/avatar/types.ts` does not exist.

- [ ] **Step 3: Implement the avatar state domain**

Create `app/lib/avatar/types.ts`:

```ts
export const AVATAR_STATUSES = [
  "not_uploaded",
  "pending_upload",
  "ready",
  "failed"
] as const;

export type AvatarStatus = (typeof AVATAR_STATUSES)[number];

export function normalizeAvatarStatus(value: unknown): AvatarStatus {
  return typeof value === "string" &&
    AVATAR_STATUSES.includes(value as AvatarStatus)
    ? (value as AvatarStatus)
    : "not_uploaded";
}
```

- [ ] **Step 4: Write user-store mapping and ownership tests**

Mock `./db` before importing `./user-store`. Cover:

```ts
expect(findUserById("user-1")).resolves.toMatchObject({
  avatarKey: null,
  avatarStatus: "not_uploaded",
  avatarUpdatedAt: null
});
```

```ts
expect(findUserById("user-1")).resolves.toMatchObject({
  avatarKey: "avatars/originals/user-1/file.webp",
  avatarStatus: "pending_upload",
  avatarUpdatedAt: "2026-07-26T09:00:00.000Z"
});
```

```ts
await reserveAvatarUpload({
  userId: "user-1",
  objectKey: "avatars/originals/user-1/file.webp",
  updatedAt: new Date("2026-07-26T09:00:00.000Z")
});

expect(executeMock).toHaveBeenCalledWith(
  expect.stringContaining("WHERE id = ?"),
  [
    "avatars/originals/user-1/file.webp",
    "2026-07-26 09:00:00",
    "user-1"
  ]
);
```

The mocked `execute` result must cover both `affectedRows: 1` and
`affectedRows: 0`; `reserveAvatarUpload()` returns `true` only for the former.

- [ ] **Step 5: Run the user-store test and verify RED**

Run:

```bash
npx vitest run app/lib/auth/user-store.test.ts
```

Expected: FAIL because avatar fields and `reserveAvatarUpload` are absent.

- [ ] **Step 6: Extend auth types and user-store queries**

Add to `AuthUserRecord` and `AuthSessionUser`:

```ts
avatarKey: string | null;
avatarStatus: AvatarStatus;
avatarUpdatedAt: string | null;
```

Extend `AuthUserRow` with:

```ts
avatar_key: string | null;
avatar_status: string | null;
avatar_updated_at: Date | string | null;
```

Select `avatar_key`, `avatar_status`, and `avatar_updated_at` in both user
queries. Map nullable dates and call `normalizeAvatarStatus()`.

Add:

```ts
export async function reserveAvatarUpload(input: {
  userId: string;
  objectKey: string;
  updatedAt: Date;
}) {
  const [result] = await execute(
    `UPDATE users
     SET avatar_key = ?, avatar_status = 'pending_upload', avatar_updated_at = ?
     WHERE id = ?`,
    [
      input.objectKey,
      formatMysqlUtcDatetime(input.updatedAt),
      input.userId
    ]
  );

  return "affectedRows" in result && result.affectedRows === 1;
}
```

Pass the mapped avatar fields through `getAuthSession()` when constructing
`session.user`.

- [ ] **Step 7: Add forward, rollback, and fresh-install SQL**

Forward migration:

```sql
ALTER TABLE users
  ADD COLUMN avatar_key VARCHAR(512) NULL AFTER display_name,
  ADD COLUMN avatar_status VARCHAR(32) NOT NULL DEFAULT 'not_uploaded' AFTER avatar_key,
  ADD COLUMN avatar_updated_at DATETIME NULL AFTER avatar_status;
```

Rollback:

```sql
ALTER TABLE users
  DROP COLUMN avatar_updated_at,
  DROP COLUMN avatar_status,
  DROP COLUMN avatar_key;
```

Add the same three definitions to the base `CREATE TABLE users` schema.

- [ ] **Step 8: Verify Task 1**

Run:

```bash
npx vitest run app/lib/avatar/types.test.ts app/lib/auth/user-store.test.ts app/lib/auth/session.test.ts
npm run lint -- --no-warn-ignored app/lib/avatar app/lib/auth/types.ts app/lib/auth/user-store.ts app/lib/auth/user-store.test.ts
git diff --check
```

Expected: all tests and lint pass. Do not commit yet; repository policy
requires final independent reviews before implementation commits.

## Task 2: Upload Metadata Validation And Protected API

**Files:**
- Create: `app/lib/avatar/validation.ts`
- Create: `app/lib/avatar/validation.test.ts`
- Create: `app/lib/avatar/object-key.ts`
- Create: `app/lib/avatar/object-key.test.ts`
- Create: `app/api/profile/avatar/route.ts`
- Create: `app/api/profile/avatar/route.test.ts`

- [ ] **Step 1: Write validation tests**

Cover valid `.jpg`, `.jpeg`, `.png`, and `.webp` metadata. Cover:

```ts
expect(validateAvatarUploadIntent({
  fileName: "avatar.gif",
  contentType: "image/gif",
  sizeBytes: 100
})).toEqual({ ok: false, error: "仅支持 JPEG、PNG 或 WebP 图片" });
```

Also reject empty names, names over 255 characters, extension/MIME mismatch,
zero bytes, non-integers, and values greater than `5 * 1024 * 1024`.

- [ ] **Step 2: Run validation tests and verify RED**

Run:

```bash
npx vitest run app/lib/avatar/validation.test.ts
```

Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Implement validation**

Export:

```ts
export const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

export type AvatarUploadIntent = {
  fileName: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  extension: "jpg" | "png" | "webp";
};

export function validateAvatarUploadIntent(
  value: unknown
):
  | { ok: true; value: AvatarUploadIntent }
  | { ok: false; error: string };
```

Normalize `.jpeg` to extension `jpg`. Do not trust or return any client object
key or user ID.

- [ ] **Step 4: Write object-key tests**

Stub `randomUUID()` or inject a UUID into a pure helper and assert:

```ts
expect(createAvatarObjectKey({
  userId: "user-1",
  extension: "webp",
  id: "file-id"
})).toBe("avatars/originals/user-1/file-id.webp");
```

Reject user IDs or IDs containing `/`, `\`, `..`, or empty strings so a
future storage key cannot escape its prefix.

- [ ] **Step 5: Implement the object-key helper**

Use a pure exported helper for tests plus a production wrapper:

```ts
export function createAvatarObjectKey(input: {
  userId: string;
  extension: "jpg" | "png" | "webp";
  id?: string;
}) {
  const id = input.id ?? randomUUID();
  assertSafeSegment(input.userId);
  assertSafeSegment(id);
  return `avatars/originals/${input.userId}/${id}.${input.extension}`;
}
```

- [ ] **Step 6: Write API route tests**

Mock `getAuthSession`, `consumeRateLimit`, `createAvatarObjectKey`, and
`reserveAvatarUpload`. Cover:

- no session -> `401`
- auth storage/config error -> `503`
- `Content-Length: 9000` -> `413` before JSON parsing
- malformed JSON -> `400`
- invalid metadata -> `400`
- throttled -> `429` and `Retry-After`
- valid metadata -> `201`, generated server key passed to
  `reserveAvatarUpload`, response excludes key and user ID
- missing user update -> `404`
- unexpected exception -> rethrown

The successful response assertion is:

```ts
expect(await response.json()).toEqual({
  avatar: {
    status: "pending_upload",
    updatedAt: "2026-07-26T09:00:00.000Z"
  },
  message: "头像文件已通过校验，S3 存储将在下一阶段接入"
});
```

- [ ] **Step 7: Run API tests and verify RED**

Run:

```bash
npx vitest run app/api/profile/avatar/route.test.ts
```

Expected: FAIL because the route does not exist.

- [ ] **Step 8: Implement the protected route**

Implement this order:

1. Reject declared JSON bodies over 8 KiB.
2. Call `getAuthSession()`.
3. Return `401` when absent.
4. Consume the `avatar-upload-intent` rate-limit bucket using
   `session.user.id`.
5. Parse JSON and validate metadata.
6. Create the key from session user ID and normalized extension.
7. Persist `pending_upload`.
8. Return `201` without object key/user ID.

Catch only recognized auth/storage errors for `503`; rethrow unknown errors.

- [ ] **Step 9: Verify Task 2**

Run:

```bash
npx vitest run app/lib/avatar/*.test.ts app/api/profile/avatar/route.test.ts app/lib/auth/user-store.test.ts
npm run lint -- --no-warn-ignored app/lib/avatar app/api/profile/avatar
git diff --check
```

Expected: all pass. Do not commit yet.

## Task 3: Profile File Preparation UI

**Files:**
- Create: `app/profile/avatar-upload-control.tsx`
- Create: `app/profile/avatar-upload-control.test.tsx`
- Modify: `app/profile/profile-view.tsx`
- Modify: `app/profile/profile-view.test.tsx`

- [ ] **Step 1: Write client control tests**

Mock `URL.createObjectURL`, `URL.revokeObjectURL`, and `fetch`. Test:

- initial `not_uploaded` state and accepted file types
- invalid GIF and a file over 5 MiB do not call `fetch`
- valid WebP sends JSON metadata only
- submit button is disabled while the request is pending
- `201` shows `待接入 S3` and the honest server message
- `400`, `401`, `429`, `503`, malformed response, and rejected fetch show
  stable user feedback
- changing selection revokes the prior preview URL
- unmount revokes the current preview URL

Use a deferred promise in the pending-state test:

```ts
let resolveFetch!: (response: Response) => void;
fetchMock.mockReturnValue(
  new Promise<Response>(resolve => {
    resolveFetch = resolve;
  })
);
```

- [ ] **Step 2: Run the control test and verify RED**

Run:

```bash
npx vitest run app/profile/avatar-upload-control.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement `AvatarUploadControl`**

The client component receives:

```ts
type AvatarUploadControlProps = {
  avatarInitial: string;
  initialStatus: AvatarStatus;
};
```

Use `useEffect` to revoke the active object URL. Use an `onChange` handler to
validate the selected `File` with a client wrapper around the same metadata
validator. Submit:

```ts
await fetch("/api/profile/avatar", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    fileName: file.name,
    contentType: file.type,
    sizeBytes: file.size
  })
});
```

The UI must use "准备上传" rather than "上传成功" and explain that S3 storage is
not connected yet. Keep controls at least 44px high and retain a visible focus
ring.

- [ ] **Step 4: Integrate the control into `ProfileView`**

Replace the static avatar placeholder/message with:

```tsx
<AvatarUploadControl
  avatarInitial={avatarInitial}
  initialStatus={session.user.avatarStatus}
/>
```

Keep name/email/session details server-rendered. Do not pass `user.id`,
`avatarKey`, cookies, or tokens into the client component.

- [ ] **Step 5: Update profile tests**

Mock `AvatarUploadControl` in `profile-view.test.tsx` and assert only
`avatarInitial` and `initialStatus` are passed. Remove the old assertion that
no file input exists; retain all secret/internal-ID non-rendering assertions.

- [ ] **Step 6: Verify Task 3**

Run:

```bash
npx vitest run app/profile/avatar-upload-control.test.tsx app/profile/profile-view.test.tsx app/profile/page.test.tsx app/components/recontent/header.test.tsx
npm run lint -- --no-warn-ignored app/profile
git diff --check
```

Expected: all pass. Do not commit yet.

## Task 4: CI, Deployment Notes, And Final Delivery

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/auth/mysql-auth-setup.md`

- [ ] **Step 1: Expand CI test coverage**

Replace the narrow test command with shell-expandable paths:

```yaml
- name: Test
  run: >
    npx vitest run
    app/api/repurpose/*.test.ts
    app/api/auth/*/route.test.ts
    app/api/profile/avatar/route.test.ts
    app/lib/auth/*.test.ts
    app/lib/avatar/*.test.ts
    app/components/recontent/header.test.tsx
    app/profile/*.test.tsx
    app/page.test.tsx
```

Do not include the conditional live extraction test in required PR CI.

- [ ] **Step 2: Document migration ordering**

Add a section to `docs/auth/mysql-auth-setup.md` with:

```bash
mysql -h "$MYSQL_HOST" -P "${MYSQL_PORT:-3306}" -u "$MYSQL_USER" -p \
  "$MYSQL_DATABASE" < docs/auth/migrations/2026-07-26-add-avatar-metadata.sql
```

State explicitly that this runs before deploying the avatar-foundation image,
and include a query checking the three columns through
`information_schema.columns`.

- [ ] **Step 3: Run the full local gate**

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
  app/page.test.tsx
npm run lint
NEXT_TELEMETRY_DISABLED=1 npm run build
git diff --check
```

Expected: all required tests, lint, and production build pass.

- [ ] **Step 4: Perform mobile visual QA**

Run the app with a temporary preview fixture or a valid local session. Check
`320px` and `375px` widths with a long filename and long email:

- no horizontal overflow
- file input/label and submit action remain at least 44px tall
- preview is labelled as local
- status text never says the file is stored
- existing account details remain readable

Remove any temporary preview fixture before review.

- [ ] **Step 5: Required independent code review**

Dispatch an independent reviewer over the complete implementation diff.
Prioritize auth ownership, SQL migration safety, file validation boundaries,
secret/key exposure, UI state races, tests, and deployment ordering. Fix all
Critical/Important findings and rerun Step 3.

- [ ] **Step 6: Required adversarial review**

Dispatch a separate reviewer to attack malformed JSON, spoofed MIME/extensions,
huge declared values, unauthenticated requests, rate-limit bypass, object-key
traversal, deleted users, repeated clicks, stale previews, network failures,
missing database columns, and ECS build differences. Fix all high-risk
findings and rerun Step 3.

- [ ] **Step 7: Commit the implementation**

Stage only the files listed in this plan and commit:

```bash
git commit -m "feat: add avatar upload foundation"
```

- [ ] **Step 8: Push and create PR**

Push `codex/avatar-upload-foundation`. The PR must state:

- migration must run before ECS deployment
- no image bytes, S3, Lambda, IAM, or public avatar are included
- API reserves a pending object key owned by the authenticated user
- local tests, lint, build, mobile QA, code review, and adversarial review
  results

- [ ] **Step 9: Observe CI/CD**

Watch GitHub checks to a terminal state. Confirm whether any ECS or Cloudflare
deployment check is registered on the PR; do not claim a deployment ran if no
deployment check exists.
