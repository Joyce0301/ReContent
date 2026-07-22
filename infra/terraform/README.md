# ReContent Terraform Bootstrap

This directory is the first Terraform slice for ReContent AWS infrastructure.
Right now it manages only:

- the existing ECR repository `recontent`
- the existing GitHub Actions OIDC IAM role `github-actions-recontent-deploy`

It intentionally does **not** manage the current broad policy attachments on the
GitHub deploy role yet. Those permissions still exist in AWS as external/manual
state and should be tightened in a later least-privilege pass before being
codified here.

## Current limitations

- There is **no remote backend yet**. State is still local for now.
- Because state is local, do **not** assume a fresh checkout is safe to apply
  without first reviewing the import plan.
- ECS service, task definition, ALB/target groups, Secrets Manager, CloudWatch
  alarms, and the GitHub OIDC provider
  `token.actions.githubusercontent.com` are still unmanaged and should be
  treated as external prerequisites.

## Bootstrap workflow

From `infra/terraform`:

```bash
terraform init
terraform plan
```

This module includes Terraform `import` blocks, so a new checkout can adopt the
already-existing AWS resources instead of trying to create them from scratch.

## Safe usage rules for now

1. Always run `terraform plan` before `terraform apply`.
2. Use only AWS account `881424867096` in `us-east-1`.
3. Do not delete or hand-edit local state files casually.
4. Treat IAM policy attachments on `github-actions-recontent-deploy` as
   externally managed until least-privilege Terraform is added.

## Next recommended steps

1. Add a remote backend with locking.
2. Codify least-privilege deploy permissions for GitHub Actions.
3. Import and manage Secrets Manager resources.
4. Import and manage ECS service/task definition and ALB health checks.
