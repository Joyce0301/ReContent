import { NextResponse } from "next/server";
import OpenAI from "openai";
import { extractContentFromUrl } from "./content-extraction";
import { createKimiClient } from "./kimi-client";
import { buildRepurposeUserPrompt } from "./prompt-builder";

type PlatformKey = "twitter" | "linkedin" | "xiaohongshu";

type RequestBody = {
  mode: "text" | "url";
  text?: string;
  url?: string;
  platforms: PlatformKey[];
  tone: "neutral" | "formal" | "casual";
  customInstruction?: string;
};

type AiProvider = "kimi" | "openai" | "mock";
type ProviderConfig = {
  model: string;
  sourceCharLimit: number;
};

type ParsedRepurposeResponse = {
  results: Array<{
    platform: PlatformKey;
    title?: string;
    content: string;
  }>;
};

const openaiApiKey = process.env.OPENAI_API_KEY;
const kimiApiKey = process.env.KIMI_API_KEY;
const MAX_CUSTOM_INSTRUCTION_LENGTH = 300;
const DEFAULT_TEMPERATURE = 0.3;
const RETRY_TEMPERATURE = 0.15;
const SUSPICIOUS_CUSTOM_INSTRUCTION_PATTERNS = [
  /ignore\s+(all|any|previous|above|prior)/i,
  /忽略(所有|全部|以上|上面|之前|前面)/,
  /\b(system|assistant|developer|user)\s*:/i,
  /system\s+prompt/i,
  /prompt注入/,
  /```/,
  /只\s*返回\s*json/i,
  /输出\s*json/i,
  /return\s+json/i,
  /code\s+block/i,
  /markdown/i
];

const openai = openaiApiKey
  ? new OpenAI({
      apiKey: openaiApiKey
    })
  : null;

const kimi = kimiApiKey
  ? createKimiClient({
      apiKey: kimiApiKey
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

  const trimmedCustomInstruction = body.customInstruction?.trim() ?? "";

  if (trimmedCustomInstruction.length > MAX_CUSTOM_INSTRUCTION_LENGTH) {
    return NextResponse.json(
      { error: "个性化要求过长，请精简后重试" },
      { status: 400 }
    );
  }

  const sanitizedInstruction = sanitizeCustomInstruction(trimmedCustomInstruction);
  if (sanitizedInstruction.error) {
    return NextResponse.json({ error: sanitizedInstruction.error }, { status: 400 });
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
        : await generateWithModel(
            provider,
            sourceContent,
            body.platforms,
            body.tone,
            sanitizedInstruction.value
          );

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
  tone: RequestBody["tone"],
  customInstruction?: string
) {
  const { model, sourceCharLimit } = getProviderConfig(provider);
  const systemPrompt =
    "你是一个专业的中英双语内容营销编辑，擅长根据不同平台的规则重写内容。输出必须是严格的 JSON 格式。";
  const userPrompt = buildRepurposeUserPrompt({
    source,
    tone,
    customInstruction,
    sourceCharLimit
  });
  const primaryRaw = await createModelCompletion({
    provider,
    model,
    systemPrompt,
    userPrompt,
    temperature: DEFAULT_TEMPERATURE
  });
  if (!primaryRaw) {
    throw new Error(`${provider} 返回为空`);
  }
  const primaryParsed = parseRepurposeResponse(primaryRaw);

  let parsed = primaryParsed;
  if (!parsed) {
    const retryRaw = await createModelCompletion({
      provider,
      model,
      systemPrompt: `${systemPrompt} 如果上一次输出失败，原因只可能是返回内容不是合法 JSON。你这一次必须只返回一个可被 JSON.parse 解析的 JSON 对象，不能包含解释、前缀、代码块或注释。`,
      userPrompt: `${userPrompt}\n\n上一次输出不是合法 JSON。这一次只返回 JSON 对象本身，不要补充任何说明。`,
      temperature: RETRY_TEMPERATURE
    });

    if (!retryRaw) {
      throw new Error(`${provider} 返回为空`);
    }

    parsed = parseRepurposeResponse(retryRaw);
  }

  if (!parsed) {
    throw new Error(`${provider} 未返回合法 JSON`);
  }

  const filtered = parsed.results.filter(r => platforms.includes(r.platform));

  return filtered;
}

async function createModelCompletion({
  provider,
  model,
  systemPrompt,
  userPrompt,
  temperature
}: {
  provider: Exclude<AiProvider, "mock">;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
}) {
  return provider === "kimi"
    ? await kimi!.createJsonCompletion({
        model,
        systemPrompt,
        userPrompt,
        temperature
      })
    : await createOpenAiCompletion({
        client: openai!,
        model,
        systemPrompt,
        userPrompt,
        temperature
      });
}

async function createOpenAiCompletion({
  client,
  model,
  systemPrompt,
  userPrompt,
  temperature
}: {
  client: OpenAI;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
}) {
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature,
    response_format: { type: "json_object" }
  });

  return response.choices[0]?.message?.content ?? null;
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

export function sanitizeCustomInstruction(input: string): {
  value: string;
  error?: string;
} {
  const normalized = input.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return { value: "" };
  }

  const hasSuspiciousPattern = SUSPICIOUS_CUSTOM_INSTRUCTION_PATTERNS.some(pattern =>
    pattern.test(normalized)
  );

  if (hasSuspiciousPattern) {
    return {
      value: "",
      error: "个性化要求里包含可能干扰生成的指令，请只描述风格、口吻或表达方向"
    };
  }

  return { value: normalized };
}

export function parseRepurposeResponse(raw: string): ParsedRepurposeResponse | null {
  const directParsed = parseRepurposeJson(raw);
  if (directParsed) {
    return directParsed;
  }

  const fenced = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const fencedParsed = parseRepurposeJson(fenced);
  if (fencedParsed) {
    return fencedParsed;
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
    return null;
  }

  return parseRepurposeJson(raw.slice(firstBrace, lastBrace + 1));
}

function parseRepurposeJson(raw: string): ParsedRepurposeResponse | null {
  try {
    const parsed = JSON.parse(raw) as ParsedRepurposeResponse;
    if (!Array.isArray(parsed.results)) {
      return null;
    }

    const hasInvalidResult = parsed.results.some(result => {
      if (!result || typeof result !== "object") {
        return true;
      }

      const platform = result.platform;
      const title = result.title;
      const content = result.content;

      return (
        !["twitter", "linkedin", "xiaohongshu"].includes(platform) ||
        typeof content !== "string" ||
        (title !== undefined && typeof title !== "string")
      );
    });

    return hasInvalidResult ? null : parsed;
  } catch {
    return null;
  }
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
