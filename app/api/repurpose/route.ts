import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  extractContentFromUrlWithDiagnostics,
  type ExtractionDiagnostics,
  type ExtractionFailureReason
} from "./content-extraction";
import { classifyFailure, compressCustomInstruction, decideRetryPlan } from "./failure-policy";
import { createKimiClient } from "./kimi-client";
import { buildRepurposeUserPrompt, type PromptMode } from "./prompt-builder";

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
type GenerationMode = PromptMode;

type ParsedRepurposeResponse = {
  results: Array<{
    platform: PlatformKey;
    title?: string;
    content: string;
  }>;
};

type RepurposeRunTrace = {
  mode: RequestBody["mode"];
  targetPlatforms: PlatformKey[];
  hasCustomInstruction: boolean;
  attempts: Array<{
    attempt: number;
    mode: GenerationMode;
    outcome: "success" | "failure";
    failureClass?: "transient" | "generation";
    failureKind?: string;
  }>;
  attemptCount: number;
  finalMode: GenerationMode;
  finalStatus: "success" | "failure";
};

type UrlExtractionErrorPayload = {
  error: string;
  errorCode: "url_extraction_failed";
  extractionFailureReason: ExtractionFailureReason;
  errorTitle: string;
  errorDetail: string;
};

const openaiApiKey = process.env.OPENAI_API_KEY;
const kimiApiKey = process.env.KIMI_API_KEY;
const MAX_CUSTOM_INSTRUCTION_LENGTH = 300;
const MAX_XIAOHONGSHU_TITLE_LENGTH = 20;
const DEFAULT_TEMPERATURE = 0.3;
const CONSERVATIVE_TEMPERATURE = 0.15;
const NORMAL_SYSTEM_PROMPT =
  "你是一个专业的中英双语内容营销编辑，擅长根据不同平台的规则重写内容。输出必须是严格的 JSON 格式。";
const CONSERVATIVE_SYSTEM_PROMPT =
  "你必须返回合法 JSON，并优先满足平台规则、字段结构和事实约束。";
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
    let extractionDiagnostics: Awaited<
      ReturnType<typeof extractContentFromUrlWithDiagnostics>
    >["diagnostics"] | null = null;
    const sourceContent =
      body.mode === "text"
        ? body.text!.trim()
        : await extractUrlContent(body.url!, diagnostics => {
            extractionDiagnostics = diagnostics;
          });

    if (!sourceContent) {
      if (extractionDiagnostics) {
        logContentExtraction(extractionDiagnostics);
      }
      const extractionError = buildUrlExtractionError(extractionDiagnostics);
      return NextResponse.json(
        extractionError,
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
            sanitizedInstruction.value,
            {
              mode: body.mode,
              targetPlatforms: body.platforms,
              hasCustomInstruction: sanitizedInstruction.value.length > 0
            }
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

async function extractUrlContent(
  url: string,
  onDiagnostics: (diagnostics: ExtractionDiagnostics) => void
) {
  const result = await extractContentFromUrlWithDiagnostics(url);
  onDiagnostics(result.diagnostics);
  return result.content;
}

function buildUrlExtractionError(
  diagnostics: ExtractionDiagnostics | null
): UrlExtractionErrorPayload {
  const reason = summarizeExtractionFailureReason(diagnostics);

  if (reason === "timeout") {
    return {
      error: "网页响应超时，请稍后重试或换一个更稳定的链接",
      errorCode: "url_extraction_failed",
      extractionFailureReason: reason,
      errorTitle: "网页读取超时",
      errorDetail: "目标网页在限定时间内没有返回可用正文，你可以稍后重试，或换成原文更完整、更稳定的链接。"
    };
  }

  if (reason === "http_error") {
    return {
      error: "网页暂时不可访问，或目标站点限制了抓取",
      errorCode: "url_extraction_failed",
      extractionFailureReason: reason,
      errorTitle: "网页无法访问",
      errorDetail: "这个链接可能需要登录、开启了反爬限制，或者当前响应异常。你可以换一个公开可访问的原文链接再试。"
    };
  }

  if (reason === "network_error") {
    return {
      error: "网络连接异常，暂时没能读取这个网页",
      errorCode: "url_extraction_failed",
      extractionFailureReason: reason,
      errorTitle: "网络连接异常",
      errorDetail: "抓取过程中出现了网络波动，当前没能稳定读取目标网页。你可以稍后重试，或换一个访问更稳定的链接。"
    };
  }

  if (reason === "invalid_url") {
    return {
      error: "链接格式无效，请检查后重新输入",
      errorCode: "url_extraction_failed",
      extractionFailureReason: reason,
      errorTitle: "链接格式不正确",
      errorDetail: "这个链接不是有效的 http 或 https 地址。请确认链接完整可用，再重新尝试。"
    };
  }

  if (reason === "unsupported_site") {
    return {
      error: "当前站点结构较特殊，暂时还不能稳定解析",
      errorCode: "url_extraction_failed",
      extractionFailureReason: reason,
      errorTitle: "暂不稳定支持该站点",
      errorDetail: "这个网页的结构比较特殊，目前抓取成功率不稳定。你可以直接粘贴正文，或换一个更标准的文章页链接。"
    };
  }

  return {
    error: "网页可访问，但暂时没有提取到可用正文",
    errorCode: "url_extraction_failed",
    extractionFailureReason: reason,
    errorTitle: "没有提取到正文",
    errorDetail: "页面可能主要由短摘要、动态脚本或非正文模块组成。你可以直接粘贴原文内容，或换一个正文更完整的页面链接。"
  };
}

function summarizeExtractionFailureReason(
  diagnostics: ExtractionDiagnostics | null
): ExtractionFailureReason {
  const reasons =
    diagnostics?.attempts
      .map(attempt => attempt.failureReason)
      .filter((reason): reason is ExtractionFailureReason => Boolean(reason)) ?? [];

  if (reasons.includes("timeout")) {
    return "timeout";
  }

  if (reasons.includes("http_error")) {
    return "http_error";
  }

  if (reasons.includes("network_error")) {
    return "network_error";
  }

  if (reasons.includes("unsupported_site")) {
    return "unsupported_site";
  }

  if (reasons.includes("invalid_url")) {
    return "invalid_url";
  }

  return "no_content";
}

async function generateWithModel(
  provider: Exclude<AiProvider, "mock">,
  source: string,
  platforms: PlatformKey[],
  tone: RequestBody["tone"],
  customInstruction?: string,
  traceSeed?: Pick<RepurposeRunTrace, "mode" | "targetPlatforms" | "hasCustomInstruction">
) {
  let attemptCount = 0;
  let mode: GenerationMode = "normal";
  let lastError: Error | null = null;
  const trace = createRunTrace(traceSeed, platforms, customInstruction);

  while (attemptCount < 3) {
    attemptCount += 1;

    try {
      const attempt = await generateAttempt({
        provider,
        source,
        platforms,
        tone,
        customInstruction,
        mode
      });

      if (attempt.results) {
        trace.attempts.push({
          attempt: attemptCount,
          mode,
          outcome: "success"
        });
        finalizeRunTrace(trace, {
          attemptCount,
          finalMode: mode,
          finalStatus: "success"
        });
        logRunTrace(trace);
        return attempt.results;
      }

      const failure = classifyFailure({
        rawOutput: attempt.rawOutput,
        parsedValid: attempt.parsedValid,
        hasContent: attempt.hasContent
      });
      trace.attempts.push({
        attempt: attemptCount,
        mode,
        outcome: "failure",
        failureClass: failure.failureClass,
        failureKind: failure.kind
      });
      const decision = decideRetryPlan({
        attemptCount,
        currentMode: mode,
        failureClass: failure.failureClass
      });

      if (decision === "stop") {
        break;
      }

      mode = decision === "retry_conservative" ? "conservative" : "normal";
      lastError = new Error(failure.kind);
    } catch (error) {
      const failure = classifyFailure({ error });
      trace.attempts.push({
        attempt: attemptCount,
        mode,
        outcome: "failure",
        failureClass: failure.failureClass,
        failureKind: failure.kind
      });
      const decision = decideRetryPlan({
        attemptCount,
        currentMode: mode,
        failureClass: failure.failureClass
      });

      if (decision === "stop") {
        finalizeRunTrace(trace, {
          attemptCount,
          finalMode: mode,
          finalStatus: "failure"
        });
        logRunTrace(trace);
        throw error;
      }

      mode = decision === "retry_conservative" ? "conservative" : "normal";
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  finalizeRunTrace(trace, {
    attemptCount,
    finalMode: mode,
    finalStatus: "failure"
  });
  logRunTrace(trace);
  throw lastError ?? new Error(`${provider} 重试后仍然失败`);
}

async function generateAttempt(input: {
  provider: Exclude<AiProvider, "mock">;
  source: string;
  platforms: PlatformKey[];
  tone: RequestBody["tone"];
  customInstruction?: string;
  mode: GenerationMode;
}) {
  const { model, sourceCharLimit } = getProviderConfig(input.provider);
  const fallbackInstruction =
    input.mode === "conservative"
      ? compressCustomInstruction(input.customInstruction ?? "")
      : input.customInstruction ?? "";
  const userPrompt = buildRepurposeUserPrompt({
    source: input.source,
    tone: input.tone,
    customInstruction: fallbackInstruction,
    sourceCharLimit,
    mode: input.mode
  });
  const rawOutput = await createModelCompletion({
    provider: input.provider,
    model,
    systemPrompt:
      input.mode === "conservative" ? CONSERVATIVE_SYSTEM_PROMPT : NORMAL_SYSTEM_PROMPT,
    userPrompt,
    temperature:
      input.mode === "conservative" ? CONSERVATIVE_TEMPERATURE : DEFAULT_TEMPERATURE
  });

  if (!rawOutput) {
    return {
      rawOutput,
      parsedValid: undefined,
      hasContent: undefined,
      results: null
    };
  }

  const parsedOutcome = parseRepurposePayload(rawOutput);
  if (!parsedOutcome.parsed) {
    return {
      rawOutput,
      parsedValid: parsedOutcome.parsedValid,
      hasContent: undefined,
      results: null
    };
  }

  const filtered = parsedOutcome.parsed.results.filter(result =>
    input.platforms.includes(result.platform)
  );
  const hasContent =
    filtered.length > 0 && filtered.every(result => result.content.trim().length > 0);

  if (!hasContent) {
    return {
      rawOutput,
      parsedValid: true,
      hasContent: false,
      results: null
    };
  }

  return {
    rawOutput,
    parsedValid: true,
    hasContent: true,
    results: filtered
  };
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
  return parseRepurposePayload(raw).parsed;
}

function parseRepurposePayload(raw: string): {
  parsed: ParsedRepurposeResponse | null;
  parsedValid?: boolean;
} {
  const directParsed = parseRepurposeJson(raw);
  if (directParsed.parsed || directParsed.parsedValid === false) {
    return directParsed;
  }

  const fenced = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const fencedParsed = parseRepurposeJson(fenced);
  if (fencedParsed.parsed || fencedParsed.parsedValid === false) {
    return fencedParsed;
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
    return { parsed: null };
  }

  return parseRepurposeJson(raw.slice(firstBrace, lastBrace + 1));
}

function parseRepurposeJson(raw: string): {
  parsed: ParsedRepurposeResponse | null;
  parsedValid?: boolean;
} {
  try {
    const parsed = JSON.parse(raw) as ParsedRepurposeResponse;
    if (!Array.isArray(parsed.results) || parsed.results.length === 0) {
      return { parsed: null, parsedValid: false };
    }

    const hasInvalidResult = parsed.results.some(result => {
      if (!result || typeof result !== "object") {
        return true;
      }

      const platform = result.platform;
      const title = result.title;
      const content = result.content;
      const trimmedTitle = typeof title === "string" ? title.trim() : undefined;
      const trimmedContent = typeof content === "string" ? content.trim() : "";

      return (
        !["twitter", "linkedin", "xiaohongshu"].includes(platform) ||
        typeof content !== "string" ||
        trimmedContent.length === 0 ||
        (title !== undefined && typeof title !== "string") ||
        (platform === "xiaohongshu" &&
          (trimmedTitle === undefined ||
            trimmedTitle.length === 0 ||
            countCodePoints(trimmedTitle) > MAX_XIAOHONGSHU_TITLE_LENGTH))
      );
    });

    return hasInvalidResult
      ? { parsed: null, parsedValid: false }
      : { parsed, parsedValid: true };
  } catch {
    return { parsed: null };
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

function countCodePoints(input: string) {
  return Array.from(input).length;
}

function createRunTrace(
  traceSeed:
    | Pick<RepurposeRunTrace, "mode" | "targetPlatforms" | "hasCustomInstruction">
    | undefined,
  platforms: PlatformKey[],
  customInstruction?: string
): RepurposeRunTrace {
  return {
    mode: traceSeed?.mode ?? "text",
    targetPlatforms: traceSeed?.targetPlatforms ?? platforms,
    hasCustomInstruction:
      traceSeed?.hasCustomInstruction ?? Boolean(customInstruction?.trim().length),
    attempts: [],
    attemptCount: 0,
    finalMode: "normal",
    finalStatus: "failure"
  };
}

function finalizeRunTrace(
  trace: RepurposeRunTrace,
  result: Pick<RepurposeRunTrace, "attemptCount" | "finalMode" | "finalStatus">
) {
  trace.attemptCount = result.attemptCount;
  trace.finalMode = result.finalMode;
  trace.finalStatus = result.finalStatus;
}

function logRunTrace(trace: RepurposeRunTrace) {
  console.info("repurpose run", JSON.stringify(trace));
}

function logContentExtraction(diagnostics: ExtractionDiagnostics) {
  console.info("content extraction", JSON.stringify(diagnostics));
}
