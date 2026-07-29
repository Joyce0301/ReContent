# Avatar Lambda Deployment Runbook

This runbook deploys the avatar processor manually in the AWS Console. Every
step starts with its purpose so the configuration can be understood and
reviewed instead of copied blindly.

## Resulting Flow

```text
ECS confirms upload
  -> S3 original/confirmed/<user>/<upload>.<ext>
  -> S3 asynchronously invokes Lambda
  -> Lambda validates, rotates, crops and converts to 512 x 512 WebP
  -> S3 processed/ready/<user>/<upload>-<source-extension>.webp

Permanent processing failure
  -> SQS on-failure destination
  -> CloudWatch alarm
  -> SNS email
```

This release intentionally does not update Aurora and does not change
`avatar_status` to `ready`. The existing application keeps the state as
`uploaded`; displaying the processed avatar is a later release.

## Fixed Resource Contract

Use one AWS account and `us-east-1` for all regional resources.

| Resource | Value |
| --- | --- |
| Lambda | `recontent-avatar-processor` |
| Runtime | Node.js 24.x, `x86_64` |
| IAM role | `recontent-avatar-processor-role` |
| Inline policy | `recontent-avatar-processor-access` |
| SQS queue | `recontent-avatar-processor-dlq` |
| SNS topic | `recontent-avatar-processor-alerts` |
| S3 source prefix | `original/confirmed/` |
| S3 output prefix | `processed/ready/` |

Replace `<account-id>`, `<bucket>` and `<email>` below with the production
values. Keep the prefixes exact, including their trailing `/`.

## 1. Build The Lambda ZIP

**Purpose:** compile the handler and package the native `sharp` dependency
inside the same Amazon Linux 2023 environment used by Lambda. A ZIP built only
on macOS can load locally and still fail on Lambda.

Requirements:

- Docker or Colima is running
- the host can pull `public.ecr.aws/lambda/nodejs:24`
- the host has `zip` and `unzip` installed

Run:

```bash
cd lambda/avatar-processor
npm ci
npm test
npm run typecheck
npm run build:zip
unzip -t dist/avatar-processor.zip
```

Expected artifact:

```text
lambda/avatar-processor/dist/avatar-processor.zip
```

Do not commit the ZIP. The build runs a Linux `x86_64` smoke test before
creating it.

## 2. Create The SQS Failure Queue

**Purpose:** retain a failed asynchronous invocation after Lambda exhausts its
retries. Without this queue, a permanently failed S3 event can be lost.

In **Amazon SQS -> Create queue**:

1. Type: `Standard`
2. Name: `recontent-avatar-processor-dlq`
3. Visibility timeout: keep the default; this queue has no automatic consumer
4. Message retention period: `14 days`
5. Encryption: enable server-side encryption
6. Encryption key type: `Amazon SQS key (SSE-SQS)`
7. Create the queue

Record:

- queue URL
- queue ARN

Do not configure a redrive policy or attach this queue as a Lambda event
source. It is an asynchronous **on-failure destination**, not a consumer queue.
The read-only preflight verifies both conditions.

## 3. Create The SNS Alert Topic

**Purpose:** send an operator email when processing or failure delivery breaks.
The queue preserves the event; the email makes sure somebody notices it.

In **Amazon SNS -> Topics -> Create topic**:

1. Type: `Standard`
2. Name: `recontent-avatar-processor-alerts`
3. Create the topic
4. Open the topic and choose **Create subscription**
5. Protocol: `Email`
6. Endpoint: `<email>`
7. Create the subscription
8. Open the AWS confirmation email and confirm the subscription

The subscription must show a real subscription ARN, not
`PendingConfirmation`.

## 4. Create The Lambda Execution Role

**Purpose:** give the processor only the three data-plane permissions it needs:
read confirmed originals, write deterministic processed images, and send
failed invocation records to SQS.

In **IAM -> Roles -> Create role**:

1. Trusted entity type: `AWS service`
2. Use case: `Lambda`
3. Attach `AWSLambdaBasicExecutionRole`
4. Role name: `recontent-avatar-processor-role`
5. Create the role

Open the role, choose **Add permissions -> Create inline policy -> JSON**, and
use:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::<bucket>/original/confirmed/*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::<bucket>/processed/ready/*"
    },
    {
      "Effect": "Allow",
      "Action": "sqs:SendMessage",
      "Resource": "arn:aws:sqs:us-east-1:<account-id>:recontent-avatar-processor-dlq"
    }
  ]
}
```

Name the inline policy:

```text
recontent-avatar-processor-access
```

Do not add Aurora, RDS, Secrets Manager, S3 delete, `s3:*`, bucket-wide
`arn:aws:s3:::<bucket>/*`, or `Resource: "*"`.

## 5. Create And Configure Lambda

**Purpose:** create a deterministic image worker with enough memory for
`sharp`, while bounding execution time and keeping its configuration separate
from ECS.

In **Lambda -> Functions -> Create function**:

1. Author from scratch
2. Function name: `recontent-avatar-processor`
3. Runtime: `Node.js 24.x`
4. Architecture: `x86_64`
5. Permissions: use existing role
6. Existing role: `recontent-avatar-processor-role`
7. Create function

Open **Code -> Upload from -> .zip file** and upload:

```text
lambda/avatar-processor/dist/avatar-processor.zip
```

Open **Configuration -> General configuration -> Edit**:

- Memory: `1024 MB`
- Timeout: `30 seconds`

Open **Configuration -> Runtime settings -> Edit**:

- Handler: `index.handler`

Open **Configuration -> Environment variables -> Edit**:

```text
AVATAR_S3_BUCKET=<bucket>
```

This variable is a bucket name, not an ARN and not a URL.

## 6. Configure Asynchronous Failure Handling

**Purpose:** retry transient failures twice, retain events for at most six
hours, and preserve permanent failures in SQS with their invocation context.

In **Lambda -> recontent-avatar-processor -> Configuration ->
Asynchronous invocation -> Edit**:

- Maximum age of event: `6 hours` / `21600 seconds`
- Retry attempts: `2`
- On-failure destination: `SQS queue`
- Destination: `recontent-avatar-processor-dlq`

Save the configuration. Use this setting instead of the older function-level
dead-letter queue field.

## 7. Add The S3 Trigger

**Purpose:** invoke the processor only after the application has confirmed an
upload. Filtering at `original/confirmed/` prevents temporary upload objects
and processed outputs from recursively invoking Lambda.

In **S3 -> <bucket> -> Properties -> Event notifications -> Create event
notification**:

1. Name: `avatar-confirmed`
2. Prefix: `original/confirmed/`
3. Suffix: leave empty
4. Event types: `All object create events`
5. Destination: `Lambda function`
6. Lambda function: `recontent-avatar-processor`
7. Save changes

Saving through the S3 console also adds a Lambda resource-policy permission.
The permission must restrict invocation to:

- principal `s3.amazonaws.com`
- source ARN `arn:aws:s3:::<bucket>`
- source account `<account-id>`

Do not use the broader prefix `original/` and do not add `*` to the prefix
field. Do not add another Lambda, SQS, SNS, or EventBridge notification that
also receives `original/confirmed/` object-created events.

## 8. Add S3 Lifecycle Rules

**Purpose:** keep confirmed originals long enough for incident recovery but
remove them after 30 days. Processed images are intentionally retained.

In **S3 -> <bucket> -> Management -> Lifecycle rules**, create enabled rules
scoped to:

```text
original/confirmed/
```

Required actions:

- expire current object versions after `30 days`
- expire noncurrent object versions after `30 days`
- delete expired object delete markers

The noncurrent and delete-marker rules are required when bucket versioning is
enabled or suspended. Do not add an expiration rule for
`processed/ready/` in this release.

## 9. Create CloudWatch Alarms

**Purpose:** detect both processor failures and failures while Lambda is trying
to deliver a failed event to SQS.

Create four alarms. Every alarm uses:

- threshold: `>= 1`
- period: `5 minutes`
- datapoints to alarm: `1 out of 1`
- missing data: `Treat missing data as good (not breaching)`
- notification: SNS topic `recontent-avatar-processor-alerts`

| Alarm name | Namespace / metric | Dimension |
| --- | --- | --- |
| `recontent-avatar-processor-dlq-visible` | AWS/SQS `ApproximateNumberOfMessagesVisible` | QueueName = `recontent-avatar-processor-dlq` |
| `recontent-avatar-processor-errors` | AWS/Lambda `Errors` | FunctionName = `recontent-avatar-processor` |
| `recontent-avatar-processor-asynceventsdropped` | AWS/Lambda `AsyncEventsDropped` | FunctionName = `recontent-avatar-processor` |
| `recontent-avatar-processor-destinationdeliveryfailures` | AWS/Lambda `DestinationDeliveryFailures` | FunctionName = `recontent-avatar-processor` |

## 10. Run The Read-Only Preflight

**Purpose:** compare the live resources with this contract before uploading a
real user avatar. The script reads AWS configuration but never mutates it.

Export:

```bash
export AWS_REGION='us-east-1'
export AVATAR_LAMBDA_FUNCTION='recontent-avatar-processor'
export AVATAR_LAMBDA_ROLE_NAME='recontent-avatar-processor-role'
export AVATAR_LAMBDA_POLICY_NAME='recontent-avatar-processor-access'
export AVATAR_S3_BUCKET='<bucket>'
export AVATAR_DLQ_URL='<queue-url>'
export AVATAR_DLQ_ARN='arn:aws:sqs:us-east-1:<account-id>:recontent-avatar-processor-dlq'
export AVATAR_ALARM_PREFIX='recontent-avatar-processor'
export AVATAR_ALARM_TOPIC_ARN='arn:aws:sns:us-east-1:<account-id>:recontent-avatar-processor-alerts'
```

Run:

```bash
npm run verify:avatar-lambda
```

Expected output:

```text
Avatar Lambda prerequisites verified.
```

A failure is fail-closed and intentionally prints no raw AWS response. Review
the Console settings above rather than weakening the verifier. It also checks
the Lambda-only role trust policy, overlapping S3 notifications, absence of
DLQ consumers/redrive, and all required alarms.

## 11. End-To-End Smoke Test

**Purpose:** prove the complete real path works, not only that each resource
exists.

1. Log in to production and upload a supported JPEG, PNG, or WebP under 5 MiB.
2. Confirm the application reports that the original was uploaded and awaits
   processing.
3. In S3, confirm the source exists under `original/confirmed/`.
4. In CloudWatch Logs, confirm a successful Lambda invocation.
5. In S3, confirm a WebP exists under the matching
   `processed/ready/` key.
6. Download only the processed test object and verify it is 512 x 512.
7. Confirm the SQS queue remains empty.

## Failure Recovery

**Purpose:** safely retry a retained native S3 event without replaying the
entire Lambda destination envelope.

Receive one message:

```bash
aws sqs receive-message \
  --queue-url "$AVATAR_DLQ_URL" \
  --max-number-of-messages 1 \
  --visibility-timeout 300 \
  --output json > /tmp/avatar-dlq-message.json
```

Extract only `requestPayload`:

```bash
jq '.Messages[0].Body | fromjson | .requestPayload' \
  /tmp/avatar-dlq-message.json > /tmp/avatar-s3-event.json
```

After correcting the cause, invoke asynchronously:

```bash
aws lambda invoke \
  --function-name "$AVATAR_LAMBDA_FUNCTION" \
  --invocation-type Event \
  --cli-binary-format raw-in-base64-out \
  --payload fileb:///tmp/avatar-s3-event.json \
  /tmp/avatar-redrive-result.json
```

Verify the deterministic object exists under `processed/ready/`. Only then
read the receipt handle locally and delete the message:

```bash
export AVATAR_DLQ_RECEIPT_HANDLE="$(
  jq -r '.Messages[0].ReceiptHandle' /tmp/avatar-dlq-message.json
)"

aws sqs delete-message \
  --queue-url "$AVATAR_DLQ_URL" \
  --receipt-handle "$AVATAR_DLQ_RECEIPT_HANDLE"
```

Do not echo the receipt handle or commit files under `/tmp`.

If the image is permanently invalid, permit a replacement by updating exactly
one matching row:

```sql
UPDATE users
SET avatar_status = 'failed',
    avatar_updated_at = UTC_TIMESTAMP()
WHERE id = :user_id
  AND avatar_key = :confirmed_avatar_key
  AND avatar_status = 'uploaded';
```

Confirm `ROW_COUNT()` is exactly `1`. A zero means the state or identifiers no
longer match; more than one indicates a schema or query error. Separately, an
`uploaded` row older than 24 hours becomes eligible for replacement through
the normal upload API even when an event never reached the DLQ.

## Official References

- [AWS Lambda Node.js runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html)
- [Lambda asynchronous error handling](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-configuring.html)
- [Lambda asynchronous destinations](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-retain-records.html)
- [S3 event notification filtering](https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-how-to-filtering.html)
