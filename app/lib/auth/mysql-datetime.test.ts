import { describe, expect, it } from "vitest";
import {
  formatMysqlUtcDatetime,
  parseMysqlUtcDatetime
} from "./mysql-datetime";

describe("formatMysqlUtcDatetime", () => {
  it("formats dates as MySQL-safe UTC timestamps", () => {
    const formatted = formatMysqlUtcDatetime(
      new Date("2026-07-22T08:09:10.999Z")
    );

    expect(formatted).toBe("2026-07-22 08:09:10");
  });
});

describe("parseMysqlUtcDatetime", () => {
  it("parses a MySQL DATETIME string as UTC", () => {
    expect(
      parseMysqlUtcDatetime("2026-07-26 08:09:10").toISOString()
    ).toBe("2026-07-26T08:09:10.000Z");
  });

  it.each([
    "2026-07-26T08:09:10",
    "2026-02-30 08:09:10",
    "not-a-datetime"
  ])("rejects invalid MySQL DATETIME string %s", (value) => {
    expect(() => parseMysqlUtcDatetime(value)).toThrow(RangeError);
  });
});
