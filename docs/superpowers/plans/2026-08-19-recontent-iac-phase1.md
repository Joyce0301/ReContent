# ReContent IaC Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring ReContent's current production runtime under a safer Terraform bootstrap by covering backend scaffolding, secrets, ECS baseline resources, ALB target groups, CloudWatch primitives, and a least-privilege deploy policy path.

**Architecture:** Keep this phase import-first and drift-aware. We codify existing production resources with conservative lifecycle settings so Terraform can adopt them without fighting the current GitHub Actions deploy flow, which still updates ECS task definitions out of band.

**Tech Stack:** Terraform 1.5+, AWS provider 5.x, ECS Fargate, ALB, CloudWatch, Secrets Manager, IAM OIDC, GitHub Actions.

**Spec:** `/Users/juice/Desktop/vibe coding/ReContent/infra/terraform/README.md`

## Global Constraints

- Use AWS account `881424867096` in `us-east-1` only.
- Prefer importing existing production resources over recreating them.
- Do not break the current GitHub Actions deploy workflow.
- Keep secrets metadata in Terraform, but do not store secret values in git.
- Keep explanations and implementation boring over clever.

---

### Task 1: Add remote-state backend scaffolding

**Files:**
- Create: `infra/terraform/backend.tf`
- Create: `infra/terraform/backend.prod.hcl.example`
- Modify: `infra/terraform/README.md`

**Interfaces:**
- Consumes: existing local-state bootstrap
- Produces: partial S3 backend config and migration docs

- [ ] Add `backend "s3" {}` so state can move off local disk without hardcoding secrets or bucket names in git.
- [ ] Add an example backend config file with `bucket`, `key`, `region`, `dynamodb_table`, and `encrypt`.
- [ ] Document `terraform init -backend-config=... -migrate-state`.

### Task 2: Codify current shared naming and imports

**Files:**
- Create: `infra/terraform/variables.tf`
- Create: `infra/terraform/locals.tf`
- Modify: `infra/terraform/imports.tf`

**Interfaces:**
- Consumes: current AWS discovery data
- Produces: stable names/ARNs/IDs and import blocks for phase-1 resources

- [ ] Add variables for cluster, service, task family, ALB, target groups, log group, bucket, secrets, subnet IDs, and security groups.
- [ ] Add locals for common ARNs and container environment/secrets payloads.
- [ ] Add import blocks for secrets, target groups, log group, rollback alarm, ECS roles, ECS task definition, and ECS service.

### Task 3: Codify secrets metadata

**Files:**
- Create: `infra/terraform/secrets.tf`

**Interfaces:**
- Consumes: secret names discovered in AWS
- Produces: Terraform-managed `aws_secretsmanager_secret` resources

- [ ] Add resources for `recontent/KIMI_API_KEY`, `recontent/FIRECRAWL_API_KEY`, and `recontent/AUTH_SESSION_SECRET`.
- [ ] Keep values unmanaged; metadata only.
- [ ] Tag them consistently for future filtering.

### Task 4: Codify ECS baseline

**Files:**
- Create: `infra/terraform/ecs.tf`

**Interfaces:**
- Consumes: current task definition revision, roles, networking IDs, and app env/secrets layout
- Produces: importable ECS task definition + service baseline

- [ ] Model the current Fargate task definition revision as code.
- [ ] Model the ECS service with conservative lifecycle settings so CD can keep updating task definition revisions without Terraform churn.
- [ ] Keep container image configurable by variable instead of baking secret state into code.

### Task 5: Codify ALB target groups and health checks

**Files:**
- Create: `infra/terraform/alb.tf`

**Interfaces:**
- Consumes: existing ALB + blue/green target group IDs
- Produces: Terraform-managed target group health-check config and ALB data references

- [ ] Add data lookups for the existing ALB.
- [ ] Add resources for both target groups with `/api/health` health checks.
- [ ] Keep listener/routing out of scope for this phase because ECS Express is managing traffic orchestration.

### Task 6: Codify CloudWatch primitives

**Files:**
- Create: `infra/terraform/cloudwatch.tf`

**Interfaces:**
- Consumes: ECS service name, ALB ARN suffixes, target groups, and log group name
- Produces: log retention, rollback alarm import, ops alarms, and a basic dashboard

- [ ] Manage the ECS log group with explicit retention.
- [ ] Import the existing rollback alarm.
- [ ] Add one alarm for zero running tasks and one for unhealthy ALB targets.
- [ ] Add a compact CloudWatch dashboard for ECS + ALB.

### Task 7: Add deploy-role least-privilege path

**Files:**
- Modify: `infra/terraform/iam.tf`
- Modify: `infra/terraform/README.md`

**Interfaces:**
- Consumes: current deploy workflow actions and existing broad managed-policy attachments
- Produces: inline least-privilege policy resources without forcing immediate destructive cleanup

- [ ] Import the existing preflight-read inline policy.
- [ ] Add a new inline policy for ECR push, ECS register/update, IAM pass-role, and CloudWatch/S3 reads actually used by deploy.
- [ ] Document that broad managed-policy attachments remain external until cutover/removal.

### Task 8: Verify and document safe rollout

**Files:**
- Modify: `infra/terraform/README.md`

**Interfaces:**
- Consumes: all Terraform files above
- Produces: operator runbook for `fmt`, `validate`, `plan`, `import`, and phased apply

- [ ] Run `terraform fmt`.
- [ ] Run `terraform validate`.
- [ ] Update README with apply ordering and known drift boundaries.
