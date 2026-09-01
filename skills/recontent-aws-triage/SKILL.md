---
name: recontent-aws-triage
description: Use when diagnosing ReContent on AWS, including ECS deployment failures, unhealthy ALB targets, CloudWatch alarms, startup crashes, 4xx or 5xx spikes, suspicious traffic, and RCA requests.
---

# ReContent AWS Triage

Diagnose from the infrastructure edge inward and keep every signal on one timeline. Do not start with random logs.

## Triage Order

1. Confirm the symptom.
2. Check ECS service and recent events.
3. Check task health and restart pattern.
4. Check target group health and ALB health checks.
5. Check CloudWatch metrics and alarms on the same timeline.
6. Check container and app logs.
7. State root cause, evidence, impact, and next action.

## Tools

Prefer AWS MCP:

- `aws___run_script`: multi-step reads, correlation, verification
- `aws___call_aws`: one exact AWS CLI read
- `aws___search_documentation`: only after resource data is collected and AWS behavior remains unclear

## Workflow

### 1. Confirm The Symptom

Classify it as `deploy_failed`, `service_down`, `latency`, `partial_failure`, `startup_failure`, or `alarm_triggered`. Record start time, traffic impact, and whether it followed a deployment.

### 2. Check ECS And Tasks

Read:

- desired/running/pending counts and recent service events
- deployment state, rollback messages, and task definition
- newest stopped task reason, exit code, and restart pattern

Interpretation:

- `unable to place a task`: capacity, network, IAM, or secret retrieval
- `exec format error`: wrong image architecture
- secret retrieval error: execution-role permission or secret ARN
- repeated rotation: port, health path, crash, or dependency configuration

### 3. Check Target Groups And ALB

Read target health, health-check path/port/matcher, listener mapping, and:

- `HTTPCode_Target_5XX_Count`
- `HTTPCode_ELB_5XX_Count`
- `TargetResponseTime`
- `RequestCount`
- `HealthyHostCount`
- `UnHealthyHostCount`

Interpretation:

- running task plus unhealthy target: reachability, port, path, or readiness issue
- healthy target plus user-facing 5xx: application or ALB-side failure
- high ELB 5xx: load-balancer issue or no healthy targets
- high target 5xx: application is reachable but requests are failing

For traffic or 4xx spikes, compare the incident with the previous 7 full days using the same metric, period, statistic, load-balancer dimension, and UTC boundaries. Record daily request totals, 1-minute or 5-minute peaks, target 4xx ratio, ELB 4xx count, duration, and recurrence.

Classify as:

- `normal variation`: close to baseline with a normal error ratio
- `statistical anomaly`: materially above baseline or dominated by 4xx
- `suspected automated scanning`: abrupt repeated bursts with a high 4xx ratio
- `confirmed malicious traffic`: source IP, path, user agent, WAF, or access-log evidence proves it

CloudWatch aggregate metrics alone cannot prove an attack. If ALB access logs are disabled, state that source IP, path, and user agent cannot be reconstructed.

### 4. Align CloudWatch

Use one window across deployments, ECS events, ALB metrics, alarms, and logs: 15 minutes for small incidents, one hour for deployment incidents. An isolated metric is not a root cause until timestamps match. Compare history with the same period and statistic.

### 5. Read Relevant Logs

Read task/container logs for startup failures, application logs for runtime 4xx/5xx, and deployment logs after releases. Check first for Secrets Manager IAM/ARN errors, invalid API keys, database failures, non-200 health checks, and image architecture mismatch.

## Required Output

End with exactly these sections:

- `### Symptom`: one sentence describing what broke
- `### Impact`: all users, some users, or only new deployments
- `### Evidence`: smallest supporting set of events, metrics, or logs
- `### Likely Root Cause`: one or two sentences; say `most likely` and name missing proof when uncertain
- `### Next Action`: one concrete action

## Guardrails

- Do not start with Terraform unless the incident points to infrastructure drift or a recent infrastructure change.
- Do not claim a root cause without a matching event, metric, or log.
- Do not recommend rollback before identifying whether the issue is code, configuration, secret, IAM, health check, or deployment wiring.
- Do not edit or delete AWS-managed target-tracking alarms.

## Example Prompt

```text
Use recontent-aws-triage to diagnose ReContent on AWS. Follow ECS -> tasks -> target groups/ALB -> CloudWatch -> logs. End with Symptom, Impact, Evidence, Likely Root Cause, and Next Action.
```
