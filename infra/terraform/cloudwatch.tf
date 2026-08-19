resource "aws_cloudwatch_log_group" "recontent_ecs" {
  name              = var.ecs_log_group_name
  retention_in_days = var.ecs_log_retention_days

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "recontent_rollback_alarm" {
  alarm_name          = "default/recontent-b13f/RollbackAlarm"
  alarm_description   = "Rate of 4XX and 5XX errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "m0_4xx"
    return_data = false
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_Target_4XX_Count"
      period      = 60
      stat        = "Sum"
      dimensions = {
        TargetGroup  = var.target_group_blue_arn_suffix
        LoadBalancer = var.alb_arn_suffix
      }
    }
  }

  metric_query {
    id          = "m0_5xx"
    return_data = false
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_Target_5XX_Count"
      period      = 60
      stat        = "Sum"
      dimensions = {
        TargetGroup  = var.target_group_blue_arn_suffix
        LoadBalancer = var.alb_arn_suffix
      }
    }
  }

  metric_query {
    id          = "m0_total"
    return_data = false
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "RequestCountPerTarget"
      period      = 60
      stat        = "Sum"
      dimensions = {
        TargetGroup  = var.target_group_blue_arn_suffix
        LoadBalancer = var.alb_arn_suffix
      }
    }
  }

  metric_query {
    id          = "em0"
    expression  = "100 * (IF(m0_4xx < 5, 0, m0_4xx) + m0_5xx) / FILL(m0_total, 1)"
    label       = "Sum of 4XX and 5XX errors percentage for blue target group"
    return_data = false
  }

  metric_query {
    id          = "m1_4xx"
    return_data = false
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_Target_4XX_Count"
      period      = 60
      stat        = "Sum"
      dimensions = {
        TargetGroup  = var.target_group_green_arn_suffix
        LoadBalancer = var.alb_arn_suffix
      }
    }
  }

  metric_query {
    id          = "m1_5xx"
    return_data = false
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_Target_5XX_Count"
      period      = 60
      stat        = "Sum"
      dimensions = {
        TargetGroup  = var.target_group_green_arn_suffix
        LoadBalancer = var.alb_arn_suffix
      }
    }
  }

  metric_query {
    id          = "m1_total"
    return_data = false
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "RequestCountPerTarget"
      period      = 60
      stat        = "Sum"
      dimensions = {
        TargetGroup  = var.target_group_green_arn_suffix
        LoadBalancer = var.alb_arn_suffix
      }
    }
  }

  metric_query {
    id          = "em1"
    expression  = "100 * (IF(m1_4xx < 5, 0, m1_4xx) + m1_5xx) / FILL(m1_total, 1)"
    label       = "Sum of 4XX and 5XX errors percentage for green target group"
    return_data = false
  }

  metric_query {
    id          = "e"
    expression  = "MAX([em0, em1])"
    label       = "Sum of 4XX and 5XX errors percentage"
    return_data = true
  }
}

resource "aws_cloudwatch_metric_alarm" "recontent_running_tasks_low" {
  alarm_name          = "recontent/ecs/running-task-count-low"
  alarm_description   = "ReContent ECS service is running fewer than 1 task."
  namespace           = "AWS/ECS"
  metric_name         = "RunningTaskCount"
  statistic           = "Average"
  period              = 60
  evaluation_periods  = 3
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.ecs_service_name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "recontent_unhealthy_hosts" {
  alarm_name          = "recontent/alb/unhealthy-hosts"
  alarm_description   = "ReContent ALB target groups have unhealthy hosts."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 0
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "blue"
    return_data = false
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "UnHealthyHostCount"
      period      = 60
      stat        = "Maximum"
      dimensions = {
        TargetGroup  = var.target_group_blue_arn_suffix
        LoadBalancer = var.alb_arn_suffix
      }
    }
  }

  metric_query {
    id          = "green"
    return_data = false
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "UnHealthyHostCount"
      period      = 60
      stat        = "Maximum"
      dimensions = {
        TargetGroup  = var.target_group_green_arn_suffix
        LoadBalancer = var.alb_arn_suffix
      }
    }
  }

  metric_query {
    id          = "total"
    expression  = "MAX([blue, green])"
    label       = "Max unhealthy hosts across ReContent target groups"
    return_data = true
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_dashboard" "recontent_ops" {
  dashboard_name = "recontent-ops"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "ECS CPU and Memory"
          region  = var.aws_region
          view    = "timeSeries"
          stacked = false
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_service_name],
            [".", "MemoryUtilization", ".", ".", ".", "."],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "ALB Response Health"
          region = var.aws_region
          view   = "timeSeries"
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", var.alb_arn_suffix, "TargetGroup", var.target_group_blue_arn_suffix],
            [".", "HTTPCode_Target_5XX_Count", ".", ".", ".", "."],
            [".", "HTTPCode_Target_4XX_Count", ".", ".", ".", "."],
          ]
        }
      },
    ]
  })
}
