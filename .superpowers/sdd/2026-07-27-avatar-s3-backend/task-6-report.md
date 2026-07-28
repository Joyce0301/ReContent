# Task 6 Report: Deployment Preflight And Documentation

## Scope

This task adds a fail-closed, injectable avatar S3 deployment preflight, wires it
into deployment before ECR login and Docker image build, extends CI coverage, and
documents the ECS-only deployment and production smoke-test procedure.

No application code, schema, migration, package, plan, or spec file was changed.
No live AWS command or network-dependent test was run.

## TDD Evidence

The preflight was developed test-first with an injected `aws(args)` boundary.

- RED: the initial focused test failed because the preflight module did not
  exist.
- GREEN: the first implementation passed 52 focused tests.
- RED: additional fail-closed cases exposed 20 failures around IAM wildcards,
  pagination and malformed shapes, URL-encoded managed policies, ECS ambiguity,
  CORS/lifecycle strictness, simulation results, and redaction.
- GREEN: those cases passed after implementation.
- RED: three bypass tests then caught mixed POST origins, a lifecycle rule that
  broadly covered `pending/`, and mismatched simulation resources.
- GREEN: all three passed after tightening validation.
- RED: one deploy-role `NotAction` residual-risk case failed.
- GREEN: the deploy-role validator was adjusted so broad unrelated attachments
  neither satisfy the required read scope nor incorrectly block deployment.
- RED: adversarial tests found eight failures involving extra S3 object actions,
  broader ListBucket grants, wrong-resource deploy permissions, outside-prefix
  ListBucket simulation, and pagination/shape edge cases.
- GREEN: that review cycle passed 90/90 focused tests.
- RED: the follow-up main-flow review added eight tests and exposed six failures:
  target-container legacy region entries, extra simulation results, and broad
  deploy-role resources satisfying scoped reads.
- GREEN: exact simulation cardinality, legacy environment rejection, and
  dedicated exact-action/resource evidence brought the suite to 99/99.
- RED: independent review then exposed the no-attached-managed-policy path as
  one failure in 100 tests.
- GREEN: managed-policy reads became conditional on actual attachments, passing
  100/100.
- RED: adversarial review corrected the simulation resource model and added
  legacy ECS secret coverage, producing six expected failures in 103 tests.
- GREEN: only `ecs:DescribeTaskDefinition` permits `Resource: "*"`,
  `iam:SimulatePrincipalPolicy` requires the exact task-role ARN, and legacy
  `AVATAR_S3_REGION` is rejected from both environment and secrets. The final
  review-fix suite passed 103/103 tests.
- RED: the second follow-up review added 12 resource-aware Deny cases. Three
  disjoint bucket, role, and ECS service Deny cases failed in a 115-test run
  because Deny evaluation considered only the action.
- GREEN: Deny evaluation now checks whether a valid ARN pattern can overlap a
  required resource. Exact, wildcard, all-resource, mixed partial overlap,
  policy-variable/malformed scope, `NotAction`, `NotResource`, and any
  star-only action Deny remain fail closed. The focused suite passed 115/115.
- GREEN coverage hardening: explicit Action-array, `?` wildcard, Condition,
  case-variant, malformed resource, and `Action: "*"` tests bring the final
  focused suite to 122/122.

The final suite covers `Action`, `Resource`, `NotAction`, and `NotResource`
wildcards; inline and attached policy enumeration; explicit pagination failure;
managed-policy default-version retrieval and URL decoding; missing, duplicate,
and ambiguous AWS response shapes; redacted CLI/JSON failures; exact CORS,
lifecycle, encryption, ownership, and public-access settings; and all required
inside/outside-prefix simulations.

## Review

- Independent code review completed. Its two must-fix findings were addressed:
  extra S3 object actions under `original/*` are rejected, and smoke-test object
  keys are passed through mode-600 CLI input files rather than process arguments.
- Independent adversarial review completed. Its four attack areas were fixed:
  broad ListBucket grants, extra object actions, deploy read permissions on the
  wrong resources, and CORS rules containing additional POST origins.
- Both reviewers approved the corrected implementation with no remaining
  must-fix finding.
- A follow-up main-flow review initially requested changes for password argv
  exposure, permissive simulation result cardinality, legacy region handling,
  and broad deploy-role read evidence. All requested tests and fixes were added.
- The independent re-review found and fixed one additional no-managed-policy
  edge case. A second adversarial review corrected
  `iam:SimulatePrincipalPolicy` to exact task-role scope and extended legacy
  rejection to ECS secrets.
- Both follow-up reviewers approved the final 103-test implementation with no
  remaining finding.
- The resource-aware Deny fix passed independent code review without findings.
  Adversarial review requested explicit tests for six additional IAM forms;
  those tests were added, and the re-review approved the final 122-test suite
  with no remaining finding.

## Verification

| Command | Result |
| --- | --- |
| `npx vitest run scripts/verify-avatar-s3-prerequisites.test.ts` | PASS: 1 file, 122 tests |
| CI-equivalent `npx vitest run ...` command from `.github/workflows/ci.yml` | PASS: 32 files, 521 tests |
| `npm run lint` | PASS |
| `node --check scripts/verify-avatar-s3-prerequisites.mjs` | PASS |
| `npx tsc --noEmit --incremental false` | PASS |
| `npm run build` | PASS |
| `npx --no-install opennextjs-cloudflare build` | PASS; generated dependency bundle reports a non-fatal `-0 === 0` warning |
| `docker version` | ENVIRONMENT BLOCKED: Docker 29.4.0 client is installed, but the configured Colima daemon socket does not exist, so no Docker build was attempted |
| `git diff --check` | PASS before commit |

## Live Hard Gates

The following remain mandatory manual gates because Task 6 intentionally does
not access live AWS:

1. Grant the GitHub deployment role the documented read-only ECS, S3, IAM, and
   policy-simulation scope on the exact production resources. Only
   `ecs:DescribeTaskDefinition` uses `Resource: "*"`; principal simulation is
   scoped to the exact task-role ARN. The deployment role's existing broad
   attachments are a residual risk and are not evidence of least privilege.
2. Apply and verify the documented token migration before enabling avatar
   uploads. Confirm the token-fenced lease behavior against production MySQL.
3. Run the deployment preflight with GitHub OIDC credentials. It must validate
   the active ECS task definition, exact container, task role, bucket, standard
   `AWS_REGION`, S3 controls, task-role policies, and IAM simulations.
4. Complete the authenticated production smoke test for both users: legacy
   dry-run, upload intent, real multipart S3 POST, confirm, replay/repeated
   confirm, cross-user rejection, and DB/S3 inspection.
5. Remove all temporary mode-600 cookie, signature, token, request, and response
   files after the smoke test.

## Residual Risks

- A live AWS preflight and production smoke test are intentionally deferred to
  the deployment operator and Task 7.
- Docker image construction was not locally verified because no Docker daemon
  was available. Next.js and OpenNext production builds did pass.
- Existing broad deployment-role attachments remain a security risk even after
  the exact read-scope hard gate is added; this task does not claim that role is
  least privilege.
- AWS policy simulation supplements, but does not replace, the strict static
  rejection of broad task-role object grants.
