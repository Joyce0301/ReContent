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
  });

  it("omits personalized guidance when customInstruction is empty", () => {
    const prompt = buildRepurposeUserPrompt({
      source: "Original source content",
      tone: "formal",
      customInstruction: ""
    });

    expect(prompt).not.toContain("附加个性化要求：");
  });
});
