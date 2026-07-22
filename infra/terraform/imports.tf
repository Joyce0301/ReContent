import {
  to = aws_ecr_repository.recontent
  id = "recontent"
}

import {
  to = aws_iam_role.github_actions_deploy
  id = "github-actions-recontent-deploy"
}
