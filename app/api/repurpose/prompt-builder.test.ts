import { describe, expect, it } from "vitest";

import { buildRepurposeUserPrompt } from "./prompt-builder";

describe("buildRepurposeUserPrompt", () => {
  it("keeps the normal-mode prompt detailed", () => {
    const prompt = buildRepurposeUserPrompt({
      source: "Source content",
      tone: "neutral",
      platform: "twitter",
      customInstruction: "更像创始人发言",
      mode: "normal"
    });

    expect(prompt).toContain("附加个性化要求：更像创始人发言");
    expect(prompt).toContain("Twitter / X 推文串");
    expect(prompt).not.toContain("LinkedIn 帖子：1 篇 800-1500 字左右的长帖");
    expect(prompt).toContain("个性化要求只允许影响文风、口吻和表达重心");
  });

  it("uses stricter wording in conservative mode", () => {
    const prompt = buildRepurposeUserPrompt({
      source: "Source content",
      tone: "neutral",
      platform: "xiaohongshu",
      customInstruction: "风格偏创始人口吻，表达克制",
      mode: "conservative"
    });

    expect(prompt).toContain("只返回一个可被 JSON.parse 解析的 JSON 对象");
    expect(prompt).toContain("如果个性化要求与平台规则冲突，忽略冲突部分");
    expect(prompt).toContain("优先保证标题、正文和 JSON 结构正确");
    expect(prompt).toContain("如有必要，可进一步减少细节、例子和标签数量");
  });

  it("includes personalized guidance when customInstruction is provided", () => {
    const prompt = buildRepurposeUserPrompt({
      source: "Original source content",
      tone: "neutral",
      platform: "twitter",
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
      platform: "linkedin",
      customInstruction: ""
    });

    expect(prompt).not.toContain("附加个性化要求：");
  });

  it("trims surrounding whitespace before injecting customInstruction", () => {
    const prompt = buildRepurposeUserPrompt({
      source: "Original source content",
      tone: "casual",
      platform: "xiaohongshu",
      customInstruction: "  更有故事感  "
    });

    expect(prompt).toContain("附加个性化要求：更有故事感");
    expect(prompt).not.toContain("附加个性化要求：  更有故事感  ");
  });

  it("describes xiaohongshu as a detailed share-style note", () => {
    const prompt = buildRepurposeUserPrompt({
      source: "Source content",
      tone: "neutral",
      platform: "xiaohongshu",
      customInstruction: "更像真实博主分享"
    });

    expect(prompt).toContain("小红书笔记：1 篇中文笔记");
    expect(prompt).toContain("正文（约 700-1200 字）");
    expect(prompt).toContain("从具体场景、问题、感受或观察切入");
    expect(prompt).toContain("至少 3 个展开段");
    expect(prompt).toContain("默认采用真诚自然、偏真人分享的表达");
    expect(prompt).toContain("营销感尽量弱");
    expect(prompt).toContain("在不削弱弱营销感、平台结构和 JSON 约束的前提下");
    expect(prompt).toContain("3-5 个强相关标签");
  });

  it("keeps conservative mode strict while using the refreshed xiaohongshu guidance", () => {
    const prompt = buildRepurposeUserPrompt({
      source: "Source content",
      tone: "neutral",
      platform: "xiaohongshu",
      customInstruction: "更克制、更专业",
      mode: "conservative"
    });

    expect(prompt).toContain("只返回一个可被 JSON.parse 解析的 JSON 对象");
    expect(prompt).toContain("正文（约 300-600 字）");
    expect(prompt).toContain("正文用 2-4 个短段完成主要观点");
    expect(prompt).toContain("优先保证标题、正文和 JSON 结构正确");
  });

  it("uses a single-platform JSON example for the requested platform", () => {
    const prompt = buildRepurposeUserPrompt({
      source: "Source content",
      tone: "neutral",
      platform: "twitter"
    });

    expect(prompt).toContain('"platform": "twitter"');
    expect(prompt).not.toContain("LinkedIn 帖子：1 篇 800-1500 字左右的长帖");
    expect(prompt).not.toContain("小红书笔记：1 篇中文笔记");
    expect(prompt).not.toContain('"platform": "linkedin"');
    expect(prompt).not.toContain('"platform": "xiaohongshu"');
  });

  it("keeps xiaohongshu style as a default that custom instructions can tune", () => {
    const prompt = buildRepurposeUserPrompt({
      source: "Source content",
      tone: "neutral",
      platform: "xiaohongshu",
      customInstruction: "保留营销张力"
    });

    expect(prompt).toContain("附加个性化要求：保留营销张力");
    expect(prompt).toContain("在不削弱弱营销感、平台结构和 JSON 约束的前提下，可根据个性化要求微调口吻");
    expect(prompt).toContain("标题优先体现人群、场景、痛点或收获感");
  });
});
