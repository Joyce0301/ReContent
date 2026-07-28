# Avatar S3 Production Smoke Test

Run this checklist only against the authenticated ECS production deployment,
after the database migrations and deployment preflight pass. It performs a real
S3 upload, changes the primary test user's avatar state, and uses a second user
for the ownership check; use dedicated production smoke accounts.

## Safety setup

Use a local shell with `jq`, `curl`, AWS CLI, and MySQL client available. Do not
paste cookies, passwords, presigned fields, signatures, security tokens, or
object keys directly into commands. The steps keep them in mode-`600` temporary
files. They can still authorize access until expiry, so clean them up even after
a failed run.

```bash
set -euo pipefail
umask 077

export BASE_URL="https://re-6718725ab2374d34942ac6eee4abd640.ecs.us-east-1.on.aws"
export AVATAR_BUCKET="recontent-avatar-pipeline-20260726"
export AWS_REGION="us-east-1"
export IMAGE_FILE="/absolute/path/to/smoke-avatar.webp"
export CONTENT_TYPE="image/webp"

SMOKE_DIR="$(mktemp -d)"
COOKIE_JAR="$SMOKE_DIR/primary.cookies"
OTHER_COOKIE_JAR="$SMOKE_DIR/other.cookies"
LOGIN_BODY="$SMOKE_DIR/login.json"
OTHER_LOGIN_BODY="$SMOKE_DIR/other-login.json"
DRY_RUN_BODY="$SMOKE_DIR/dry-run.json"
INTENT_BODY="$SMOKE_DIR/intent-body.json"
INTENT_RESPONSE="$SMOKE_DIR/intent-response.json"
CONFIRM_BODY="$SMOKE_DIR/confirm-body.json"
CONFIRM_RESPONSE="$SMOKE_DIR/confirm-response.json"
S3_CONFIG="$SMOKE_DIR/s3-curl.config"
S3_RESPONSE="$SMOKE_DIR/s3-response.txt"
STAGING_HEAD_INPUT="$SMOKE_DIR/staging-head-input.json"
CONFIRMED_HEAD_INPUT="$SMOKE_DIR/confirmed-head-input.json"

cleanup() {
  rm -rf "$SMOKE_DIR"
}
trap cleanup EXIT

test -f "$IMAGE_FILE"
IMAGE_SIZE="$(wc -c < "$IMAGE_FILE" | tr -d ' ')"
test "$IMAGE_SIZE" -ge 1
test "$IMAGE_SIZE" -le 5242880
```

## Authenticate two users

Enter credentials at prompts. Password input is hidden, remains in a shell-local
variable only long enough to send it to Node over stdin, and is written only to
the mode-`600` request file. Neither password enters shell history, a child
process argument, or the environment.

```bash
write_login_body() {
  local output_file="$1"
  local prompt_label="$2"
  local email
  local password

  read -r -p "$prompt_label email: " email
  read -r -s -p "$prompt_label password: " password
  printf '\n'

  if ! printf '%s\n%s\n' "$email" "$password" |
      node -e '
        const fs = require("node:fs");
        const [email, password] = fs.readFileSync(0, "utf8").split("\n");
        if (!email || !password) process.exit(1);
        process.stdout.write(JSON.stringify({ email, password }));
      ' > "$output_file"; then
    unset email password
    return 1
  fi

  unset email password
}

write_login_body "$LOGIN_BODY" "Primary smoke"
write_login_body "$OTHER_LOGIN_BODY" "Second smoke"

curl --fail-with-body --silent --show-error \
  --cookie-jar "$COOKIE_JAR" \
  --header "Content-Type: application/json" \
  --data-binary "@$LOGIN_BODY" \
  "$BASE_URL/api/auth/login" | jq -e '.user.id'

curl --fail-with-body --silent --show-error \
  --cookie-jar "$OTHER_COOKIE_JAR" \
  --header "Content-Type: application/json" \
  --data-binary "@$OTHER_LOGIN_BODY" \
  "$BASE_URL/api/auth/login" | jq -e '.user.id'

rm -f "$LOGIN_BODY" "$OTHER_LOGIN_BODY"
```

## Verify the legacy dry-run route

The old authenticated route must still validate metadata without issuing S3
fields or changing upload state.

```bash
jq -n \
  --arg fileName "$(basename "$IMAGE_FILE")" \
  --arg contentType "$CONTENT_TYPE" \
  --argjson sizeBytes "$IMAGE_SIZE" \
  '{fileName: $fileName, contentType: $contentType, sizeBytes: $sizeBytes}' \
  > "$DRY_RUN_BODY"

curl --fail-with-body --silent --show-error \
  --cookie "$COOKIE_JAR" \
  --header "Content-Type: application/json" \
  --data-binary "@$DRY_RUN_BODY" \
  "$BASE_URL/api/profile/avatar" \
  | jq -e '
      .validation.status == "ready_for_storage"
      and (.message | type == "string")
      and (has("upload") | not)
      and (has("objectKey") | not)
    '
```

## Issue an upload intent

```bash
cp "$DRY_RUN_BODY" "$INTENT_BODY"

curl --fail-with-body --silent --show-error \
  --cookie "$COOKIE_JAR" \
  --header "Content-Type: application/json" \
  --data-binary "@$INTENT_BODY" \
  "$BASE_URL/api/profile/avatar/upload-intent" \
  > "$INTENT_RESPONSE"

jq -e '
  (.upload.url | type == "string" and length > 0)
  and (.upload.fields | type == "object")
  and (.objectKey | startswith("original/pending/"))
' "$INTENT_RESPONSE" > /dev/null
```

Do not print the response: its fields contain a short-lived policy, signature,
and session token.

## Perform the multipart S3 POST

Generate a temporary curl config so presigned fields do not appear in command
history or the curl process arguments.

```bash
INTENT_RESPONSE="$INTENT_RESPONSE" \
IMAGE_FILE="$IMAGE_FILE" \
CONTENT_TYPE="$CONTENT_TYPE" \
S3_CONFIG="$S3_CONFIG" \
node <<'NODE'
const fs = require("node:fs");
const intent = JSON.parse(fs.readFileSync(process.env.INTENT_RESPONSE, "utf8"));
const lines = [
  `url = ${JSON.stringify(intent.upload.url)}`,
  'request = "POST"',
  'silent',
  'show-error',
  'output = "/dev/null"',
  'write-out = "%{http_code}\\n"'
];

for (const [name, value] of Object.entries(intent.upload.fields)) {
  lines.push(`form-string = ${JSON.stringify(`${name}=${value}`)}`);
}

lines.push(
  `form = ${JSON.stringify(
    `file=@${process.env.IMAGE_FILE};type=${process.env.CONTENT_TYPE}`
  )}`
);
fs.writeFileSync(process.env.S3_CONFIG, `${lines.join("\n")}\n`, {
  mode: 0o600
});
NODE

curl --config "$S3_CONFIG" > "$S3_RESPONSE"
test "$(tr -d '\r\n' < "$S3_RESPONSE")" = "204"
rm -f "$S3_CONFIG" "$S3_RESPONSE"
```

## Confirm and replay

The first confirmation must copy to the deterministic confirmed key and return
`uploaded`. Replaying the same confirmation twice must return the same
idempotent result without replacing the confirmed object.

```bash
jq '{objectKey}' "$INTENT_RESPONSE" > "$CONFIRM_BODY"

curl --fail-with-body --silent --show-error \
  --cookie "$COOKIE_JAR" \
  --header "Content-Type: application/json" \
  --data-binary "@$CONFIRM_BODY" \
  "$BASE_URL/api/profile/avatar/confirm" \
  > "$CONFIRM_RESPONSE"

jq -e '
  .status == "uploaded"
  and (.confirmedKey | startswith("original/confirmed/"))
' "$CONFIRM_RESPONSE" > /dev/null

for attempt in 1 2; do
  curl --fail-with-body --silent --show-error \
    --cookie "$COOKIE_JAR" \
    --header "Content-Type: application/json" \
    --data-binary "@$CONFIRM_BODY" \
    "$BASE_URL/api/profile/avatar/confirm" \
    | jq -e --slurpfile first "$CONFIRM_RESPONSE" '
        .status == "uploaded"
        and .confirmedKey == $first[0].confirmedKey
      ' > /dev/null
done
```

## Reject a cross-user confirmation

The second authenticated user must not be able to confirm the first user's
staging key. The expected response is `400`.

```bash
CROSS_STATUS="$(
  curl --silent --show-error \
    --output "$SMOKE_DIR/cross-user-response.json" \
    --write-out '%{http_code}' \
    --cookie "$OTHER_COOKIE_JAR" \
    --header "Content-Type: application/json" \
    --data-binary "@$CONFIRM_BODY" \
    "$BASE_URL/api/profile/avatar/confirm"
)"
test "$CROSS_STATUS" = "400"
jq -e '.error | type == "string"' \
  "$SMOKE_DIR/cross-user-response.json" > /dev/null
```

## Inspect MySQL and S3

Resolve the primary user's ID through an operator-approved database session,
then verify one terminal row: `avatar_status` is `uploaded`, `avatar_key` is
under `original/confirmed/`, and `avatar_confirmation_token` is `NULL`. Do not
paste database passwords into the command; use `mysql_config_editor` or a
mode-`600` `--defaults-extra-file`.

```sql
SELECT
  id,
  avatar_key,
  avatar_status,
  avatar_updated_at,
  avatar_confirmation_token
FROM users
WHERE email = '<primary smoke account email>';
```

Keep the sensitive intent and confirm responses on disk while checking S3:

```bash
INTENT_RESPONSE="$INTENT_RESPONSE" \
CONFIRM_RESPONSE="$CONFIRM_RESPONSE" \
AVATAR_BUCKET="$AVATAR_BUCKET" \
STAGING_HEAD_INPUT="$STAGING_HEAD_INPUT" \
CONFIRMED_HEAD_INPUT="$CONFIRMED_HEAD_INPUT" \
node <<'NODE'
const fs = require("node:fs");
const intent = JSON.parse(fs.readFileSync(process.env.INTENT_RESPONSE, "utf8"));
const confirmation = JSON.parse(
  fs.readFileSync(process.env.CONFIRM_RESPONSE, "utf8")
);

fs.writeFileSync(
  process.env.STAGING_HEAD_INPUT,
  JSON.stringify({
    Bucket: process.env.AVATAR_BUCKET,
    Key: intent.objectKey
  }),
  { mode: 0o600 }
);
fs.writeFileSync(
  process.env.CONFIRMED_HEAD_INPUT,
  JSON.stringify({
    Bucket: process.env.AVATAR_BUCKET,
    Key: confirmation.confirmedKey
  }),
  { mode: 0o600 }
);
NODE

aws s3api head-object \
  --cli-input-json "file://$STAGING_HEAD_INPUT" \
  --region "$AWS_REGION" > "$SMOKE_DIR/staging-head.json"

aws s3api head-object \
  --cli-input-json "file://$CONFIRMED_HEAD_INPUT" \
  --region "$AWS_REGION" > "$SMOKE_DIR/confirmed-head.json"

jq -e \
  --arg type "$CONTENT_TYPE" \
  --argjson size "$IMAGE_SIZE" \
  '.ContentType == $type and .ContentLength == $size' \
  "$SMOKE_DIR/staging-head.json" > /dev/null
jq -e \
  --arg type "$CONTENT_TYPE" \
  --argjson size "$IMAGE_SIZE" \
  '.ContentType == $type and .ContentLength == $size' \
  "$SMOKE_DIR/confirmed-head.json" > /dev/null
```

Record only pass/fail status and non-sensitive request IDs in the rollout log.
Do not attach cookie jars, intent responses, curl configs, object keys, or
database rows. The `EXIT` trap removes local temporary artifacts; if the shell
was interrupted, run `rm -rf "$SMOKE_DIR"` before closing the session.
