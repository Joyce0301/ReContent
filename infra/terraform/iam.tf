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
          Federated = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = [
              "repo:Joyce0301/ReContent:ref:refs/heads/main"
            ]
          }
        }
      }
    ]
  })
}
