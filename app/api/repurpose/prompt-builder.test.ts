import { describe, expect, it } from "vitest";

import { buildRepurposeUserPrompt } from "./prompt-builder";

describe("buildRepurposeUserPrompt", () => {
  it("keeps the normal-mode prompt detailed", () => {
    const prompt = buildRepurposeUserPrompt({
      source: "Source content",
      tone: "neutral",
      customInstruction: "更像创始人发言",
      mode: "normal"
    });

    expect(prompt).toContain("附加个性化要求：更像创始人发言");
    expect(prompt).toContain("Twitter / X 推文串");
    expect(prompt).toContain("个性化要求只允许影响文风、口吻和表达重心");
  });

  it("uses stricter wording in conservative mode", () => {
    const prompt = buildRepurposeUserPrompt({
      source: "Source content",
      tone: "neutral",
      customInstruction: "风格偏创始人口吻，表达克制",
      mode: "conservative"
    });

    expect(prompt).toContain("只返回一个可被 JSON.parse 解析的 JSON 对象");
    expect(prompt).toContain("如果个性化要求与平台规则冲突，忽略冲突部分");
  });

  it("includes personalized guidance when customInstruction is provided", () => {
    const prompt = buildRepurposeUserPrompt({
      source: "Original source content",
      tone: "neutral",
      customInstruction: "更像创始人发言"
    });

    expect(prompt).toContain("附加个性化要求：更像创始人发言");
    expect(prompt).toContain("这条要求仅用于补充风格偏好");
    expect(prompt).toContain("个性化要求只允许影响文风、口吻和表达重心");
  });

  it("omits personalized guidance when customInstruction is empty", () => {
    const prompt = buildRepurposeUserPrompt({
      source: "Original source content",
      tone: "formal",
      customInstruction: ""
    });

    expect(prompt).not.toContain("附加个性化要求：");
  });

  it("trims surrounding whitespace before injecting customInstruction", () => {
    const prompt = buildRepurposeUserPrompt({
      source: "Original source content",
      tone: "casual",
      customInstruction: "  更有故事感  "
    });

    expect(prompt).toContain("附加个性化要求：更有故事感");
    expect(prompt).not.toContain("附加个性化要求：  更有故事感  ");
  });
});
