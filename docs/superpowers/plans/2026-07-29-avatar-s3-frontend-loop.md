# Avatar S3 Frontend Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the profile avatar dry-run submission with the smallest complete browser upload loop: local preview, upload intent, direct S3 POST, confirmation, and the final `原图已上传，等待处理` state.

**Architecture:** Keep the behavior inside the existing `AvatarUploadControl` client component and reuse the current local metadata validator. Store the selected browser `File` separately from validated metadata, validate both API responses before using them, submit every presigned field plus the file to S3, and confirm only after S3 returns exactly HTTP 204.

**Tech Stack:** React 19, Next.js 16 client component, TypeScript, browser `fetch`/`FormData`, Vitest, Testing Library.

## Global Constraints

- Only implement: select and preview -> request upload intent -> direct S3 `FormData` POST -> call confirm -> show `原图已上传，等待处理`.
- Do not add Lambda processing, processed-avatar display, retries, progress percentages, or a cancellation API.
- Send exactly `fileName`, `contentType`, and `sizeBytes` to `/api/profile/avatar/upload-intent`; never serialize the derived `extension`.
- Copy every `upload.fields` entry to `FormData`, append the selected file as the final `"file"` entry, and do not manually set a multipart `Content-Type`.
- Treat only S3 HTTP 204 as success and call `/api/profile/avatar/confirm` only afterward.
- Show the final success state only when confirm returns `status: "uploaded"` and a non-empty `confirmedKey`.
- Never render or log presigned fields, policies, signatures, security tokens, object keys, raw API bodies, raw S3 bodies, or raw AWS errors.
- Keep the legacy `POST /api/profile/avatar` route unchanged for rolling-deployment compatibility, but the component must no longer call it.

---

### Task 1: Complete the successful browser upload sequence

**Files:**
- Modify: `app/profile/avatar-upload-control.test.tsx`
- Modify: `app/profile/avatar-upload-control.tsx`

**Interfaces:**
- Consumes: `validateAvatarUploadIntent({ fileName, contentType, sizeBytes })`
- Consumes: `POST /api/profile/avatar/upload-intent`
- Consumes response:

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

- Produces request: `POST upload.url` with `FormData`
- Produces request: `POST /api/profile/avatar/confirm` with `{ objectKey }`
- Consumes confirmation:

```ts
type ConfirmResponse = {
  status: "uploaded";
  confirmedKey: string;
};
```

- Produces visible status and feedback: `原图已上传，等待处理`

- [x] **Step 1: Replace dry-run fixtures with browser-upload fixtures**

Add deterministic response fixtures near the top of the component test:

```ts
const uploadIntentBody = {
  upload: {
    url: "https://avatar-bucket.s3.amazonaws.com/",
    fields: {
      key: "staging/users/user-1/avatar.png",
      policy: "signed-policy",
      "x-amz-signature": "signed-value"
    },
    expiresAt: "2026-07-29T12:00:00.000Z"
  },
  objectKey: "staging/users/user-1/avatar.png"
} as const;

const confirmBody = {
  status: "uploaded",
  confirmedKey: "staging/users/user-1/avatar.png"
} as const;
```

Extend the response helper so tests can represent the S3 response without a JSON method:

```ts
function statusResponse(status: number) {
  return { status };
}
```

- [x] **Step 2: Write the failing happy-path test**

Replace the old `posts only validated file metadata` dry-run test with a test that queues three responses and records the submitted form entries:

```ts
it("uploads the selected file through intent, S3, and confirm in order", async () => {
  const file = createFile("portrait.jpeg", "image/jpeg", 2048);
  const fetchMock = vi
    .mocked(fetch)
    .mockResolvedValueOnce(jsonResponse(200, uploadIntentBody) as never)
    .mockResolvedValueOnce(statusResponse(204) as never)
    .mockResolvedValueOnce(jsonResponse(200, confirmBody) as never);

  render(
    <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
  );
  selectFile(file);
  fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

  expect(await screen.findByText("原图已上传，等待处理")).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledTimes(3);

  const intentOptions = fetchMock.mock.calls[0]?.[1];
  expect(fetchMock.mock.calls[0]?.[0]).toBe(
    "/api/profile/avatar/upload-intent"
  );
  expect(JSON.parse(String(intentOptions?.body))).toEqual({
    fileName: "portrait.jpeg",
    contentType: "image/jpeg",
    sizeBytes: 2048
  });
  expect(JSON.parse(String(intentOptions?.body))).not.toHaveProperty(
    "extension"
  );

  const s3Options = fetchMock.mock.calls[1]?.[1];
  expect(fetchMock.mock.calls[1]?.[0]).toBe(uploadIntentBody.upload.url);
  expect(s3Options?.body).toBeInstanceOf(FormData);
  expect(s3Options?.headers).toBeUndefined();
  expect(Array.from((s3Options?.body as FormData).entries())).toEqual([
    ["key", uploadIntentBody.upload.fields.key],
    ["policy", uploadIntentBody.upload.fields.policy],
    ["x-amz-signature", uploadIntentBody.upload.fields["x-amz-signature"]],
    ["file", file]
  ]);

  expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/profile/avatar/confirm");
  expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
    objectKey: uploadIntentBody.objectKey
  });
  expect(
    fetchMock.mock.calls.some(([url]) => url === "/api/profile/avatar")
  ).toBe(false);
});
```

- [x] **Step 3: Run the happy-path test and verify RED**

Run:

```bash
npx vitest run app/profile/avatar-upload-control.test.tsx -t "uploads the selected file through intent, S3, and confirm in order"
```

Expected: FAIL because the current component calls `/api/profile/avatar`, does not retain the selected `File`, and does not perform the S3 or confirmation requests.

- [x] **Step 4: Implement response guards and selected-file state**

In `avatar-upload-control.tsx`, remove the dry-run response type/guard and add strict structural guards:

```ts
type UploadIntentResponse = {
  upload: {
    url: string;
    fields: Record<string, string>;
    expiresAt: string;
  };
  objectKey: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isUploadIntentResponse(
  value: unknown
): value is UploadIntentResponse {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as {
    upload?: unknown;
    objectKey?: unknown;
  };
  if (
    typeof candidate.upload !== "object" ||
    candidate.upload === null ||
    !isNonEmptyString(candidate.objectKey)
  ) {
    return false;
  }

  const upload = candidate.upload as {
    url?: unknown;
    fields?: unknown;
    expiresAt?: unknown;
  };
  return (
    isNonEmptyString(upload.url) &&
    isNonEmptyString(upload.expiresAt) &&
    typeof upload.fields === "object" &&
    upload.fields !== null &&
    !Array.isArray(upload.fields) &&
    Object.values(upload.fields).every(isNonEmptyString)
  );
}

function isConfirmResponse(
  value: unknown
): value is { status: "uploaded"; confirmedKey: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { status?: unknown }).status === "uploaded" &&
    isNonEmptyString((value as { confirmedKey?: unknown }).confirmedKey)
  );
}
```

Add `selectedFile` independently of the existing validated metadata:

```ts
const [selectedFile, setSelectedFile] = useState<File | null>(null);
```

Clear it when selection is cleared or invalid, and set it only after local validation succeeds.

- [x] **Step 5: Implement the three-request sequence**

Replace the dry-run fetch in `handleSubmit` with:

```ts
const intentResponse = await fetch("/api/profile/avatar/upload-intent", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  signal: requestController.signal,
  body: JSON.stringify({
    fileName: intent.fileName,
    contentType: intent.contentType,
    sizeBytes: intent.sizeBytes
  })
});
```

After checking that the response is HTTP 200 and passes `isUploadIntentResponse`, create and submit the S3 form:

```ts
const formData = new FormData();
for (const [field, value] of Object.entries(intentBody.upload.fields)) {
  formData.append(field, value);
}
formData.append("file", selectedFile);

const s3Response = await fetch(intentBody.upload.url, {
  method: "POST",
  signal: requestController.signal,
  body: formData
});
```

Only after `s3Response.status === 204`, confirm:

```ts
const confirmResponse = await fetch("/api/profile/avatar/confirm", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  signal: requestController.signal,
  body: JSON.stringify({ objectKey: intentBody.objectKey })
});
```

Only after HTTP 200 and `isConfirmResponse(confirmBody)`:

```ts
setIntent(null);
setSelectedFile(null);
setPhase("uploaded");
setFeedback("原图已上传，等待处理");
```

Update `ControlPhase`, status text, input/button disabled conditions, and the button label from `准备头像` to `上传头像` so all three requests share one active state.

- [x] **Step 6: Run the focused test and verify GREEN**

Run:

```bash
npx vitest run app/profile/avatar-upload-control.test.tsx -t "uploads the selected file through intent, S3, and confirm in order"
```

Expected: PASS with exactly three fetch calls in the required order.

- [x] **Step 7: Migrate the remaining dry-run tests**

Delete `dryRunSuccessBody` and replace the old pending-S3 success assertions
with the three-response upload sequence. The former
`shows the pending-S3 status and exact dry-run message after 200` test must
instead assert that both the visible status and feedback equal
`原图已上传，等待处理`. The former repeat-after-dry-run test must assert that
submission remains disabled after confirmation until a new file is selected,
then queue a fresh three-response sequence for the new file.

Make the duplicate submission test leave the upload-intent request unresolved
and assert only one fetch occurs. Keep the existing unmount test and assert
that the shared `AbortSignal` passed to the active upload-intent request
becomes aborted.

- [x] **Step 8: Run the component test file**

Run:

```bash
npx vitest run app/profile/avatar-upload-control.test.tsx
```

Expected: PASS for local validation, preview lifecycle, happy path, duplicate submission, and abort behavior.

---

### Task 2: Reject unsafe or incomplete upload sequences

**Files:**
- Modify: `app/profile/avatar-upload-control.test.tsx`
- Modify: `app/profile/avatar-upload-control.tsx`

**Interfaces:**
- Consumes the Task 1 `UploadIntentResponse` and confirmation guards.
- Produces fixed user-facing failures without exposing response bodies or upload credentials.
- Guarantees confirm is never called unless S3 returned exactly HTTP 204.

- [x] **Step 1: Write failing malformed-contract tests**

Add table-driven tests for:

```ts
[
  { upload: { url: "", fields: {}, expiresAt: "later" }, objectKey: "key" },
  { upload: { url: "https://s3.example", fields: { key: 42 }, expiresAt: "later" }, objectKey: "key" },
  { upload: { url: "https://s3.example", fields: {}, expiresAt: "" }, objectKey: "key" },
  { upload: { url: "https://s3.example", fields: {}, expiresAt: "later" }, objectKey: "" }
]
```

Each upload-intent response must show `头像服务返回了无法识别的响应，请稍后再试`, stop after one fetch, and never show `原图已上传，等待处理`.

Add malformed confirmation cases:

```ts
[
  { status: "ready", confirmedKey: "key" },
  { status: "uploaded", confirmedKey: "" },
  { status: "uploaded" }
]
```

Each case queues a valid intent, S3 204, and malformed confirm; it must stop after three fetches and show the same generic malformed-response message.

- [x] **Step 2: Run malformed-contract tests and verify RED**

Run:

```bash
npx vitest run app/profile/avatar-upload-control.test.tsx -t "malformed"
```

Expected: FAIL until both strict guards are connected to the request sequence.

- [x] **Step 3: Write failing S3 status tests**

For each status `200`, `201`, and `400`, queue a valid intent response followed by the S3 response:

```ts
it.each([200, 201, 400])(
  "does not confirm when S3 returns %s",
  async status => {
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, uploadIntentBody) as never)
      .mockResolvedValueOnce(statusResponse(status) as never);

    render(
      <AvatarUploadControl avatarInitial="J" initialStatus="not_uploaded" />
    );
    selectFile(createFile());
    fireEvent.click(screen.getByRole("button", { name: "上传头像" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("原图已上传，等待处理")).toBeNull();
  }
);
```

Add the same assertions when the S3 fetch rejects with `new TypeError("secret AWS body")`.

- [x] **Step 4: Run S3 status tests and verify RED**

Run:

```bash
npx vitest run app/profile/avatar-upload-control.test.tsx -t "S3"
```

Expected: FAIL until non-204 and rejected S3 requests terminate the sequence without confirmation.

- [x] **Step 5: Add fixed stage-aware failure handling**

Use fixed copy selected by response status and request stage:

```ts
const GENERIC_UPLOAD_ERROR = "头像上传失败，请稍后再试";
const INVALID_UPLOAD_MESSAGE = "头像上传请求无效，请重新选择文件";
const UPLOAD_TOO_LARGE_MESSAGE = "头像上传请求过大，请选择更小的文件";
const UPLOAD_CONFLICT_MESSAGE = "当前头像暂时无法继续上传，请稍后再试";
```

Handle API statuses consistently for upload-intent and confirm:

```ts
switch (response.status) {
  case 400:
    return INVALID_UPLOAD_MESSAGE;
  case 401:
    return "登录已过期，请重新登录";
  case 409:
    return UPLOAD_CONFLICT_MESSAGE;
  case 413:
    return UPLOAD_TOO_LARGE_MESSAGE;
  case 429:
    return "请求过于频繁，请稍后再试";
  case 503:
    return "头像服务暂时不可用，请稍后再试";
  default:
    return GENERIC_UPLOAD_ERROR;
}
```

Do not display response-body `error` strings. Network failures use `网络连接失败，请稍后再试`; invalid JSON or contract shape uses `MALFORMED_RESPONSE_MESSAGE`; non-204 S3 responses use `GENERIC_UPLOAD_ERROR`.

- [x] **Step 6: Write and run API status tests**

Test `400`, `401`, `409`, `413`, `429`, and `503` from upload-intent. Assert the fixed message, assert no S3 request, and for `401` assert the `/auth` link appears.

Test representative `400`, `409`, `429`, and `503` confirmation responses after a valid intent and S3 204. Assert no success message and no response-body error is rendered.

Run:

```bash
npx vitest run app/profile/avatar-upload-control.test.tsx -t "response|session|status"
```

Expected: PASS with fixed user-facing messages and no success state.

- [x] **Step 7: Cover cancellation during S3 and confirmation**

Add a test that resolves upload-intent, leaves the S3 request pending, captures
its `AbortSignal`, unmounts the component, and asserts the signal becomes
aborted. Add the corresponding confirmation-stage test by resolving S3 with
204 and leaving confirm pending. These tests prove the same controller remains
active across all three requests.

- [x] **Step 8: Add the sensitive-data leakage test**

Spy on all console methods and use recognizable secrets:

```ts
const sensitiveValues = [
  "signed-policy",
  "signed-value",
  "staging/users/user-1/avatar.png",
  "raw-aws-error"
];
const consoleSpies = [
  vi.spyOn(console, "log").mockImplementation(() => undefined),
  vi.spyOn(console, "info").mockImplementation(() => undefined),
  vi.spyOn(console, "warn").mockImplementation(() => undefined),
  vi.spyOn(console, "error").mockImplementation(() => undefined)
];
```

After a failed upload sequence, combine `document.body.textContent` with the serialized console spy arguments and assert none of the sensitive values occur. Restore spies after the assertion.

- [x] **Step 9: Run the complete focused regression suite**

Run:

```bash
npx vitest run app/profile/avatar-upload-control.test.tsx app/api/profile/avatar/upload-intent/route.test.ts app/api/profile/avatar/confirm/route.test.ts
```

Expected: all component and backend contract tests pass.

- [x] **Step 10: Run lint and production build**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands exit successfully without TypeScript, ESLint, or Next.js build errors.

- [x] **Step 11: Inspect the final scope**

Run:

```bash
git diff --check
git status --short
git diff -- app/profile/avatar-upload-control.tsx app/profile/avatar-upload-control.test.tsx
```

Expected: the implementation changes only the avatar component and its component tests; the committed design and plan documents are the only documentation changes.
