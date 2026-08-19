import {
  to = aws_s3_bucket.terraform_state
  id = "recontent-terraform-state-881424867096-us-east-1"
}

import {
  to = aws_s3_bucket_versioning.terraform_state
  id = "recontent-terraform-state-881424867096-us-east-1"
}

import {
  to = aws_s3_bucket_server_side_encryption_configuration.terraform_state
  id = "recontent-terraform-state-881424867096-us-east-1"
}

import {
  to = aws_s3_bucket_public_access_block.terraform_state
  id = "recontent-terraform-state-881424867096-us-east-1"
}

import {
  to = aws_dynamodb_table.terraform_lock
  id = "recontent-terraform-locks"
}

import {
  to = aws_ecr_repository.recontent
  id = "recontent"
}

import {
  to = aws_iam_role.github_actions_deploy
  id = "github-actions-recontent-deploy"
}

import {
  to = aws_iam_openid_connect_provider.github_actions
  id = "arn:aws:iam::881424867096:oidc-provider/token.actions.githubusercontent.com"
}

import {
  to = aws_iam_role.recontent_ecs_task
  id = "recontent-ecs-task-role"
}

import {
  to = aws_iam_role.ecs_task_execution
  id = "ecsTaskExecutionRole"
}

import {
  to = aws_iam_role_policy.github_actions_deploy_preflight_read
  id = "github-actions-recontent-deploy:recontent-avatar-deployment-preflight-read"
}

import {
  to = aws_iam_role_policy.recontent_ecs_task_avatar_access
  id = "recontent-ecs-task-role:recontent-avatar-originals-access"
}

import {
  to = aws_iam_role_policy.ecs_execution_read_recontent_secrets
  id = "ecsTaskExecutionRole:allow-read-recontent-secrets"
}

import {
  to = aws_iam_role_policy.ecs_execution_read_kimi_secret
  id = "ecsTaskExecutionRole:allow-read-recontent-kimi-secret"
}

import {
  to = aws_iam_role_policy_attachment.ecs_execution_basic
  id = "ecsTaskExecutionRole/arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

import {
  to = aws_iam_role_policy_attachment.github_actions_ecr_power_user
  id = "github-actions-recontent-deploy/arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser"
}

import {
  to = aws_iam_role_policy_attachment.github_actions_ec2_full_access
  id = "github-actions-recontent-deploy/arn:aws:iam::aws:policy/AmazonEC2FullAccess"
}

import {
  to = aws_iam_role_policy_attachment.github_actions_ecs_full_access
  id = "github-actions-recontent-deploy/arn:aws:iam::aws:policy/AmazonECS_FullAccess"
}

import {
  to = aws_secretsmanager_secret.kimi_api_key
  id = "arn:aws:secretsmanager:us-east-1:881424867096:secret:recontent/KIMI_API_KEY-k086S9"
}

import {
  to = aws_secretsmanager_secret.firecrawl_api_key
  id = "arn:aws:secretsmanager:us-east-1:881424867096:secret:recontent/FIRECRAWL_API_KEY-eLqkv1"
}

import {
  to = aws_secretsmanager_secret.auth_session_secret
  id = "arn:aws:secretsmanager:us-east-1:881424867096:secret:recontent/AUTH_SESSION_SECRET-VSfZI9"
}

import {
  to = aws_lb_target_group.recontent_blue
  id = "arn:aws:elasticloadbalancing:us-east-1:881424867096:targetgroup/ecs-gateway-tg-31517754ad4cc3273/3ac509cb89717160"
}

import {
  to = aws_lb_target_group.recontent_green
  id = "arn:aws:elasticloadbalancing:us-east-1:881424867096:targetgroup/ecs-gateway-tg-7669c19ac2ad70b9d/09933de844ad4a94"
}

import {
  to = aws_cloudwatch_log_group.recontent_ecs
  id = "/aws/ecs/default/recontent-b13f-d8b6"
}

import {
  to = aws_cloudwatch_metric_alarm.recontent_rollback_alarm
  id = "default/recontent-b13f/RollbackAlarm"
}

import {
  to = aws_db_subnet_group.recontent
  id = "default-vpc-0d3c7b8a62a167449"
}

import {
  to = aws_vpc_security_group_ingress_rule.rds_mysql_from_ecs
  id = "sgr-0a8566fb582c4b66d"
}

import {
  to = aws_vpc_security_group_ingress_rule.rds_mysql_from_test_ec2
  id = "sgr-04f321c5f5787f128"
}

import {
  to = aws_vpc_security_group_ingress_rule.rds_mysql_from_temp_cidr
  id = "sgr-0e38f1de723bd7121"
}

import {
  to = aws_db_instance.recontent
  id = "database-recontent-login"
}

import {
  to = aws_ecs_task_definition.recontent
  id = "arn:aws:ecs:us-east-1:881424867096:task-definition/default-recontent-b13f:35"
}

import {
  to = aws_ecs_service.recontent
  id = "default/recontent-b13f"
}
