# Task 7 Report: Final Dual-Review Findings

## Scope

This task resolves the final review findings for avatar upload reservation
ordering, rate-limit isolation, ECS credential-chain safety, rendered task
definition validation, OpenNext CI coverage, S3 CORS policy, real presigned POST
policy coverage, and object-key segment safety.

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

## Findings Fixed

- Active `pending_upload`, `confirming`, `uploaded`, unknown, and missing user
  states return 409 before S3 work. Stale pending, failed, and not-uploaded states
  may presign, but the final reserve CAS remains authoritative and a lost CAS
  returns 409 without exposing the contract.
- Legacy dry-run quota is isolated in `avatar-upload-dry-run` with max 20; real
  intent quota remains `avatar-upload-intent` with max 5.
- Target ECS task definitions reject alternate/static AWS provider-chain
  configuration from environment or secrets, case-insensitively, while retaining
  the required standard `AWS_REGION`.
- The live preflight remains after credential configuration and before ECR. A
  separate static rendered-task mode validates the exact task role, unique
  container, bucket, runtime region, legacy region absence, and credential-chain
  absence before the deploy action.
- CI retains docs-only `paths-ignore` and Docker build while adding the OpenNext
  build gate after Next.
- All S3 CORS rules now require only the exact production origin, with at least
  one POST rule.
- Real AWS SDK signing is covered without network access by decoding and checking
  the generated policy.
- User and upload key segments are URL-safe, preventing ambiguous raw
  `CopySource` keys.

## Dual Review

- Independent code review completed with no code finding. Its commit gate was to
  ensure the two new untracked requirement tests are included; they are part of
  this task's staged scope.
- Independent adversarial review completed. Its only must-fix claim was that
  sequential Next and OpenNext builds would contend on `.next/lock`. The reviewer
  and main process had run builds concurrently in the same worktree, producing
  the observed lock and SIGTERM. After both reviewers stopped, the exact
  sequential CI order passed in an exclusive run, so no workflow workaround was
  applied.
- The optional suggestion to avoid all presigning on concurrent final-CAS loss
  was not adopted: the required design explicitly presigns before the final CAS,
  and only deterministic active reservations must be blocked before S3.

## Verification

| Command | Result |
| --- | --- |
| Focused auth/avatar/preflight tests | PASS: 18 files, 426 tests |
| CI-equivalent Vitest command | PASS: 34 files, 586 tests |
| `npm run lint` | PASS |
| `npx tsc --noEmit --incremental false` | PASS |
| `npm run build` | PASS |
| `npx --no-install opennextjs-cloudflare build` | PASS after an exclusive sequential Next build; dependency bundle reports the existing non-fatal `-0 === 0` warning |
| `node --check scripts/verify-avatar-s3-prerequisites.mjs` | PASS |
| Workflow YAML parse | PASS: both CI and deploy workflows parsed independently, in addition to the 158-test script/workflow suite |
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
