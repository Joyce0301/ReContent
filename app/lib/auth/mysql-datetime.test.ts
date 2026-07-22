import { describe, expect, it } from "vitest";
import { formatMysqlUtcDatetime } from "./mysql-datetime";

describe("formatMysqlUtcDatetime", () => {
  it("formats dates as MySQL-safe UTC timestamps", () => {
    const formatted = formatMysqlUtcDatetime(
      new Date("2026-07-22T08:09:10.999Z")
    );

    expect(formatted).toBe("2026-07-22 08:09:10");
  });
});
