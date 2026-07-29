# Avatar Lambda Processor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert confirmed private avatar originals into deterministic 512 x
512 WebP objects with an S3-triggered Lambda, while preserving a safe
replacement path and providing verifiable manual AWS configuration.

**Architecture:** Keep the Lambda in an isolated package so `sharp` and Lambda
SDK dependencies never enter the Next.js runtime. Parse and validate native S3
events in a pure module, transform bounded image buffers in a second module,
and inject S3/logging dependencies into the handler for focused tests. Extend
the existing reservation state machine with an atomic 24-hour replacement
cooldown, then verify all manually configured AWS resources with a read-only
CLI.

**Tech Stack:** Node.js 24, TypeScript, AWS SDK v3, sharp, esbuild, Docker,
Vitest, Next.js 16, React 19, MySQL 8, AWS CLI.

## Global Constraints

- Lambda runtime is `nodejs24.x`, architecture is `x86_64`, memory is 1024 MB,
  and timeout is 30 seconds.
- Input keys are
  `original/confirmed/{userId}/{uploadId}.{jpg|png|webp}`.
- Output keys are
  `processed/ready/{userId}/{uploadId}-{sourceExtension}.webp` so malformed
  cross-extension source collisions cannot overwrite each other.
- Inputs are at most 5 MiB and 40 million decoded pixels.
- Output is one 512 x 512 center-cover WebP at quality 80.
- Source metadata is stripped and transparency is preserved.
- S3 test events succeed without object processing.
- Multi-record events attempt every record and aggregate failures afterward.
- Logs never include full object keys, image bytes, credentials, raw AWS
  errors, presigned fields, emails, or display names.
- Confirmed originals expire after 30 days; the SQS failure queue retains
  messages for 14 days using SSE-SQS.
- Lambda async invocation uses a six-hour maximum age, two retries, and an SQS
  `OnFailure` destination.
- `uploaded` rows remain locked for 24 hours, then become atomically eligible
  for a replacement upload.
- Lambda does not connect to Aurora or change avatar state to `ready`.
- AWS resources are configured manually by the user; repository automation is
  read-only.

---

### Task 1: Add the 24-hour replacement guard

**Files:**
- Modify: `app/lib/auth/user-store.ts`
- Modify: `app/lib/auth/user-store.test.ts`

**Interfaces:**
- Consumes: `AvatarUploadState.reservationEligible`
- Produces: identical SQL eligibility in `getAvatarUploadState` and
  `reserveAvatarUpload`

- [ ] **Step 1: Write failing database eligibility tests**

Add expectations proving both SQL statements contain:

```sql
avatar_status = 'uploaded'
AND avatar_updated_at IS NOT NULL
AND avatar_updated_at <= UTC_TIMESTAMP() - INTERVAL 24 HOUR
```

Add table cases where a fresh `uploaded` row returns
`reservationEligible: false` and a 24-hour-old row returned by MySQL returns
`reservationEligible: true`.

- [ ] **Step 2: Run the focused user-store tests and verify RED**

Run:

```bash
npx vitest run app/lib/auth/user-store.test.ts
```

Expected: FAIL because the current read and update predicates only admit
`not_uploaded`, `failed`, and stale `pending_upload`.

- [ ] **Step 3: Implement the identical read and update predicates**

Add the exact branch to both SQL conditions:

```sql
OR (
  avatar_status = 'uploaded'
  AND avatar_updated_at IS NOT NULL
  AND avatar_updated_at <= UTC_TIMESTAMP() - INTERVAL 24 HOUR
)
```

- [ ] **Step 4: Run Task 1 tests and verify GREEN**

Run:

```bash
npx vitest run app/lib/auth/user-store.test.ts app/api/profile/avatar/upload-intent/route.test.ts
```

Expected: PASS.

---

### Task 2: Create the Lambda package and pure event parser

**Files:**
- Create: `lambda/avatar-processor/package.json`
- Create: `lambda/avatar-processor/package-lock.json`
- Create: `lambda/avatar-processor/tsconfig.json`
- Create: `lambda/avatar-processor/src/errors.ts`
- Create: `lambda/avatar-processor/src/event-record.ts`
- Create: `lambda/avatar-processor/test/event-record.test.ts`

**Interfaces:**
- Produces:

```ts
type AvatarObjectJob = {
  sourceKey: string;
  destinationKey: string;
  userId: string;
  uploadId: string;
};

type ParsedAvatarEvent =
  | { kind: "test-event" }
  | { kind: "records"; records: unknown[] };

function parseAvatarEvent(event: unknown): ParsedAvatarEvent;
function parseAvatarRecord(
  record: unknown,
  expectedBucket: string
): AvatarObjectJob | null;
```

- Produces:

```ts
class AvatarProcessorError extends Error {
  readonly code: string;
}
```

- [ ] **Step 1: Scaffold only the package manifest and test command**

Use ESM, pin `@aws-sdk/client-s3`, `sharp`, `esbuild`, TypeScript, Vitest, and
Lambda type definitions in the package lockfile. Do not create production
parser code yet.

- [ ] **Step 2: Write failing event-contract tests**

Cover S3 `s3:TestEvent`, empty/malformed `Records`, wrong `eventSource`, non
`ObjectCreated:` names, bucket mismatch, invalid percent encoding, malformed
confirmed keys, ignored non-confirmed prefixes, `+` decoding, safe segments,
all three extensions, and deterministic destination keys.

- [ ] **Step 3: Run parser tests and verify RED**

Run:

```bash
npm --prefix lambda/avatar-processor test -- --run test/event-record.test.ts
```

Expected: FAIL because `errors.ts` and `event-record.ts` do not exist.

- [ ] **Step 4: Implement the minimal parser**

Use `decodeURIComponent(encodedKey.replaceAll("+", " "))`, a strict four-part
key parser, and stable codes such as `INVALID_EVENT`, `WRONG_BUCKET`,
`INVALID_OBJECT_KEY`, and `INVALID_OBJECT_KEY_ENCODING`. Return `null` only for
well-formed records outside `original/confirmed/`.

- [ ] **Step 5: Add the app/Lambda key contract test**

Generate confirmed keys with `createAvatarObjectKeys` and prove
`parseAvatarRecord` maps them to the expected ready key.

- [ ] **Step 6: Run Task 2 tests and verify GREEN**

Run:

```bash
npm --prefix lambda/avatar-processor test -- --run test/event-record.test.ts
```

Expected: PASS.

---

### Task 3: Implement bounded image transformation

**Files:**
- Create: `lambda/avatar-processor/src/image-transform.ts`
- Create: `lambda/avatar-processor/test/image-transform.test.ts`
- Create: `lambda/avatar-processor/fixtures/avatar.jpg`
- Create: `lambda/avatar-processor/fixtures/avatar.png`
- Create: `lambda/avatar-processor/fixtures/avatar.webp`

**Interfaces:**
- Produces:

```ts
const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;

async function transformAvatar(input: Uint8Array): Promise<Buffer>;
```

- [ ] **Step 1: Generate small deterministic local fixtures**

Generate one JPEG, PNG with transparency, and WebP fixture using `sharp`.
Fixtures contain no user data and are committed.

- [ ] **Step 2: Write failing transformation tests**

Assert output metadata is WebP, exactly 512 x 512, one page, stripped of source
metadata, and transparent where the PNG source is transparent. Assert JPEG,
PNG, and WebP acceptance plus failures for over-5-MiB, corrupt, unsupported,
animated/multi-page, and over-40-million-pixel inputs.

- [ ] **Step 3: Run transformation tests and verify RED**

Run:

```bash
npm --prefix lambda/avatar-processor test -- --run test/image-transform.test.ts
```

Expected: FAIL because `transformAvatar` does not exist.

- [ ] **Step 4: Implement the fixed sharp pipeline**

Create `sharp(input, { animated: true, failOn: "error",
limitInputPixels: 40_000_000 })`, validate metadata format/pages, then call:

```ts
rotate()
  .resize(512, 512, { fit: "cover", position: "centre" })
  .webp({ quality: 80 })
  .toBuffer()
```

Do not call any metadata-preservation API.

- [ ] **Step 5: Run Task 3 tests and verify GREEN**

Run:

```bash
npm --prefix lambda/avatar-processor test -- --run test/image-transform.test.ts
```

Expected: PASS.

---

### Task 4: Coordinate S3 processing in the Lambda handler

**Files:**
- Create: `lambda/avatar-processor/src/handler.ts`
- Create: `lambda/avatar-processor/test/handler.test.ts`

**Interfaces:**
- Consumes: `parseAvatarEvent`, `parseAvatarRecord`, `transformAvatar`
- Produces:

```ts
type HandlerDependencies = {
  s3: Pick<S3Client, "send">;
  transform: typeof transformAvatar;
  log: (entry: Record<string, unknown>) => void;
};

function createHandler(dependencies: HandlerDependencies): Handler;
const handler: Handler;
```

- [ ] **Step 1: Write failing handler tests**

Cover test-event success, ignored records, GetObject/PutObject commands,
`ContentType: "image/webp"`, immutable private cache control, exact output key,
ContentLength and actual body size limits, missing body, S3 failures, transform
failures, deterministic replay, and structured safe logs.

Add a multi-record test where the first record fails and the later record is
still written before a final `BATCH_PROCESSING_FAILED` error is thrown.

- [ ] **Step 2: Run handler tests and verify RED**

Run:

```bash
npm --prefix lambda/avatar-processor test -- --run test/handler.test.ts
```

Expected: FAIL because `handler.ts` does not exist.

- [ ] **Step 3: Implement dependency-injected orchestration**

Read `AVATAR_S3_BUCKET` once per invocation, process records sequentially,
convert `Body.transformToByteArray()` to a bounded buffer, write the fixed
headers, collect stable per-record errors, and throw one safe aggregate error
after all records have been attempted.

- [ ] **Step 4: Prove logs are safe**

Assert serialized log entries contain request ID, stage, result/error code,
record count, and upload ID where available, but do not contain source keys,
AWS raw error messages, credentials, signatures, emails, or image bytes.

- [ ] **Step 5: Run all Lambda tests and verify GREEN**

Run:

```bash
npm --prefix lambda/avatar-processor test -- --run
```

Expected: PASS.

---

### Task 5: Build a Linux x64 Lambda ZIP reproducibly

**Files:**
- Create: `lambda/avatar-processor/scripts/build-zip.sh`
- Create: `lambda/avatar-processor/scripts/smoke-linux.sh`
- Create: `lambda/avatar-processor/test/build-scripts.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `lambda/avatar-processor/dist/avatar-processor.zip`
- Produces Lambda handler name: `index.handler`

- [ ] **Step 1: Write failing build-contract tests**

Assert the build scripts pin `public.ecr.aws/lambda/nodejs:24`,
`linux/amd64`, Linux x64 glibc `sharp`, externalize `sharp` from esbuild,
smoke-import `sharp`, package `index.mjs` and production `node_modules`, and
place output only under ignored `dist/`.

- [ ] **Step 2: Run build-contract tests and verify RED**

Run:

```bash
npm --prefix lambda/avatar-processor test -- --run test/build-scripts.test.ts
```

Expected: FAIL because the scripts do not exist.

- [ ] **Step 3: Implement isolated build scripts**

Bundle the handler and AWS SDK client with esbuild, install production
dependencies in a temporary Docker-mounted directory, run the Linux smoke
test, zip only deployment files, and clean temporary files through a shell
trap.

- [ ] **Step 4: Run static tests and the real ZIP build**

Run:

```bash
npm --prefix lambda/avatar-processor test -- --run test/build-scripts.test.ts
npm --prefix lambda/avatar-processor run build:zip
```

Expected: tests PASS, Docker smoke PASS, and the ZIP exists without becoming a
Git-tracked file.

---

### Task 6: Add the read-only AWS configuration verifier

**Files:**
- Create: `scripts/verify-avatar-lambda-prerequisites.mjs`
- Create: `scripts/verify-avatar-lambda-prerequisites.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes required environment:

```text
AWS_REGION
AVATAR_LAMBDA_FUNCTION
AVATAR_LAMBDA_ROLE_NAME
AVATAR_LAMBDA_POLICY_NAME
AVATAR_S3_BUCKET
AVATAR_DLQ_URL
AVATAR_DLQ_ARN
AVATAR_ALARM_TOPIC_ARN
```

- Produces command: `npm run verify:avatar-lambda`

- [ ] **Step 1: Write failing pure-validator tests**

Create valid AWS response fixtures and reject wrong runtime, architecture,
memory, timeout, handler, bucket variable, broad or missing IAM grants,
SSE-KMS/missing encryption, wrong S3 prefix/event, broad Lambda invoke policy,
wrong async retry/age/destination, FIFO or unencrypted/short-retention queue,
missing version-aware lifecycle, and incomplete alarms.

- [ ] **Step 2: Run verifier tests and verify RED**

Run:

```bash
npx vitest run scripts/verify-avatar-lambda-prerequisites.test.ts
```

Expected: FAIL because the verifier module does not exist.

- [ ] **Step 3: Implement pure validators and an AWS CLI executor**

Follow the fail-closed patterns in
`scripts/verify-avatar-s3-prerequisites.mjs`. Use `execFile("aws", args)`,
parse JSON strictly, inspect effective IAM permissions, and print only a
single safe pass/fail summary.

- [ ] **Step 4: Add the package command and CLI orchestration**

Map:

```json
"verify:avatar-lambda": "node scripts/verify-avatar-lambda-prerequisites.mjs"
```

Call only read APIs for Lambda, IAM, S3, SQS, and CloudWatch. Do not create,
update, invoke, receive, or delete AWS resources.

- [ ] **Step 5: Run verifier tests and verify GREEN**

Run:

```bash
npx vitest run scripts/verify-avatar-lambda-prerequisites.test.ts
```

Expected: PASS.

---

### Task 7: Document deployment, AWS Console configuration, and recovery

**Files:**
- Create: `docs/auth/avatar-lambda-deployment.md`
- Modify: `README.md`

**Interfaces:**
- Documents ZIP build and handler `index.handler`
- Documents manual order: SQS -> SNS/alarms -> IAM -> Lambda -> async
  destination -> S3 notification/lifecycle -> verifier -> smoke test
- Documents `requestPayload` extraction and conditional recovery SQL

- [ ] **Step 1: Write the exact operator guide**

For every console step, state its purpose before the clicks and provide the
exact value from the design. Include the SQS destination-envelope redrive
commands, delete-after-verification rule, alarm test, lifecycle/versioning
branch, SSE-S3 requirement, and safe SQL fallback.

- [ ] **Step 2: Add a concise README link**

Describe the avatar pipeline as
`browser -> S3 confirmed original -> Lambda -> processed WebP`, link the
operator guide, and state that ready-state/UI delivery is the next phase.

- [ ] **Step 3: Validate documentation consistency**

Run:

```bash
git diff --check
rg -n "nodejs24.x|512 x 512|quality 80|21,600|14 days|30 days|requestPayload|24 HOUR" docs README.md
```

Expected: every pinned contract is present and no placeholder exists.

---

### Task 8: Complete independent review and full verification

**Files:**
- Review all files changed by Tasks 1-7

- [ ] **Step 1: Run focused and regression tests**

Run:

```bash
npm --prefix lambda/avatar-processor test -- --run
npx vitest run scripts/verify-avatar-lambda-prerequisites.test.ts
npx vitest run app/lib/auth/user-store.test.ts app/profile/profile-view.test.tsx app/profile/avatar-upload-control.test.tsx app/api/profile/avatar/upload-intent/route.test.ts app/api/profile/avatar/confirm/route.test.ts app/lib/avatar/*.test.ts
npx vitest run app/api/repurpose/*.test.ts
npm run lint
npm run build
```

Expected: all commands PASS.

- [ ] **Step 2: Run independent code review**

The reviewer checks bugs, regressions, test gaps, unsafe logs, IAM scope,
package deployability, and documentation/config drift. Fix every required
finding.

- [ ] **Step 3: Run independent adversarial review**

The reviewer attacks malformed events, decompression bombs, batch partial
failure, duplicate delivery, missing invocation, destination failure,
concurrent replacement, Linux native dependencies, and AWS configuration
drift. Fix every high-risk finding.

- [ ] **Step 4: Re-run all verification after fixes**

Repeat Step 1 and require all commands to pass after review fixes.

- [ ] **Step 5: Commit, push, and create the PR**

Stage only this feature's files, commit on
`codex/avatar-lambda-processor`, push the branch, create a PR with risks and
verification, and observe the repository's automatic checks before reporting
completion.
