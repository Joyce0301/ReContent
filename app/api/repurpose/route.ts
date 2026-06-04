import { NextResponse } from "next/server";
import OpenAI from "openai";
import { extractContentFromUrl } from "./content-extraction";

type PlatformKey = "twitter" | "linkedin" | "xiaohongshu";

type RequestBody = {
  mode: "text" | "url";
  text?: string;
  url?: string;
  platforms: PlatformKey[];
  tone: "neutral" | "formal" | "casual";
};

type AiProvider = "kimi" | "openai" | "mock";
type ProviderConfig = {
  model: string;
  sourceCharLimit: number;
};

const openaiApiKey = process.env.OPENAI_API_KEY;
const kimiApiKey = process.env.KIMI_API_KEY;

const openai = openaiApiKey
  ? new OpenAI({
      apiKey: openaiApiKey
    })
  : null;

const kimi = kimiApiKey
  ? new OpenAI({
      apiKey: kimiApiKey,
      baseURL: "https://api.moonshot.cn/v1"
    })
  : null;

export async function POST(req: Request) {
  let body: RequestBody;

  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  if (!body.platforms || body.platforms.length === 0) {
    return NextResponse.json({ error: "至少选择一个目标平台" }, { status: 400 });
  }

  if (body.mode === "text") {
    if (!body.text || body.text.trim().length === 0) {
      return NextResponse.json(
        { error: "请输入要重制的文本内容" },
        { status: 400 }
      );
    }
  } else if (body.mode === "url") {
    if (!body.url || body.url.trim().length === 0) {
      return NextResponse.json({ error: "请输入 URL" }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "不支持的输入模式" }, { status: 400 });
  }

  try {
    const sourceContent =
      body.mode === "text"
        ? body.text!.trim()
        : await extractContentFromUrl(body.url!);

    if (!sourceContent) {
      return NextResponse.json(
        { error: "未能从内容中提取文本，请检查链接是否可访问" },
        { status: 400 }
      );
    }

    const provider = getAiProvider();
    const results =
      provider === "mock"
        ? generateMockResults(sourceContent, body.platforms, body.tone)
        : await generateWithModel(provider, sourceContent, body.platforms, body.tone);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("repurpose error", error);

    const providerError = toProviderErrorMessage(error);
    if (providerError) {
      return NextResponse.json({ error: providerError }, { status: 502 });
    }

    return NextResponse.json(
      { error: "生成过程中出现错误，请稍后重试" },
      { status: 500 }
    );
  }
}

function getAiProvider(): AiProvider {
  if (kimi) return "kimi";
  if (openai) return "openai";
  return "mock";
}

async function generateWithModel(
  provider: Exclude<AiProvider, "mock">,
  source: string,
  platforms: PlatformKey[],
  tone: RequestBody["tone"]
) {
  const client = provider === "kimi" ? kimi : openai;
  const { model, sourceCharLimit } = getProviderConfig(provider);
  const toneLabel =
    tone === "formal" ? "正式商务" : tone === "casual" ? "轻松口语" : "中性专业";

  const systemPrompt =
    "你是一个专业的中英双语内容营销编辑，擅长根据不同平台的规则重写内容。输出必须是严格的 JSON 格式。";

  const userPrompt = `
原始长内容如下（可能为中文或英文）：
---
${source.slice(0, sourceCharLimit)}
---

请基于上述内容，按以下平台和要求生成重制内容：

- Twitter / X 推文串：每条不超过 280 字，3-8 条，适当使用 emoji 和标签，适合作为线程阅读。
- LinkedIn 帖子：1 篇 800-1500 字左右的长帖，结构清晰，有开头引子、主体要点和结尾 CTA。
- 小红书笔记：1 篇中文笔记，包含一个有吸引力的标题（不超过 20 字）和正文（300-800 字），正文适当分段、使用 emoji 和标签。

通用要求：
- 整体语气风格：${toneLabel}
- 保留原文的核心观点和数据，但用更适合社交平台的方式表达。
- 不要虚构数据来源。

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
`;

  const response = await client!.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.7,
    response_format: { type: "json_object" }
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error(`${provider} 返回为空`);
  }

  const parsed = JSON.parse(raw) as {
    results: {
      platform: PlatformKey;
      title?: string;
      content: string;
    }[];
  };

  const filtered = parsed.results.filter(r => platforms.includes(r.platform));

  return filtered;
}

function getProviderConfig(provider: Exclude<AiProvider, "mock">): ProviderConfig {
  if (provider === "kimi") {
    return {
      model: process.env.KIMI_MODEL || "moonshot-v1-32k",
      sourceCharLimit: 12000
    };
  }

  return {
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    sourceCharLimit: 8000
  };
}

function toProviderErrorMessage(error: unknown): string | null {
  const message =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";

  if (!message) {
    return null;
  }

  const normalized = message.toLowerCase();

  if (
    normalized.includes("context length") ||
    normalized.includes("maximum context length") ||
    normalized.includes("too many tokens") ||
    normalized.includes("max context") ||
    normalized.includes("prompt is too long")
  ) {
    return "内容过长，已超过当前模型的处理上限，请缩短输入内容后重试";
  }

  if (
    normalized.includes("invalid api key") ||
    normalized.includes("incorrect api key") ||
    normalized.includes("unauthorized") ||
    normalized.includes("authentication")
  ) {
    return "AI 服务密钥配置有误，请检查 Cloudflare 环境变量";
  }

  if (
    normalized.includes("rate limit") ||
    normalized.includes("quota") ||
    normalized.includes("insufficient_quota")
  ) {
    return "AI 服务当前限流或额度不足，请稍后重试";
  }

  return null;
}

function generateMockResults(
  source: string,
  platforms: PlatformKey[],
  tone: RequestBody["tone"]
) {
  const short = source.slice(0, 400);
  const baseIntro =
    short.length < source.length ? `${short}...` : short || "（示例占位内容）";

  const toneLabel =
    tone === "formal" ? "【正式风格示例】" : tone === "casual" ? "【轻松风格示例】" : "【中性风格示例】";

  return platforms.map(platform => {
    if (platform === "twitter") {
      return {
        platform,
        content: `${toneLabel}
推文 1️⃣
${baseIntro}

推文 2️⃣
换一种角度，用简洁的句子提炼 1-2 个关键观点，并配上 1-2 个标签，例如：#content #AI

推文 3️⃣
给出一个可操作的小技巧或行动建议，引导读者转化或继续阅读长内容链接。`
      };
    }

    if (platform === "linkedin") {
      return {
        platform,
        content: `${toneLabel}
【引子】
用 2-3 句总结长内容中最有冲击力的结论或数据，引发目标读者的共鸣。

【主体】
- 用项目符号列出 3-5 个关键要点，每一点都结合原文中的案例或数据。
- 将原本冗长的论述压缩成简洁、有层次的段落。

【结尾 CTA】
用 1-2 句引导读者行动，例如点赞、评论分享经验、或点击原文链接阅读全文。`
      };
    }

    return {
      platform,
      title: "示例：把一篇长文拆成高转化小红书笔记",
      content: `${toneLabel}
第一段：用 1-2 句抛出痛点或反差，让读者觉得“说的就是我”。

第二段：结合原文内容，用生活化的语言讲 2-3 个核心观点，每一段用 emoji 开头增强可读性。

第三段：给出一个简单可执行的小步骤或清单，帮助读者马上应用。

最后一段：用 2-3 个带 # 的标签收尾，例如：#内容创作 #自媒体 #AI工具（实际使用时请替换为更贴近内容的标签）。`
    };
  });
}
