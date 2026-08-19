resource "aws_ecs_task_definition" "recontent" {
  family                   = var.ecs_task_family
  task_role_arn            = local.ecs_task_role_arn
  execution_role_arn       = local.ecs_execution_role_arn
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"
  memory                   = "2048"

  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([
    {
      name              = var.ecs_container_name
      image             = var.container_image
      cpu               = 1024
      memory            = 2048
      memoryReservation = 2048
      essential         = true
      environment       = local.app_environment
      secrets           = local.app_secrets
      portMappings = [
        {
          containerPort = 80
          hostPort      = 80
          protocol      = "tcp"
          name          = "main-80-tcp"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.recontent_ecs.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
      mountPoints    = []
      volumesFrom    = []
      systemControls = []
    }
  ])

  tags = local.common_tags
}

resource "aws_ecs_service" "recontent" {
  name                              = var.ecs_service_name
  cluster                           = local.ecs_cluster_arn
  task_definition                   = aws_ecs_task_definition.recontent.arn
  desired_count                     = 1
  health_check_grace_period_seconds = 0

  deployment_controller {
    type = "ECS"
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  alarms {
    alarm_names = [aws_cloudwatch_metric_alarm.recontent_rollback_alarm.alarm_name]
    enable      = true
    rollback    = true
  }

  network_configuration {
    subnets          = var.ecs_service_subnet_ids
    security_groups  = var.ecs_service_security_group_ids
    assign_public_ip = true
  }

  enable_ecs_managed_tags       = true
  propagate_tags                = "SERVICE"
  enable_execute_command        = false
  availability_zone_rebalancing = "ENABLED"

  lifecycle {
    # ponytail: GitHub Actions still registers new task definition revisions out of band.
    # Keep Terraform from fighting the current deploy flow; remove this when deploys move
    # to a Terraform-rendered task-definition pipeline.
    ignore_changes = [task_definition]
  }

  tags = local.common_tags
}
