data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

resource "aws_iam_role" "github_actions_deploy" {
  name        = "github-actions-recontent-deploy"
  description = "Role assumed by GitHub Actions to build and deploy ReContent to ECR and ECS"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github_actions.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:Joyce0301/ReContent:ref:refs/heads/main"
          }
        }
      }
    ]
  })
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://${var.github_oidc_provider_url}"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = var.github_oidc_thumbprints
}

resource "aws_iam_role" "recontent_ecs_task" {
  name        = "recontent-ecs-task-role"
  description = "Application task role for ReContent ECS tasks"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role" "ecs_task_execution" {
  name        = "ecsTaskExecutionRole"
  path        = "/service-role/"
  description = "Allows access to other AWS service resources that are required to run Amazon ECS tasks."

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = var.aws_account_id
          }
          ArnEquals = {
            "aws:SourceArn" = "arn:aws:ecs:*:${var.aws_account_id}:*"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "github_actions_deploy_preflight_read" {
  name = "recontent-avatar-deployment-preflight-read"
  role = aws_iam_role.github_actions_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "DescribeProductionService"
        Effect   = "Allow"
        Action   = "ecs:DescribeServices"
        Resource = "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:service/${var.ecs_cluster_name}/${var.ecs_service_name}"
      },
      {
        Sid      = "DescribeTaskDefinitions"
        Effect   = "Allow"
        Action   = "ecs:DescribeTaskDefinition"
        Resource = "*"
      },
      {
        Sid    = "InspectAvatarBucket"
        Effect = "Allow"
        Action = [
          "s3:GetBucketPublicAccessBlock",
          "s3:GetBucketCors",
          "s3:GetLifecycleConfiguration",
          "s3:GetBucketOwnershipControls",
          "s3:GetEncryptionConfiguration",
        ]
        Resource = "arn:aws:s3:::${var.avatar_bucket_name}"
      },
      {
        Sid    = "InspectDeploymentRoles"
        Effect = "Allow"
        Action = [
          "iam:GetRolePolicy",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
        ]
        Resource = [
          aws_iam_role.recontent_ecs_task.arn,
          aws_iam_role.github_actions_deploy.arn,
        ]
      },
      {
        Sid    = "InspectAttachedManagedPolicies"
        Effect = "Allow"
        Action = [
          "iam:GetPolicy",
          "iam:GetPolicyVersion",
        ]
        Resource = [
          "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser",
          "arn:aws:iam::aws:policy/AmazonEC2FullAccess",
          "arn:aws:iam::aws:policy/AmazonECS_FullAccess",
        ]
      },
      {
        Sid      = "SimulateAvatarTaskRole"
        Effect   = "Allow"
        Action   = "iam:SimulatePrincipalPolicy"
        Resource = aws_iam_role.recontent_ecs_task.arn
      },
    ]
  })
}

resource "aws_iam_role_policy" "recontent_ecs_task_avatar_access" {
  name = "recontent-avatar-originals-access"
  role = aws_iam_role.recontent_ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "UploadOriginalAvatars"
        Effect = "Allow"
        Action = ["s3:PutObject"]
        Resource = [
          "arn:aws:s3:::${var.avatar_bucket_name}/original/*"
        ]
      },
      {
        Sid    = "VerifyOriginalAvatarUploads"
        Effect = "Allow"
        Action = ["s3:GetObject"]
        Resource = [
          "arn:aws:s3:::${var.avatar_bucket_name}/original/*"
        ]
      },
      {
        Sid      = "ListOriginalAvatarObjects"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = ["arn:aws:s3:::${var.avatar_bucket_name}"]
        Condition = {
          StringLike = {
            "s3:prefix" = ["original/*"]
          }
        }
      },
    ]
  })
}

resource "aws_iam_role_policy" "ecs_execution_read_recontent_secrets" {
  name = "allow-read-recontent-secrets"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "AllowReadRecontentSecrets"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = "*"
      },
      {
        Sid      = "AllowDecryptSecretsManagerKms"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = "*"
      },
    ]
  })
}

resource "aws_iam_role_policy" "ecs_execution_read_kimi_secret" {
  name = "allow-read-recontent-kimi-secret"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "AllowReadKimiSecret"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = "${aws_secretsmanager_secret.kimi_api_key.arn}*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_basic" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy_attachment" "github_actions_ecr_power_user" {
  role       = aws_iam_role.github_actions_deploy.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser"
}

resource "aws_iam_role_policy_attachment" "github_actions_ec2_full_access" {
  role       = aws_iam_role.github_actions_deploy.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2FullAccess"
}

resource "aws_iam_role_policy_attachment" "github_actions_ecs_full_access" {
  role       = aws_iam_role.github_actions_deploy.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonECS_FullAccess"
}
