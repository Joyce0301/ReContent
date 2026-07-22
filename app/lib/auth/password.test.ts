import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password helpers", () => {
  it("hashes and verifies a valid password", async () => {
    const passwordHash = await hashPassword("super-secret-123");

    await expect(verifyPassword("super-secret-123", passwordHash)).resolves.toBe(
      true
    );
    await expect(verifyPassword("wrong-password", passwordHash)).resolves.toBe(
      false
    );
  });
});
