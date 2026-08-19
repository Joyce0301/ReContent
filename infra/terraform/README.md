# ReContent Terraform Bootstrap

This directory is still bootstrap Terraform, but it now covers more of the
production runtime shape:

- the existing ECR repository `recontent`
- the Terraform state S3 bucket + DynamoDB lock table bootstrap
- the existing GitHub Actions deploy role `github-actions-recontent-deploy`
- the existing GitHub Actions OIDC provider
- the current app secrets metadata in Secrets Manager
- the current ECS task definition baseline and ECS service shell
- the two ALB target groups and their `/api/health` checks
- the ECS app log group, rollback alarm, and a small ops dashboard
- the current ECS task/execution roles and their inline policies
- the current RDS MySQL instance, DB subnet group, and active MySQL ingress rules

It is still intentionally conservative:

- **GitHub Actions still deploys ECS out of band.**
  Terraform imports the current task definition/service shape, but the ECS
  service ignores `task_definition` drift so Terraform will not fight the
  current deploy workflow.
- **Secret values are still not in Terraform.**
  Only the secret containers/metadata are managed here.
- **The current broad managed-policy attachments on**
  `github-actions-recontent-deploy`
  **are now modeled exactly as they exist today.**
  This keeps Terraform aligned with current reality first; least-privilege
  cutover can happen in a later phase.
- **ALB listeners/routing stay out of scope for now.**
  ECS Express currently owns traffic orchestration details. This phase manages
  the target groups and health checks only.

## Current limitations

- There is **no live remote backend yet**, only the backend scaffolding:
  - `backend.tf`
  - `backend.prod.hcl.example`
- Because state is still local until you migrate it, do **not** assume a fresh
  checkout is safe to apply without first reviewing the import plan.
- The ALB listener and ECS Express-managed traffic routing are still unmanaged
  and should be treated as external prerequisites.

## Remote backend setup

1. Create:
   - one S3 bucket for Terraform state
   - one DynamoDB table for state locking
2. Copy `backend.prod.hcl.example` and fill in real values.
3. Initialize or migrate state:

```bash
terraform init -backend-config=backend.prod.hcl
```

If you already have local state and want to move it:

```bash
terraform init -backend-config=backend.prod.hcl -migrate-state
```

## Bootstrap workflow

From `infra/terraform`:

```bash
terraform init
terraform fmt
terraform validate
terraform plan
```

This module includes Terraform `import` blocks so a new checkout can adopt the
already-existing AWS resources instead of trying to recreate them.

## Safe usage rules for now

1. Always run `terraform plan` before `terraform apply`.
2. Use only AWS account `881424867096` in `us-east-1`.
3. Do not store secret values in Terraform code or variables checked into git.
4. Keep `github-actions-recontent-deploy` managed policy attachments
   (`AmazonEC2ContainerRegistryPowerUser`, `AmazonEC2FullAccess`,
   `AmazonECS_FullAccess`) exactly as modeled here until least-privilege
   replacement is tested.
5. Expect ECS service drift around task definition revisions because deploys are
   still handled by GitHub Actions.

## Resource coverage in this phase

### State and shared config

- `backend.tf`
- `backend.prod.hcl.example`
- `state.tf`
- `variables.tf`
- `locals.tf`
- `imports.tf`

### Secrets

- `recontent/AUTH_SESSION_SECRET`
- `recontent/KIMI_API_KEY`
- `recontent/FIRECRAWL_API_KEY`

### ECS

- `default-recontent-b13f:35` task definition baseline
- `recontent-b13f` ECS service shell
- `recontent-ecs-task-role`
- `ecsTaskExecutionRole`
- `github-actions-recontent-deploy`
- `token.actions.githubusercontent.com` OIDC provider

### RDS

- `database-recontent-login`
- `default-vpc-0d3c7b8a62a167449`
- current MySQL ingress rules on `sg-04ef217e90bcfbc91`

### ALB

- `ecs-gateway-tg-31517754ad4cc3273`
- `ecs-gateway-tg-7669c19ac2ad70b9d`

### CloudWatch

- `/aws/ecs/default/recontent-b13f-d8b6`
- `default/recontent-b13f/RollbackAlarm`
- `recontent/ecs/running-task-count-low`
- `recontent/alb/unhealthy-hosts`
- `recontent-ops` dashboard

## Suggested apply order

Use this order when adopting the phase gradually:

1. Remote backend
2. Shared locals/variables/imports
3. Secrets metadata
4. IAM + OIDC imports
5. RDS instance + subnet group + ingress rules
6. CloudWatch log group + imported rollback alarm
7. ALB target groups
8. ECS task definition
9. ECS service

## Next recommended steps after this phase

1. Move Terraform state to S3 + DynamoDB locking.
2. Replace the broad GitHub deploy managed policies with a tested least-
   privilege policy.
3. Move RDS off the default VPC security group when you are ready to clean up
   database access.
4. Move ECS deploys from "GitHub Actions registers task definitions directly"
   toward a Terraform-owned release model when you are ready to tighten drift.
