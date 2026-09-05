locals {
  common_tags = {
    Project     = "ReContent"
    Environment = "prod"
    ManagedBy   = "Terraform"
  }

  ecs_task_role_arn        = "arn:aws:iam::${var.aws_account_id}:role/recontent-ecs-task-role"
  ecs_execution_role_arn   = "arn:aws:iam::${var.aws_account_id}:role/service-role/ecsTaskExecutionRole"
  ecs_cluster_arn          = "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:cluster/${var.ecs_cluster_name}"
  github_oidc_provider_arn = "arn:aws:iam::${var.aws_account_id}:oidc-provider/${var.github_oidc_provider_url}"

  app_environment = [
    { name = "AVATAR_S3_BUCKET", value = var.avatar_bucket_name },
    { name = "MYSQL_DATABASE", value = var.mysql_database },
    { name = "MYSQL_PORT", value = "3306" },
    { name = "AWS_REGION", value = var.aws_region },
    { name = "MYSQL_SSL_MODE", value = "required" },
    { name = "PORT", value = "80" },
    { name = "KIMI_MODEL", value = "kimi-k3" },
    { name = "MYSQL_HOST", value = var.mysql_host },
  ]

  app_secrets = [
    {
      name      = "AUTH_SESSION_SECRET"
      valueFrom = aws_secretsmanager_secret.auth_session_secret.arn
    },
    {
      name      = "FIRECRAWL_API_KEY"
      valueFrom = "${aws_secretsmanager_secret.firecrawl_api_key.arn}:FIRECRAWL_API_KEY::"
    },
    {
      name      = "KIMI_API_KEY"
      valueFrom = "${aws_secretsmanager_secret.kimi_api_key.arn}:KIMI_API_KEY::"
    },
    {
      name      = "MYSQL_PASSWORD"
      valueFrom = "${var.rds_secret_arn}:password::"
    },
    {
      name      = "MYSQL_USER"
      valueFrom = "${var.rds_secret_arn}:username::"
    },
  ]
}
