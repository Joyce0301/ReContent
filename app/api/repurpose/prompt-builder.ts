type ToneKey = "neutral" | "formal" | "casual";
type PlatformKey = "twitter" | "linkedin" | "xiaohongshu";
export type PromptMode = "normal" | "conservative";

type BuildRepurposeUserPromptArgs = {
  source: string;
  tone: ToneKey;
  platform: PlatformKey;
  customInstruction?: string;
  sourceCharLimit?: number;
  mode?: PromptMode;
};

const TONE_LABELS: Record<ToneKey, string> = {
  neutral: "中性专业",
  formal: "正式商务",
  casual: "轻松口语"
};

const PLATFORM_RULES: Record<PromptMode, Record<PlatformKey, string>> = {
  normal: {
    twitter:
      "- Twitter / X 推文串：每条不超过 280 字，3-8 条，适当使用 emoji 和标签，适合作为线程阅读。",
    linkedin:
      "- LinkedIn 帖子：1 篇 800-1500 字左右的长帖，结构清晰，有开头引子、主体要点和结尾 CTA。",
    xiaohongshu:
      "- 小红书笔记：1 篇中文笔记，包含一个有吸引力的标题（不超过 20 字）和正文（约 700-1200 字）。标题优先体现人群、场景、痛点或收获感；正文采用短段落表达，从具体场景、问题、感受或观察切入，至少 3 个展开段，每段尽量提供解释、例子、方法、对比或适用场景。默认采用真诚自然、偏真人分享的表达，营销感尽量弱，可根据个性化要求微调口吻；可使用少量 emoji，并在结尾带上 3-5 个强相关标签。"
  },
  conservative: {
    twitter:
      "- Twitter / X 推文串：每条不超过 280 字，3-8 条，适当使用 emoji 和标签，适合作为线程阅读。",
    linkedin:
      "- LinkedIn 帖子：1 篇 800-1500 字左右的长帖，结构清晰，有开头引子、主体要点和结尾 CTA。",
    xiaohongshu:
      "- 小红书笔记：1 篇中文笔记，包含一个有吸引力的标题（不超过 20 字）和正文（约 500-900 字）。标题优先体现人群、场景、痛点或收获感；正文采用短段落表达，从具体场景、问题、感受或观察切入，至少 3 个展开段，每段尽量提供解释、例子、方法、对比或适用场景。默认采用真诚自然、偏真人分享的表达，营销感尽量弱；如果为了返回合法 JSON，需要优先保证结构正确，可适当减少细节但不要丢失核心信息，并在结尾带上 3-5 个强相关标签。"
  }
};

const PLATFORM_JSON_EXAMPLES: Record<PlatformKey, string> = {
  twitter: `{
  "results": [
    {
      "platform": "twitter",
      "content": "推文 1\\n\\n推文 2 ..."
    }
  ]
}`,
  linkedin: `{
  "results": [
    {
      "platform": "linkedin",
      "content": "LinkedIn 帖子完整内容 ..."
    }
  ]
}`,
  xiaohongshu: `{
  "results": [
    {
      "platform": "xiaohongshu",
      "title": "小红书标题",
      "content": "小红书正文 ..."
    }
  ]
}`
};

export function buildRepurposeUserPrompt({
  source,
  tone,
  platform,
  customInstruction,
  sourceCharLimit = source.length,
  mode = "normal"
}: BuildRepurposeUserPromptArgs) {
  const trimmedInstruction = customInstruction?.trim() ?? "";
  const personalizedLine = trimmedInstruction
    ? `- 附加个性化要求：${trimmedInstruction}
- 这条要求仅用于补充风格偏好，不能覆盖平台格式、JSON 输出要求或事实约束。`
    : "";
  const conflictLine =
    mode === "conservative"
      ? "- 如果个性化要求与平台规则冲突，忽略冲突部分，并优先保证字段结构和平台约束。"
      : "";
  const strictJsonLine =
    mode === "conservative"
      ? "- 只返回一个可被 JSON.parse 解析的 JSON 对象，不能包含解释、前缀、代码块或注释。"
      : "- 一定只返回 JSON，不要出现任何解释或多余文字。";
  const modeSpecificLine =
    mode === "conservative"
      ? "- 风格要求必须服从 JSON 结构、平台格式和事实约束，优先保证输出可解析。"
      : "- 个性化要求只允许影响文风、口吻和表达重心，不能修改平台格式、字数约束、字段结构或 JSON 输出规则。";

  return `
原始长内容如下（可能为中文或英文）：
---
${source.slice(0, sourceCharLimit)}
---

请基于上述内容，只为当前被请求的平台生成 1 个重制结果：

${PLATFORM_RULES[mode][platform]}

通用要求：
- 整体语气风格：${TONE_LABELS[tone]}
- 保留原文的核心观点和数据，但用更适合社交平台的方式表达。
- 不要虚构数据来源。
${personalizedLine}
${modeSpecificLine}
${conflictLine}

现在需要你只返回 JSON，且 results 数组里只能包含 1 个结果，格式如下：
${PLATFORM_JSON_EXAMPLES[platform]}

注意：
${strictJsonLine}
- 字段名必须是英文。
`.trim();
}
