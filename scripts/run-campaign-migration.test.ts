import { expect, it, vi } from "vitest";
import { runMigration } from "./run-campaign-migration.mjs";
const env = { AWS_REGION: "us-east-1", ECS_CLUSTER: "cluster", ECS_SERVICE: "service", ECS_CONTAINER_NAME: "Main" };
const definition = { family: "app", taskDefinitionArn: "old", containerDefinitions: [{ name: "Main", image: "new-image" }] };
const network = { awsvpcConfiguration: { subnets: ["private-subnet"], securityGroups: ["db-access"], assignPublicIp: "DISABLED" } };

it.each([0, 1, undefined])("only permits deployment after successful migration exit %s", async exitCode => {
  const call = vi.fn().mockResolvedValueOnce({ services: [{ deployments: [{ status: "PRIMARY", networkConfiguration: network }] }] })
    .mockResolvedValueOnce({ taskDefinition: { taskDefinitionArn: "new" } })
    .mockResolvedValueOnce({ tasks: [{ taskArn: "migration" }] })
    .mockResolvedValueOnce({ tasks: [{ lastStatus: "STOPPED", containers: [{ name: "Main", exitCode }] }] });
  const result = runMigration(definition, env, call, vi.fn());
  if (exitCode === 0) await expect(result).resolves.toBeUndefined();
  else await expect(result).rejects.toThrow("Campaign migration failed");
  const registered = JSON.parse(call.mock.calls[1][0].at(-1));
  expect(registered.taskDefinitionArn).toBeUndefined();
  expect(registered.containerDefinitions[0].image).toBe("new-image");
  const run = call.mock.calls[2][0];
  expect(JSON.parse(run[run.indexOf("--network-configuration") + 1])).toEqual(network);
  expect(JSON.parse(run.at(-1)).containerOverrides[0].command).toEqual(["node", "scripts/migrate-campaigns.cjs"]);
});

it("stops a task if verification cannot finish", async () => {
  const call = vi.fn().mockResolvedValueOnce({ services: [{ networkConfiguration: network }] })
    .mockResolvedValueOnce({ taskDefinition: { taskDefinitionArn: "new" } })
    .mockResolvedValueOnce({ tasks: [{ taskArn: "migration" }] })
    .mockResolvedValueOnce({ failures: [{ reason: "missing" }] }).mockResolvedValue({});
  await expect(runMigration(definition, env, call, vi.fn())).rejects.toThrow("status unavailable");
  expect(call.mock.calls.at(-1)?.[0]).toContain("stop-task");
});
