import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";

const exec = promisify(execFile);
async function aws(args) {
  try {
    const { stdout } = await exec("aws", [...args, "--output", "json"], { timeout: 60000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, AWS_PAGER: "" } });
    return JSON.parse(stdout);
  } catch { throw new Error(`AWS ${args[0]} ${args[1]} failed`); }
}

export async function runMigration(taskDefinition, env = process.env, call = aws, pause = setTimeout) {
  for (const key of ["AWS_REGION", "ECS_CLUSTER", "ECS_SERVICE", "ECS_CONTAINER_NAME"]) {
    if (!env[key]) throw new Error(`Missing ${key}`);
  }
  const container = taskDefinition.containerDefinitions?.find(item => item.name === env.ECS_CONTAINER_NAME);
  if (!container?.image) throw new Error("Migration container is missing");
  const serviceResponse = await call(["ecs", "describe-services", "--cluster", env.ECS_CLUSTER, "--services", env.ECS_SERVICE]);
  const service = serviceResponse.services?.[0];
  const network = service?.networkConfiguration ?? service?.deployments?.find(item => item.status === "PRIMARY")?.networkConfiguration;
  if (serviceResponse.failures?.length || !network?.awsvpcConfiguration?.subnets?.length) throw new Error("Service network is unavailable");
  const allowed = ["family", "taskRoleArn", "executionRoleArn", "networkMode", "containerDefinitions", "volumes", "placementConstraints", "requiresCompatibilities", "cpu", "memory", "pidMode", "ipcMode", "proxyConfiguration", "inferenceAccelerators", "ephemeralStorage", "runtimePlatform", "enableFaultInjection"];
  const definition = Object.fromEntries(Object.entries(taskDefinition).filter(([key]) => allowed.includes(key)));
  const registered = await call(["ecs", "register-task-definition", "--cli-input-json", JSON.stringify(definition)]);
  const arn = registered.taskDefinition?.taskDefinitionArn;
  if (!arn) throw new Error("Task definition registration failed");
  const response = await call(["ecs", "run-task", "--cluster", env.ECS_CLUSTER, "--task-definition", arn, "--launch-type", "FARGATE", "--network-configuration", JSON.stringify(network), "--count", "1", "--started-by", "recontent-campaign-migration", "--overrides", JSON.stringify({ containerOverrides: [{ name: env.ECS_CONTAINER_NAME, command: ["node", "scripts/migrate-campaigns.cjs"] }] })]);
  const taskArn = response.tasks?.[0]?.taskArn;
  if (response.failures?.length || !taskArn) throw new Error("Migration task failed to start");
  console.log("Campaign migration task:", taskArn);
  let stopped = false;
  try {
    // ponytail: one bounded deployment task; use a migration job runner if migrations become long-running.
    for (let attempt = 0; attempt < 60; attempt++) {
      const status = await call(["ecs", "describe-tasks", "--cluster", env.ECS_CLUSTER, "--tasks", taskArn]);
      if (status.failures?.length || status.tasks?.length !== 1) throw new Error("Migration task status unavailable");
      const task = status.tasks[0];
      if (task.lastStatus === "STOPPED") {
        stopped = true;
        const result = task.containers?.find(item => item.name === env.ECS_CONTAINER_NAME);
        if (result?.exitCode !== 0) throw new Error("Campaign migration failed; check the task's CloudWatch logs");
        console.log("PASS campaign migration; service deployment may proceed");
        return;
      }
      await pause(10000);
    }
    throw new Error("Campaign migration timed out");
  } finally {
    if (!stopped) await call(["ecs", "stop-task", "--cluster", env.ECS_CLUSTER, "--task", taskArn, "--reason", "Migration verification failed or timed out"]);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runMigration(JSON.parse(await readFile(process.argv[2], "utf8"))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
