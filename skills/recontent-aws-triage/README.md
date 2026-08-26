# ReContent AWS Triage Skill

Reusable troubleshooting workflow for ReContent running on AWS ECS, ALB, and CloudWatch.

## Install

```bash
mkdir -p ~/.codex/skills
cp -R skills/recontent-aws-triage ~/.codex/skills/
```

Restart Codex after installation so the skill is discovered.

## Trigger

```text
Use recontent-aws-triage to investigate the current ReContent AWS incident.
```

The workflow checks:

```text
symptom -> ECS service -> tasks -> target groups/ALB -> CloudWatch -> logs -> RCA
```

AWS MCP is preferred when available. The skill does not install AWS credentials, create GitHub Actions, or change CI/CD.
