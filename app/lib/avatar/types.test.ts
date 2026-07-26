import { describe, expect, it } from "vitest";
import { normalizeAvatarStatus } from "./types";

describe("normalizeAvatarStatus", () => {
  it.each([
    "not_uploaded",
    "pending_upload",
    "ready",
    "failed"
  ] as const)("keeps the known status %s", (status) => {
    expect(normalizeAvatarStatus(status)).toBe(status);
  });

  it.each([null, undefined, "", "uploading", 42, {}])(
    "maps unknown value %j to not_uploaded",
    (status) => {
      expect(normalizeAvatarStatus(status)).toBe("not_uploaded");
    }
  );
});
