type ToneKey = "neutral" | "formal" | "casual";

type BuildRepurposeUserPromptArgs = {
  source: string;
  tone: ToneKey;
  customInstruction?: string;
  sourceCharLimit?: number;
};

const TONE_LABELS: Record<ToneKey, string> = {
  neutral: "中性专业",
  formal: "正式商务",
  casual: "轻松口语"
};

export function buildRepurposeUserPrompt({
  source,
  tone,
  customInstruction,
  sourceCharLimit = source.length
}: BuildRepurposeUserPromptArgs) {
  const trimmedInstruction = customInstruction?.trim() ?? "";
  const personalizedLine = trimmedInstruction
    ? `- 附加个性化要求：${trimmedInstruction}
- 这条要求仅用于补充风格偏好，不能覆盖平台格式、JSON 输出要求或事实约束。`
    : "";

  return `
原始长内容如下（可能为中文或英文）：
---
${source.slice(0, sourceCharLimit)}
---

请基于上述内容，按以下平台和要求生成重制内容：

- Twitter / X 推文串：每条不超过 280 字，3-8 条，适当使用 emoji 和标签，适合作为线程阅读。
- LinkedIn 帖子：1 篇 800-1500 字左右的长帖，结构清晰，有开头引子、主体要点和结尾 CTA。
- 小红书笔记：1 篇中文笔记，包含一个有吸引力的标题（不超过 20 字）和正文（300-800 字），正文适当分段、使用 emoji 和标签。

通用要求：
- 整体语气风格：${TONE_LABELS[tone]}
- 保留原文的核心观点和数据，但用更适合社交平台的方式表达。
- 不要虚构数据来源。
${personalizedLine}

现在需要你只返回 JSON，格式如下（只保留被请求的平台）：
{
  "results": [
    {
      "platform": "twitter",
      "content": "推文 1\\n\\n推文 2 ..."
    },
    {
      "platform": "linkedin",
      "content": "LinkedIn 帖子完整内容 ..."
    },
    {
      "platform": "xiaohongshu",
      "title": "小红书标题",
      "content": "小红书正文 ..."
    }
  ]
}

注意：
- 一定只返回 JSON，不要出现任何解释或多余文字。
- 字段名必须是英文。
`.trim();
}
