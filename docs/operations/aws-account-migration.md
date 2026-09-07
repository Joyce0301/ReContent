# ReContent AWS account migration

## What Terraform preserves

Terraform preserves the intended configuration of the resources modeled in
`infra/terraform`: IAM roles and policies, ECR repository settings, ECS task
definition/service shape, RDS settings, Secrets Manager secret metadata,
CloudWatch alarms/log retention, ALB target-group health checks, and the
Terraform state backend configuration.

It does not move data or account-owned identifiers by itself. An AWS ARN, VPC,
subnet, security group, KMS key, RDS endpoint, ECS service, ACM certificate,
and public load-balancer hostname will be different in a new account.

The current Terraform directory is an import-first Phase 1 configuration. Its
`imports.tf` contains IDs from account `881424867096`; never run those import
blocks with credentials for the target account.

## Before the old account expires

1. Put Terraform state in the S3 backend and verify that versioning and locking
   work. Keep the bucket in the source account until the target backend is
   bootstrapped.
2. Export the current Terraform state as an encrypted backup:

   ```bash
   terraform -chdir=infra/terraform state pull > recontent-source.tfstate
   chmod 600 recontent-source.tfstate
   ```

   This is a recovery record, not a target-account state file. Do not commit or
   upload it to an unencrypted location.
3. Record the current GitHub Actions variables, DNS records, ACM certificate
   names, RDS snapshot identifier, S3 bucket configuration, ECR image tags, and
   Secrets Manager secret names.

## Target account sequence

1. Create the target account's VPC, subnets, ECS/ALB/RDS security groups, and
   ALB. The current Phase 1 stack expects those network/traffic prerequisites
   to exist.
2. Create a target-account S3 bucket and DynamoDB lock table for Terraform
   state. Use a globally unique bucket name, then copy
   `backend.prod.hcl.example` to a local ignored file with the target bucket.
3. Prepare the target variables:

   ```bash
   cp infra/terraform/target-account.tfvars.example infra/terraform/target-account.tfvars
   ```

   Replace every `<...>` value. The copied file is ignored by the repository.
4. Build a target Terraform directory without the source-account import file:

   ```bash
   rsync -a \
     --exclude='.terraform/' \
     --exclude='*.tfstate*' \
     --exclude='backend.prod.hcl' \
     --exclude='state.tf' \
     --exclude='imports.tf' \
     infra/terraform/ /tmp/recontent-terraform-target/
   cp infra/terraform/target-account.tfvars /tmp/recontent-terraform-target/
   ```

5. Initialize and review the target plan with target credentials:

   ```bash
   terraform -chdir=/tmp/recontent-terraform-target init \
     -backend-config=/path/to/target/backend.hcl
   terraform -chdir=/tmp/recontent-terraform-target validate
   terraform -chdir=/tmp/recontent-terraform-target plan \
     -var-file=target-account.tfvars
   ```

   Apply only after the plan has been reviewed. The first target apply creates
   the new account's IAM/ECR/Secrets metadata/RDS/ECS/CloudWatch resources; the
   state bucket/lock table are bootstrapped separately and old data is not
   copied by Terraform. If the target ECR repository is managed by this stack,
   create it first and push at least one target image tag before starting ECS
   tasks.

## Data and artifact migration

| ReContent dependency | Migration path |
| --- | --- |
| RDS MySQL (`Recontentclient`) | Prefer a final manual RDS snapshot. For an encrypted snapshot, use a customer-managed KMS key that trusts the target account, share the snapshot, copy it in the target account, then restore it into the target VPC. Validate users, schema, and campaign/draft rows before cutover. See [AWS RDS snapshot sharing](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/share-encrypted-snapshot.html). |
| Avatar S3 bucket | Create the target bucket with the same private/encryption/versioning/lifecycle policy, then run a source-to-local-to-target `aws s3 sync` or configure controlled replication. Verify `original/` and `processed/` prefixes. |
| ECR `recontent` images | Configure cross-account ECR replication for future pushes or pull/tag/push the release tags once. Update `container_image` and the GitHub account variables. See [AWS ECR replication](https://docs.aws.amazon.com/AmazonECR/latest/userguide/replication.html). |
| Secrets Manager | Create the target secret containers with Terraform, then copy values through an interactive AWS CLI/SDK procedure. Never put secret values in `.tfvars`, Terraform code, or committed state. Rotate after cutover if the old account may be compromised. |
| GitHub Actions OIDC | Terraform recreates the provider and deploy role. Set repository Variables `AWS_ACCOUNT_ID`, `AWS_REGION`, `AVATAR_S3_BUCKET`, and `AVATAR_ALLOWED_ORIGIN`; update any GitHub environment secrets separately. |
| ALB/ACM/DNS | Recreate the certificate in the target account/region, create the listener and DNS records, then set `AVATAR_ALLOWED_ORIGIN` to the target hostname. |

For an RDS snapshot migration, restore the target instance before the full
Terraform apply, using the same identifier as
`rds_instance_identifier`. Then import that restored instance into the target
state so Terraform adopts it instead of creating an empty database:

```bash
terraform -chdir=/tmp/recontent-terraform-target import \
  -var-file=target-account.tfvars \
  aws_db_instance.recontent database-recontent-login
```

Review the next plan carefully. The restored instance's engine settings must
match the target configuration, or Terraform may propose an in-place change
or replacement. The same import-first principle applies to any target ALB,
target groups, ECS service, or other prerequisite that already exists outside
this Phase 1 stack.

For ECR, create the target `recontent` repository first, then transfer a
known-good image before the ECS service is started:

```bash
aws ecr get-login-password --region "$TARGET_REGION" | \
  docker login --username AWS --password-stdin \
  "$TARGET_ACCOUNT_ID.dkr.ecr.$TARGET_REGION.amazonaws.com"
docker pull "$SOURCE_IMAGE"
docker tag "$SOURCE_IMAGE" \
  "$TARGET_ACCOUNT_ID.dkr.ecr.$TARGET_REGION.amazonaws.com/recontent:$IMAGE_TAG"
docker push \
  "$TARGET_ACCOUNT_ID.dkr.ecr.$TARGET_REGION.amazonaws.com/recontent:$IMAGE_TAG"
```

Set `container_image` to that pushed tag before the full plan/apply.

## Rekognition-specific note

There are currently no Rekognition resources in this repository's Terraform or
application configuration. If the account also contains Rekognition data:

- Face collections are regional and account-owned. Preserve the original S3
  images and re-index them into a target collection; the collection ID/ARN is
  not portable.
- Rekognition Custom Labels model versions can be copied cross-account with
  [`CopyProjectVersion`](https://docs.aws.amazon.com/rekognition/latest/APIReference/API_CopyProjectVersion.html)
  when the source and destination projects are in the same Region and the
  source project policy allows it. The copied model does not include the source
  datasets, so retain or separately migrate those S3 datasets.
- If cross-account model copy is not suitable, recreate the destination project
  and retrain from the preserved dataset. Record the resulting target model ARN
  in the application configuration.

## Cutover checklist

- Target Terraform plan has no source-account ARNs or IDs.
- RDS data checksum/row counts and application login are verified.
- Target secrets are present and ECS can read them.
- A target ECR image starts successfully and `/api/health` is healthy.
- Avatar upload and processing work with the target bucket.
- GitHub Actions deploys using the target role.
- DNS/ACM/allowed-origin values point to the target account.
- Old account resources remain untouched until the target has passed a real
  smoke test and rollback window.
