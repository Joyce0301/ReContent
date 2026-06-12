export type FailureKind =
  | "network_timeout"
  | "rate_limit"
  | "provider_5xx"
  | "empty_response"
  | "invalid_json"
  | "invalid_schema"
  | "empty_content";

export type FailureClass = "transient" | "generation";

export type FailureInfo = {
  kind: FailureKind;
  failureClass: FailureClass;
};

export type RetryDecision = "retry_normal" | "retry_conservative" | "stop";
export type RetryMode = "normal" | "conservative";

type ClassifyFailureInput = {
  error?: unknown;
  rawOutput?: string | null;
  parsedValid?: boolean;
  hasContent?: boolean;
};

type DecideRetryPlanInput = {
  attemptCount: number;
  currentMode?: RetryMode;
  failureClass: FailureClass;
};

const MAX_COMPRESSED_INSTRUCTION_LENGTH = 60;
const SHORT_INSTRUCTION_PRESERVE_LENGTH = 20;
const PROVIDER_5XX_PATTERN = /(?:^|[^0-9a-z])(500|502|503|504)(?:$|[^0-9a-z])/i;
const EMPTY_RESPONSE_PATTERNS = ["返回为空", "returned empty", "empty response"];

export function classifyFailure(input: ClassifyFailureInput): FailureInfo {
  const message =
    input.error instanceof Error ? input.error.message.toLowerCase() : "";

  if (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("quota")
  ) {
    return { kind: "rate_limit", failureClass: "transient" };
  }

  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("connection error") ||
    message.includes("connection reset") ||
    message.includes("econnreset") ||
    message.includes("network")
  ) {
    return { kind: "network_timeout", failureClass: "transient" };
  }

  if (
    PROVIDER_5XX_PATTERN.test(message)
  ) {
    return { kind: "provider_5xx", failureClass: "transient" };
  }

  if (EMPTY_RESPONSE_PATTERNS.some(pattern => message.includes(pattern))) {
    return { kind: "empty_response", failureClass: "transient" };
  }

  if (input.rawOutput === null) {
    return { kind: "empty_response", failureClass: "transient" };
  }

  if (typeof input.rawOutput === "string" && input.rawOutput.trim().length === 0) {
    return { kind: "empty_response", failureClass: "transient" };
  }

  if (input.parsedValid === false) {
    return { kind: "invalid_schema", failureClass: "generation" };
  }

  if (input.hasContent === false) {
    return { kind: "empty_content", failureClass: "generation" };
  }

  return { kind: "invalid_json", failureClass: "generation" };
}

export function compressCustomInstruction(input: string): string {
  const normalized = input.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "";
  }

  if (countCodePoints(normalized) <= SHORT_INSTRUCTION_PRESERVE_LENGTH) {
    return normalized;
  }

  const hasNegatedFounder = includesNegatedFounderCue(normalized);
  const hasNegatedStory = includesNegatedStoryCue(normalized);

  if (hasNegatedFounder || hasNegatedStory) {
    return truncateByCodePoints(normalized, MAX_COMPRESSED_INSTRUCTION_LENGTH);
  }

  const parts: string[] = [];

  if (normalized.includes("创始人")) {
    parts.push("风格偏创始人口吻");
  }

  if (includesNegatedPhrase(normalized, "克制")) {
    parts.push("不要过度克制");
  } else if (normalized.includes("克制")) {
    parts.push("表达克制");
  }

  if (includesStrongPreference(normalized, "营销感")) {
    parts.push("保留营销张力");
  } else if (normalized.includes("营销")) {
    parts.push("弱化营销感");
  }

  if (normalized.includes("故事") || normalized.includes("叙事")) {
    parts.push("保留少量叙事感");
  }

  if (parts.length > 0) {
    return parts.join("，");
  }

  if (countCodePoints(normalized) <= MAX_COMPRESSED_INSTRUCTION_LENGTH) {
    return normalized;
  }

  return truncateByCodePoints(normalized, MAX_COMPRESSED_INSTRUCTION_LENGTH);
}

export function decideRetryPlan(input: DecideRetryPlanInput): RetryDecision {
  const currentMode = input.currentMode ?? "normal";

  if (currentMode === "conservative") {
    return "stop";
  }

  if (input.attemptCount >= 3) {
    return "stop";
  }

  if (input.failureClass === "transient") {
    return input.attemptCount === 1 ? "retry_normal" : "retry_conservative";
  }

  return "retry_conservative";
}

function includesNegatedPhrase(input: string, keyword: string) {
  return input.includes(`不要${keyword}`) || input.includes(`别${keyword}`);
}

function includesNegatedFounderCue(input: string) {
  return (
    input.includes("不要像创始人") ||
    input.includes("别像创始人") ||
    input.includes("不要创始人口吻") ||
    input.includes("别创始人口吻")
  );
}

function includesNegatedStoryCue(input: string) {
  return (
    input.includes("不要故事") ||
    input.includes("别故事") ||
    input.includes("不要故事化") ||
    input.includes("别故事化") ||
    input.includes("不要叙事") ||
    input.includes("别叙事")
  );
}

function includesStrongPreference(input: string, keyword: string) {
  return (
    input.includes(`${keyword}要强`) ||
    input.includes(`更${keyword}`) ||
    input.includes(`${keyword}更强`)
  );
}

function truncateByCodePoints(input: string, maxCodePoints: number) {
  const codePoints = Array.from(input);

  if (codePoints.length <= maxCodePoints) {
    return input;
  }

  return `${codePoints.slice(0, maxCodePoints).join("").trim()}...`;
}

function countCodePoints(input: string) {
  return Array.from(input).length;
}
