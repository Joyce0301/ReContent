# Avatar Lambda Processor Design

## Goal

Process confirmed private avatar originals with an S3-triggered Lambda. The
function converts each accepted image into one deterministic 512 x 512 WebP
object. The existing browser upload and confirmation flow remains intact. A
small recovery guard is added so an `uploaded` avatar can be replaced after a
24-hour cooldown rather than stranding the account.

The processing flow is:

```text
S3 ObjectCreated
original/confirmed/{userId}/{uploadId}.{jpg|png|webp}
        |
        v
Avatar Processor Lambda
        |
        v
processed/ready/{userId}/{uploadId}-{sourceExtension}.webp
```

## Delivery Split

Codex delivers:

- the Lambda handler and focused image-processing units
- unit and integration-style tests with local image fixtures
- a reproducible ZIP build command for the Lambda `x86_64` architecture
- deployment documentation containing the exact console values and
  verification commands

The user configures in the AWS Console, with step-by-step guidance:

- the SQS dead-letter queue
- an email-backed CloudWatch alarm for non-empty DLQ messages
- the Lambda execution role and least-privilege policy
- the Lambda function and ZIP upload
- Lambda asynchronous failure handling
- the S3 event notification
- the S3 lifecycle rule

Terraform and automatic AWS resource creation are intentionally excluded from
this phase.

## Event Contract

The function accepts native Amazon S3 `ObjectCreated` event records.

An S3 notification configuration can emit a top-level `s3:TestEvent`. The
handler recognizes this shape, logs a safe `test_event_ignored` result, and
returns success without trying to process an object.

For a normal event, the handler requires:

- a non-empty `Records` array
- `eventSource` equal to `aws:s3`
- `eventName` beginning with `ObjectCreated:`
- string bucket and object-key fields

For every record, it:

1. requires the event bucket to equal the configured `AVATAR_S3_BUCKET`
2. decodes the S3 object key, including `+` encoded spaces
3. ignores records outside `original/confirmed/`
4. strictly accepts keys shaped as
   `original/confirmed/{userId}/{uploadId}.{jpg|png|webp}`
5. requires `userId` and `uploadId` to contain only ASCII letters, digits,
   underscores, or hyphens
6. derives the output key as
   `processed/ready/{userId}/{uploadId}-{sourceExtension}.webp`

A malformed key under `original/confirmed/` is a processing failure, not a
silent skip. A record for the wrong bucket is a configuration or security
failure. Malformed event fields and invalid percent encoding are also
processing failures with stable error codes.

An event can contain multiple records. Records are processed sequentially to
keep memory use bounded. A failed record does not prevent later records in the
same event from being attempted. After all records have been visited, the
handler throws one aggregate failure if any record failed. Already completed
records remain safely written, and a retried event is safe because every
source key maps to a deterministic destination key.

## Image Contract

The Lambda reads at most 5 MiB from the confirmed source object and decodes the
actual image rather than trusting only the key extension or S3 content type.

Accepted decoded formats are JPEG, PNG, and WebP. Animated or multi-page images
are rejected. The decoder limits input to 40 million pixels to reduce
decompression-bomb risk.

The transformation is fixed:

- apply the embedded image orientation
- resize to exactly 512 x 512
- use `cover` with center positioning
- encode as WebP
- quality 80
- remove EXIF and other source metadata
- preserve transparency when present

The destination object uses:

- `Content-Type: image/webp`
- `Cache-Control: private, max-age=31536000, immutable`
- the bucket's default SSE-S3 encryption (`AES256`)

The processor does not promise that every output is smaller than every input;
dimensions, format, and predictable delivery are the acceptance contract.

## Idempotency

The output key is deterministic and unique to the upload ID. Repeated delivery
of the same S3 event writes the same WebP bytes to the same destination key.
Overwriting that key is allowed.

Including the source extension prevents two manually corrupted source keys
such as the same upload ID with `.jpg` and `.png` from racing to overwrite one
output. Writing under `processed/ready/` cannot recursively trigger the function
because the S3 notification is filtered to the exact
`original/confirmed/` prefix.

This phase does not delete the source object. A separate lifecycle rule expires
objects under `original/confirmed/` after 30 days so a recent original remains
available for debugging or reprocessing.

## Failure Handling

The handler returns success only when the event is an S3 test event, or every
applicable record has either been processed or safely ignored because it is
outside the source prefix.

Failures include:

- bucket mismatch
- malformed confirmed key
- missing or unreadable object
- source object larger than 5 MiB
- unsupported, animated, corrupt, or oversized-pixel image
- S3 read or write failure

The invocation throws stable error codes without including raw image bytes,
presigned fields, credentials, or raw AWS response bodies. Lambda asynchronous
invocation is configured with:

- maximum event age: 21,600 seconds (6 hours)
- retry attempts: 2
- on-failure destination: a dedicated encrypted standard SQS queue

The SQS queue is named and operated as the avatar processor DLQ. An on-failure
destination is used instead of a classic Lambda `DeadLetterConfig` so the
message retains invocation and failure context. Its message body is a Lambda
destination envelope; the original native S3 event is the JSON value at
`requestPayload`. The DLQ has no automatic consumer in this phase. It preserves
failed events for manual inspection and redrive for 14 days.

### Operational Recovery

The existing application marks a confirmed avatar as `uploaded`. The profile
control already permits selecting a replacement file, while the upload API
enforces reservation eligibility. The reservation read and conditional update
are changed so `uploaded` remains locked for 24 hours, then becomes eligible
for replacement. Both paths apply the same 24-hour rule atomically. This is a
bounded recovery guard for failures before invocation, destination-delivery
failures, or missed operator alerts; it does not mark an avatar `ready`.

Both `getAvatarUploadState` and `reserveAvatarUpload` add this exact eligibility
branch alongside their existing branches:

```sql
avatar_status = 'uploaded'
AND avatar_updated_at IS NOT NULL
AND avatar_updated_at <= UTC_TIMESTAMP() - INTERVAL 24 HOUR
```

The reservation update still matches the user ID and changes the row
atomically, so two concurrent replacement attempts cannot both reserve it.

A CloudWatch alarm enters `ALARM` when
`ApproximateNumberOfMessagesVisible >= 1` for one five-minute period and sends
an email through an SNS topic. The same SNS topic receives Lambda alarms for
`Errors`, `AsyncEventsDropped`, and `DestinationDeliveryFailures`. Missing data
is treated as not breaching.

The runbook for each DLQ message is:

1. inspect the stable error code and the retained S3 event without downloading
   the image to an operator workstation unless needed
2. while the original exists, correct transient configuration or code issues
   and extract only `requestPayload` from the destination envelope
3. asynchronously invoke the Lambda with that native S3 event, never with the
   whole SQS message or destination envelope
4. verify the deterministic object exists under `processed/ready/`
5. delete the SQS message only after the output has been verified
6. if the object cannot be processed, conditionally change only the matching
   user row from `uploaded` to `failed`, which permits a replacement upload

The deployment runbook includes these exact redrive commands:

```bash
aws sqs receive-message \
  --queue-url "$AVATAR_DLQ_URL" \
  --max-number-of-messages 1 \
  --visibility-timeout 300 \
  --output json > /tmp/avatar-dlq-message.json

jq '.Messages[0].Body | fromjson | .requestPayload' \
  /tmp/avatar-dlq-message.json > /tmp/avatar-s3-event.json

aws lambda invoke \
  --function-name "$AVATAR_LAMBDA_FUNCTION" \
  --invocation-type Event \
  --cli-binary-format raw-in-base64-out \
  --payload fileb:///tmp/avatar-s3-event.json \
  /tmp/avatar-redrive-result.json
```

After the ready object is verified, the message is deleted using its receipt
handle:

```bash
aws sqs delete-message \
  --queue-url "$AVATAR_DLQ_URL" \
  --receipt-handle "$AVATAR_DLQ_RECEIPT_HANDLE"
```

The documented inspection step shows how to copy the receipt handle from
`/tmp/avatar-dlq-message.json` without logging it.

The fallback SQL is documented with placeholders and must match both the user
ID and `avatar_key`; it never updates every uploaded user:

```sql
UPDATE users
SET avatar_status = 'failed',
    avatar_updated_at = UTC_TIMESTAMP()
WHERE id = :user_id
  AND avatar_key = :confirmed_avatar_key
  AND avatar_status = 'uploaded';
```

The operator must confirm exactly one affected row. Zero rows means the state
has already changed or the identifiers are wrong; more than one row is treated
as a schema or query error. The 30-day source retention is longer than the
14-day DLQ retention, but the alarm and runbook remain mandatory because
retention is not a substitute for incident response.

## Logging

CloudWatch receives one structured log entry per processing stage. Logs may
include:

- Lambda request ID
- stable processing stage
- stable result or error code
- record count
- upload ID

Logs must not contain:

- image bytes
- user email or display name
- AWS credentials, signatures, policies, or security tokens
- presigned form fields
- raw S3 or AWS error bodies

The full object key is not required in logs because the DLQ event retains the
original record under restricted access.

## AWS Resource Contract

### Lambda

- runtime: `nodejs24.x` on Amazon Linux 2023
- architecture: `x86_64`
- memory: 1024 MB
- timeout: 30 seconds
- environment variable:
  `AVATAR_S3_BUCKET=<existing private avatar bucket name>`
- deployment: repository-built ZIP containing the handler and Linux-compatible
  `sharp` runtime dependency

The package includes the AWS SDK clients it uses rather than relying on the
runtime-bundled SDK.

The ZIP is built for `linux/x64` with glibc using the pinned
`public.ecr.aws/lambda/nodejs:24` build environment. The build hard-fails unless
a Linux x64 smoke test can load `sharp`. The checked-in lockfile pins all
production dependencies; the generated ZIP is not committed.

### Execution Role

The role receives only:

- `s3:GetObject` for
  `arn:aws:s3:::<bucket>/original/confirmed/*`
- `s3:PutObject` for
  `arn:aws:s3:::<bucket>/processed/ready/*`
- `sqs:SendMessage` for the dedicated DLQ
- standard CloudWatch Logs write permissions

The role does not receive Aurora, RDS, Secrets Manager, S3 delete, or
bucket-wide object permissions.

### S3 Notification

- event type: all object-created events
- prefix: `original/confirmed/`
- suffix: none, because the source contract supports three extensions
- destination: Avatar Processor Lambda

The console-created Lambda resource policy permits only the selected bucket to
invoke the function.

### S3 Lifecycle

- scope prefix: `original/confirmed/`
- expire current objects after 30 days
- if bucket versioning is enabled or suspended, expire noncurrent
  confirmed-original versions after 30 days and remove expired delete markers
- no lifecycle action for `processed/ready/` in this phase

### SQS DLQ

- dedicated standard queue
- Lambda asynchronous `OnFailure` destination, not an event-source redrive
  queue and not a classic Lambda `DeadLetterConfig`
- server-side encryption uses the Amazon SQS managed key (SSE-SQS), not KMS
- access limited to the Lambda execution role and operators
- message retention: 14 days
- no automatic consumer or redrive in this phase

### CloudWatch Alarm

- metrics:
  - SQS `ApproximateNumberOfMessagesVisible`
  - Lambda `Errors`
  - Lambda `AsyncEventsDropped`
  - Lambda `DestinationDeliveryFailures`
- threshold: greater than or equal to 1 for each alarm
- period: 5 minutes
- datapoints to alarm: 1 of 1
- missing data: not breaching
- action: an email-backed SNS topic confirmed by the operator

The alarms make processing and delivery failures visible. The 24-hour
application recovery guard separately prevents permanent account stranding if
an event is never invoked and therefore emits no Lambda metric.

### Configuration Verification

Codex provides a read-only AWS CLI verifier implemented as plain Node.js ESM,
so it requires no TypeScript runner. The operator supplies its inputs through
documented environment variables and runs:

```bash
npm run verify:avatar-lambda
```

`package.json` maps that command to
`node scripts/verify-avatar-lambda-prerequisites.mjs`. The verifier fails unless
it can confirm:

- Lambda runtime, architecture, memory, timeout, handler, and bucket environment
  variable
- the execution role's required scoped S3 and SQS actions
- the execution role trust policy permits only the Lambda service
- bucket default encryption is SSE-S3 (`AES256`), avoiding implicit KMS
  permissions
- the S3 notification event and exact `original/confirmed/` prefix
- no overlapping avatar notifications or bucket-wide EventBridge delivery
- the Lambda resource policy restricted by bucket ARN and account
- asynchronous retry count, maximum age, and SQS on-failure destination
- SQS standard type, SSE-SQS encryption, and 14-day retention
- no queue redrive policy and no Lambda event-source mapping consuming the DLQ
- the 30-day current-version lifecycle rule and, when versioning is enabled or
  suspended, noncurrent-version and delete-marker handling
- all SQS and Lambda alarm thresholds, periods, missing-data behavior, and
  actions

The verifier prints no secret values and performs no resource mutation. A
passing verifier is a deployment gate, not optional documentation.

## Code Structure

The implementation keeps Lambda-specific dependencies out of the Next.js
runtime:

```text
lambda/avatar-processor/
  package.json
  package-lock.json
  scripts/
    build-zip.sh
    smoke-linux.sh
  src/
    event-record.ts
    image-transform.ts
    handler.ts
  test/
    event-record.test.ts
    image-transform.test.ts
    handler.test.ts
  fixtures/
    avatar.jpg
    avatar.png
    avatar.webp
scripts/
  verify-avatar-lambda-prerequisites.mjs
  verify-avatar-lambda-prerequisites.test.ts
```

Responsibilities:

- `event-record.ts` validates and maps S3 records to source and destination
  keys without calling AWS
- `image-transform.ts` validates decoded metadata and returns the fixed WebP
  output without calling AWS
- `handler.ts` coordinates S3 reads, transformation, writes, logging, and
  invocation failure
- the existing user-store reservation read and atomic update permit a
  replacement upload only after an `uploaded` state is 24 hours old

The ZIP build output is generated and git-ignored. Source, lockfile, tests, and
build scripts are committed.

## Testing

Local automated tests cover:

- URL-decoded valid keys and deterministic output keys
- a contract-parity test proving keys emitted by the existing
  `createAvatarObjectKeys` helper are accepted and mapped by the Lambda parser
- records outside the source prefix being ignored
- wrong bucket and malformed confirmed keys failing
- JPEG, PNG, and WebP fixtures producing 512 x 512 WebP
- orientation handling and metadata removal
- animated, corrupt, over-5-MiB, and over-pixel-limit inputs failing
- every destination put using the exact output key and content headers
- non-204 concepts are irrelevant inside Lambda; S3 SDK failures instead cause
  invocation failure
- multi-record processing and deterministic replay
- an invalid first record not preventing a valid later record from being
  written before the aggregate failure
- explicit successful handling of the S3 test event
- malformed event envelopes and invalid key encoding failing safely
- logs excluding credentials, raw AWS errors, user data, and full object keys
- the AWS verifier accepting a complete fixture and rejecting each missing or
  unsafe configuration
- the Linux x64 package smoke test loading `sharp`
- fresh `uploaded` state remaining locked and 24-hour-old `uploaded` state
  becoming atomically replaceable through the upload API

The existing avatar upload and confirmation suites must continue to pass, with
focused cases added for the 24-hour replacement guard.

## Manual Acceptance

After the code ZIP and AWS resources are ready:

1. Upload and confirm one JPEG, one PNG, and one WebP through ReContent.
2. Confirm Lambda invocation in CloudWatch.
3. Confirm each source under `original/confirmed/` produces
   `processed/ready/{userId}/{uploadId}-{sourceExtension}.webp`.
4. Download each output and verify WebP format and 512 x 512 dimensions.
5. Confirm `avatar_status` remains `uploaded`.
6. Put a deliberately corrupt object under a test confirmed key.
7. Confirm the failed event reaches the SQS DLQ after asynchronous retries.
8. Confirm the CloudWatch alarm enters `ALARM` and the subscribed email arrives.
9. Extract `requestPayload`, redrive the retained S3 event, verify the ready
   object, and only then delete the DLQ message.
10. Confirm creating an object under `processed/ready/` does not invoke the
    Lambda.
11. Run the read-only AWS verifier and require a passing result.
12. In a non-production test row, confirm a fresh `uploaded` avatar remains
    locked and a 24-hour-old one can reserve a replacement upload.

## Out Of Scope

- updating Aurora from Lambda
- changing `avatar_status` from `uploaded` to `ready`
- displaying processed avatars in the profile or header
- CloudFront or public delivery URLs
- DLQ consumers or automated redrive
- multiple output sizes
- face detection or smart crop
- Terraform, CDK, SAM, or automatic AWS resource provisioning

## References

- [AWS Lambda supported runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html)
- [AWS Lambda asynchronous error handling](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-configuring.html)
- [Amazon SQS managed encryption](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-configure-sqs-sse-queue.html)
- [sharp installation for AWS Lambda](https://sharp.pixelplumbing.com/install/#aws-lambda)
