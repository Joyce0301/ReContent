resource "aws_secretsmanager_secret" "auth_session_secret" {
  name = var.auth_session_secret_name

  tags = merge(local.common_tags, {
    SecretUsage = "auth-session"
  })
}

resource "aws_secretsmanager_secret" "kimi_api_key" {
  name = var.kimi_secret_name

  tags = merge(local.common_tags, {
    SecretUsage = "ai-provider"
  })
}

resource "aws_secretsmanager_secret" "firecrawl_api_key" {
  name        = var.firecrawl_secret_name
  description = "Firecrawl API key for ReContent production"

  tags = merge(local.common_tags, {
    SecretUsage = "content-extraction"
  })
}
