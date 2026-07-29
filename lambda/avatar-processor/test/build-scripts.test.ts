import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");

describe("Lambda ZIP build", () => {
  it("fails clearly before packaging when the Docker daemon is unavailable", async () => {
    await expect(
      execFileAsync("bash", ["scripts/build-zip.sh"], {
        cwd: root,
        env: {
          ...process.env,
          AVATAR_DOCKER_BIN: "/usr/bin/false"
        }
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "Docker daemon is required to build the Lambda ZIP"
      )
    });
  });
});
