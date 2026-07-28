# Task 7 Report: Final Dual-Review Findings

## Scope

This task resolves the final review findings for avatar upload reservation
ordering, rate-limit isolation, ECS credential-chain safety, rendered task
definition validation, OpenNext CI coverage, S3 CORS policy, real presigned POST
policy coverage, object-key segment safety, and the final adversarial edge-case
follow-up.

No frontend upload behavior, migration column design, live AWS resource, push, or
Draft PR state was changed.

## TDD Evidence

- RED A/B/F/H: the first focused run produced 31 expected failures in 247
  tests. The failures showed that upload state lacked a DB reservation decision,
  active pending uploads reached the presigner, the dry-run reused the intent
  bucket, non-POST CORS rules could carry another origin, and key segments
  accepted unsafe characters.
- GREEN A/B/F/G/H: `getAvatarUploadState` now returns a MySQL-computed
  `reservationEligible` decision using the exact reserve CAS condition. The
  intent route rejects false or missing eligibility before key creation,
  presigning, or reservation. The dry-run uses its own bucket, every CORS rule
  must use the exact production origin, and key segments are limited to
  `[A-Za-z0-9_-]+`. The real SDK policy test and real rate-limit isolation test
  also passed. The focused run reached 247/247.
- RED C/D/E: the second script/workflow run produced 36 expected failures in
  158 tests. The failures covered all 12 forbidden AWS credential environment
  names in both ECS environment and secrets, mixed/case-variant entries,
  rendered JSON validation and redaction, deploy-step ordering, and the missing
  OpenNext CI gate.
- GREEN C/D/E: live and rendered task definitions share target-container runtime
  validation. Live mode still requires the active task metadata; rendered mode
  reads the render action JSON file without AWS access and does not require
  `status=ACTIVE`. Deploy validates the rendered file before deployment, and CI
  runs OpenNext after the standalone Next build. The script/workflow run reached
  158/158.
- RED final adversarial follow-up: 24 expected failures in 221 focused tests
  exposed required-setting secret overrides, malformed or duplicate ECS entries,
  non-POST and duplicate CORS rules, NULL lease timestamps, missing production
  deploy serialization, repeated Next builds, and unvalidated copy key pairs.
- GREEN final adversarial follow-up: runtime entries now fail closed on malformed
  shapes and case-insensitive duplicates; CORS is one exact production-origin
  POST-only rule; NULL pending/confirming timestamps are safely recoverable in
  all matching DB predicates; production deploys serialize without cancellation;
  OpenNext reuses the completed Next build; and copy validates the deterministic
  pending-to-confirmed key pair before SDK access. The focused run reached
  221/221.
- RED/GREEN malformed-entry follow-up: two additional tests in a 171-test
  preflight suite showed that whitespace-only environment names and secret
  `valueFrom` values were still accepted. Trim-aware shape validation produced
  the final 171/171 GREEN.
- RED/GREEN review hardening: independent review then exposed whitespace-padded
  runtime names (2 failures in 173 tests), whitespace-padded secret references
  (1 failure in 174 tests), and names containing spaces or control characters
  (2 failures in 176 tests). Each failure was recorded before implementation;
  canonical env-name and secret-reference validation produced the final 176/176
  GREEN.

## Findings Fixed

- Active `pending_upload`, `confirming`, `uploaded`, unknown, and missing user
  states return 409 before S3 work. Stale pending, failed, and not-uploaded states
  may presign, but the final reserve CAS remains authoritative and a lost CAS
  returns 409 without exposing the contract.
- Legacy dry-run quota is isolated in `avatar-upload-dry-run` with max 20; real
  intent quota remains `avatar-upload-intent` with max 5.
- Target ECS task definitions reject alternate/static AWS provider-chain
  configuration from environment or secrets, case-insensitively. Required bucket
  and region settings must be unique environment entries and cannot be shadowed
  by secrets; all environment and secret entries are shape-checked, names use
  the canonical env identifier form, and secret references reject surrounding
  whitespace.
- The live preflight remains after credential configuration and before ECR. A
  separate static rendered-task mode validates the exact task role, unique
  container, bucket, runtime region, legacy region absence, and credential-chain
  absence before the deploy action.
- CI retains docs-only `paths-ignore` and Docker build while running OpenNext
  with `--skipNextBuild` after the standalone Next build.
- Production branch, tag, and manual deployments share the static
  `recontent-production-deploy` concurrency group with cancellation disabled.
- S3 CORS now requires exactly one rule containing only the exact production
  origin and only the uppercase `POST` method.
- Real AWS SDK signing is covered without network access by decoding and checking
  the generated policy.
- User and upload key segments are URL-safe, preventing ambiguous raw
  `CopySource` keys.
- Pending upload and confirming lease rows with legacy/corrupt NULL timestamps
  are recoverable using the same NULL-or-stale predicates in reads and CAS
  updates.
- Copy requests reject unsafe, mismatched, or direction-reversed key pairs with
  a fixed typed error before any S3 SDK command.

## Dual Review

- Independent code review completed. A follow-up read-only review found that
  whitespace-padded runtime names could evade malformed-entry handling; the
  finding was reproduced RED and fixed.
- Independent adversarial review completed. Its only must-fix claim was that
  sequential Next and OpenNext builds would contend on `.next/lock`. The reviewer
  and main process had run builds concurrently in the same worktree, producing
  the observed lock and SIGTERM. After both reviewers stopped, the exact
  sequential CI order passed in an exclusive run, so no workflow workaround was
  applied.
- The optional suggestion to avoid all presigning on concurrent final-CAS loss
  was not adopted: the required design explicitly presigns before the final CAS,
  and only deterministic active reservations must be blocked before S3.
- The final adversarial follow-up identified six additional edge cases. All six
  were implemented test-first and are covered by the final validation matrix.
- The closing adversarial review found whitespace-padded secret references and
  non-identifier runtime names. Both findings were reproduced RED and fixed.
  Its suggestion to reject unrelated CORS fields was not adopted because the
  requirement constrains rule count, origins, and methods; fields such as
  `AllowedHeaders` may be valid for browser POST uploads and do not broaden the
  allowed origin or method.

## Verification

| Command | Result |
| --- | --- |
| Focused auth/avatar/preflight tests | PASS: 18 files, 453 tests |
| CI-equivalent Vitest command | PASS: 34 files, 613 tests |
| `npm run lint` | PASS |
| `npx tsc --noEmit --incremental false` | PASS |
| `npm run build` | PASS |
| `npx --no-install opennextjs-cloudflare build --skipNextBuild` | PASS after the exclusive Next build; output confirms the Next build was skipped, and the dependency bundle reports the existing non-fatal `-0 === 0` warning |
| `node --check scripts/verify-avatar-s3-prerequisites.mjs` | PASS |
| Workflow YAML parse | PASS: both CI and deploy workflows parsed independently, in addition to the 176-test script/workflow suite |
| `git diff --check` | PASS before staging |
| `docker version` | ENVIRONMENT BLOCKED: Docker 29.4.0 client is installed, but the configured Colima socket does not exist |

## Remaining Manual Gates

1. Apply and verify the existing avatar confirmation-token migration before
   enabling uploads. This task intentionally did not change migration design.
2. Run the live AWS preflight with GitHub OIDC credentials, then confirm the
   rendered-task check runs between render and deploy.
3. Complete the authenticated production S3 smoke test and database/object
   inspection documented for the avatar backend.
4. Run the Docker image build when the Colima or equivalent Docker daemon is
   available.
5. Push and update the Draft PR only when explicitly requested; this task
   intentionally performs neither action.
