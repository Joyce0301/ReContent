import { describe, expect, it } from "vitest";

import {
  classifyFailure,
  compressCustomInstruction,
  decideRetryPlan
} from "./failure-policy";

describe("classifyFailure", () => {
  it("classifies rate-limit errors as transient", () => {
    const result = classifyFailure({
      error: new Error("Kimi API error (429): quota exceeded")
    });

    expect(result).toEqual({
      kind: "rate_limit",
      failureClass: "transient"
    });
  });

  it("classifies network-style errors as transient", () => {
    const result = classifyFailure({
      error: new Error("connection timed out while waiting for provider")
    });

    expect(result).toEqual({
      kind: "network_timeout",
      failureClass: "transient"
    });
  });

  it("classifies provider 5xx errors as transient", () => {
    const result = classifyFailure({
      error: new Error("OpenAI API error (503): service unavailable")
    });

    expect(result).toEqual({
      kind: "provider_5xx",
      failureClass: "transient"
    });
  });

  it("classifies empty model output as transient", () => {
    const result = classifyFailure({
      rawOutput: ""
    });

    expect(result).toEqual({
      kind: "empty_response",
      failureClass: "transient"
    });
  });

  it("classifies invalid JSON as generation", () => {
    const result = classifyFailure({
      rawOutput: "not-json"
    });

    expect(result).toEqual({
      kind: "invalid_json",
      failureClass: "generation"
    });
  });

  it("classifies invalid schema as generation", () => {
    const result = classifyFailure({
      rawOutput: '{"foo":"bar"}',
      parsedValid: false
    });

    expect(result).toEqual({
      kind: "invalid_schema",
      failureClass: "generation"
    });
  });

  it("classifies empty content as generation", () => {
    const result = classifyFailure({
      rawOutput: '{"results":[{"platform":"twitter","content":""}]}',
      parsedValid: true,
      hasContent: false
    });

    expect(result).toEqual({
      kind: "empty_content",
      failureClass: "generation"
    });
  });
});

describe("compressCustomInstruction", () => {
  it("reduces a long personalized instruction into a compact style summary", () => {
    expect(
      compressCustomInstruction(
        "更像创始人公开发言，但不要太营销，要更克制，也要有一点故事感"
      )
    ).toBe("风格偏创始人口吻，表达克制，弱化营销感，保留少量叙事感");
  });

  it("normalizes whitespace and preserves short instructions", () => {
    expect(compressCustomInstruction("  更有故事感   更克制一些  ")).toBe(
      "更有故事感 更克制一些"
    );
  });

  it("returns an empty string for empty instructions", () => {
    expect(compressCustomInstruction("")).toBe("");
  });
});

describe("decideRetryPlan", () => {
  it("uses same-mode retry for transient failures before conservative mode", () => {
    expect(
      decideRetryPlan({
        attemptCount: 1,
        failureClass: "transient"
      })
    ).toBe("retry_normal");
  });

  it("switches transient failures to conservative mode after the normal retry", () => {
    expect(
      decideRetryPlan({
        attemptCount: 2,
        failureClass: "transient"
      })
    ).toBe("retry_conservative");
  });

  it("switches directly to conservative mode for generation failures", () => {
    expect(
      decideRetryPlan({
        attemptCount: 1,
        failureClass: "generation"
      })
    ).toBe("retry_conservative");
  });

  it("stops after conservative mode has already failed", () => {
    expect(
      decideRetryPlan({
        attemptCount: 3,
        failureClass: "generation"
      })
    ).toBe("stop");
  });
});
