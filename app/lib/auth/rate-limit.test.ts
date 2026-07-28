import { describe, expect, it } from "vitest";

import { consumeRateLimit } from "./rate-limit";

describe("consumeRateLimit bucket isolation", () => {
  it("does not let an exhausted upload-intent bucket consume dry-run quota", () => {
    const key = "bucket-isolation-user";
    const input = {
      key,
      windowMs: 10 * 60 * 1000
    };

    for (let count = 0; count < 5; count += 1) {
      expect(
        consumeRateLimit({
          ...input,
          bucket: "avatar-upload-intent",
          max: 5
        }).ok
      ).toBe(true);
    }

    expect(
      consumeRateLimit({
        ...input,
        bucket: "avatar-upload-intent",
        max: 5
      }).ok
    ).toBe(false);
    expect(
      consumeRateLimit({
        ...input,
        bucket: "avatar-upload-dry-run",
        max: 20
      }).ok
    ).toBe(true);
  });
});
