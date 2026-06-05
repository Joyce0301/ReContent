import { describe, expect, it } from "vitest";

import { buildRepurposeUserPrompt } from "./prompt-builder";

describe("buildRepurposeUserPrompt", () => {
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
