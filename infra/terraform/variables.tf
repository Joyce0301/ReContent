variable "aws_region" {
  description = "AWS region for all ReContent production resources."
  type        = string
  default     = "us-east-1"
}

variable "aws_account_id" {
  description = "AWS account ID that owns the ReContent production resources."
  type        = string
  default     = "881424867096"
}

variable "terraform_state_bucket_name" {
  description = "S3 bucket name to store Terraform state for ReContent."
  type        = string
  default     = "recontent-terraform-state-881424867096-us-east-1"
}

variable "terraform_lock_table_name" {
  description = "DynamoDB table name used for Terraform state locking."
  type        = string
  default     = "recontent-terraform-locks"
}

variable "ecs_cluster_name" {
  description = "Existing ECS cluster name."
  type        = string
  default     = "default"
}

variable "ecs_service_name" {
  description = "Existing ECS service name."
  type        = string
  default     = "recontent-b13f"
}

variable "ecs_task_family" {
  description = "Existing ECS task definition family name."
  type        = string
  default     = "default-recontent-b13f"
}

variable "ecs_container_name" {
  description = "Application container name inside the ECS task definition."
  type        = string
  default     = "Main"
}

variable "container_image" {
  description = "Container image string to pin in the Terraform-managed task definition baseline."
  type        = string
  default     = "881424867096.dkr.ecr.us-east-1.amazonaws.com/recontent:sha-35cce37b"
}

variable "vpc_id" {
  description = "VPC used by the production ALB and ECS service."
  type        = string
  default     = "vpc-0d3c7b8a62a167449"
}

variable "default_vpc_security_group_id" {
  description = "Default VPC security group currently attached to the RDS instance."
  type        = string
  default     = "sg-04ef217e90bcfbc91"
}

variable "mysql_test_ec2_security_group_id" {
  description = "Temporary EC2 security group currently allowed to reach the database."
  type        = string
  default     = "sg-099155fbfe1b16f74"
}

variable "temporary_mysql_admin_cidr" {
  description = "Temporary personal CIDR currently allowed to reach the database."
  type        = string
  default     = "212.107.29.195/32"
}

variable "alb_arn" {
  description = "Production ALB ARN created by ECS Express."
  type        = string
  default     = "arn:aws:elasticloadbalancing:us-east-1:881424867096:loadbalancer/app/ecs-express-gateway-alb-fb68325c/39be7414652fcb27"
}

variable "alb_arn_suffix" {
  description = "Production ALB ARN suffix used in CloudWatch metrics."
  type        = string
  default     = "app/ecs-express-gateway-alb-fb68325c/39be7414652fcb27"
}

variable "target_group_blue_arn" {
  description = "Blue target group ARN used by ECS deployment traffic shifting."
  type        = string
  default     = "arn:aws:elasticloadbalancing:us-east-1:881424867096:targetgroup/ecs-gateway-tg-31517754ad4cc3273/3ac509cb89717160"
}

variable "target_group_blue_arn_suffix" {
  description = "Blue target group ARN suffix used in CloudWatch metrics."
  type        = string
  default     = "targetgroup/ecs-gateway-tg-31517754ad4cc3273/3ac509cb89717160"
}

variable "target_group_green_arn" {
  description = "Green target group ARN used by ECS deployment traffic shifting."
  type        = string
  default     = "arn:aws:elasticloadbalancing:us-east-1:881424867096:targetgroup/ecs-gateway-tg-7669c19ac2ad70b9d/09933de844ad4a94"
}

variable "target_group_green_arn_suffix" {
  description = "Green target group ARN suffix used in CloudWatch metrics."
  type        = string
  default     = "targetgroup/ecs-gateway-tg-7669c19ac2ad70b9d/09933de844ad4a94"
}

variable "ecs_service_subnet_ids" {
  description = "Subnet IDs currently attached to the ECS service."
  type        = list(string)
  default = [
    "subnet-029c04b235117ecc3",
    "subnet-0657c5fddad2db608",
    "subnet-08ac1525cf7d3531c",
    "subnet-0b6a59fc32f22602b",
    "subnet-002687b4d5c6a2c1f",
    "subnet-0a40d0fdbc2150334",
  ]
}

variable "ecs_service_security_group_ids" {
  description = "Security groups currently attached to the ECS service ENIs."
  type        = list(string)
  default     = ["sg-0d88b2af36f255ed8"]
}

variable "alb_security_group_id" {
  description = "Security group currently attached to the production ALB."
  type        = string
  default     = "sg-0ce10fd6364d4b8b8"
}

variable "avatar_bucket_name" {
  description = "S3 bucket used by avatar upload processing."
  type        = string
  default     = "recontent-avatar-pipeline-20260726"
}

variable "ecs_log_group_name" {
  description = "CloudWatch log group for the ECS application container."
  type        = string
  default     = "/aws/ecs/default/recontent-b13f-d8b6"
}

variable "ecs_log_retention_days" {
  description = "Retention period for the ECS application log group."
  type        = number
  default     = 30
}

variable "mysql_host" {
  description = "Current production MySQL host value wired into ECS."
  type        = string
  default     = "database-recontent-login.cq3q6wayumqz.us-east-1.rds.amazonaws.com"
}

variable "rds_instance_identifier" {
  description = "Existing production RDS instance identifier."
  type        = string
  default     = "database-recontent-login"
}

variable "rds_db_subnet_group_name" {
  description = "Existing production DB subnet group name."
  type        = string
  default     = "default-vpc-0d3c7b8a62a167449"
}

variable "mysql_database" {
  description = "Current production MySQL database name wired into ECS."
  type        = string
  default     = "Recontentclient"
}

variable "rds_master_username" {
  description = "Current production RDS master username."
  type        = string
  default     = "admin"
}

variable "rds_master_user_secret_kms_key_id" {
  description = "KMS key currently used by the RDS-managed master user secret."
  type        = string
  default     = "arn:aws:kms:us-east-1:881424867096:key/bf0d109a-cca3-4dd2-aff3-a45f5d8aaa47"
}

variable "rds_storage_kms_key_id" {
  description = "KMS key currently used to encrypt the RDS storage volume."
  type        = string
  default     = "arn:aws:kms:us-east-1:881424867096:key/cfd97f89-cfcf-4612-9780-7f1c0692b143"
}

variable "rds_monitoring_role_arn" {
  description = "IAM role currently attached for RDS enhanced monitoring."
  type        = string
  default     = "arn:aws:iam::881424867096:role/rds-monitoring-role"
}

variable "auth_session_secret_name" {
  description = "Secrets Manager secret name for auth session signing."
  type        = string
  default     = "recontent/AUTH_SESSION_SECRET"
}

variable "kimi_secret_name" {
  description = "Secrets Manager secret name for Kimi API access."
  type        = string
  default     = "recontent/KIMI_API_KEY"
}

variable "firecrawl_secret_name" {
  description = "Secrets Manager secret name for Firecrawl API access."
  type        = string
  default     = "recontent/FIRECRAWL_API_KEY"
}

variable "rds_secret_arn" {
  description = "RDS-managed secret ARN that currently stores MySQL username/password."
  type        = string
  default     = "arn:aws:secretsmanager:us-east-1:881424867096:secret:rds!db-29685199-ab29-48db-9385-8b281ca65cc0-Rw2bW6"
}

variable "github_oidc_provider_url" {
  description = "Existing GitHub Actions OIDC provider URL."
  type        = string
  default     = "token.actions.githubusercontent.com"
}

variable "github_oidc_thumbprints" {
  description = "Current GitHub Actions OIDC thumbprints configured in AWS IAM."
  type        = list(string)
  default     = ["ab9d0263244dd0326eb67015705a667e79cfe998"]
}
