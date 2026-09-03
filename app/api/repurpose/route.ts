import { NextResponse } from "next/server";
import type {
  ExtractionDiagnostics,
  ExtractionFailureReason
} from "./content-extraction";
import {
  parseRepurposeResponse,
  runRepurposeWorkflow,
  sanitizeCustomInstruction,
  toProviderErrorMessage,
  type PlatformKey,
  type ToneKey,
  UrlExtractionWorkflowError
} from "./workflow";
import { getAuthSession } from "../../lib/auth/session";
import { AuthConfigurationError, AuthStorageUnavailableError } from "../../lib/auth/errors";

type RequestBody = {
  mode: "text" | "url";
  text?: string;
  url?: string;
  platforms: PlatformKey[];
  tone: ToneKey;
  customInstruction?: string;
};

type UrlExtractionErrorPayload = {
  error: string;
  errorCode: "url_extraction_failed";
  extractionFailureReason: ExtractionFailureReason;
  errorTitle: string;
  errorDetail: string;
};

const MAX_CUSTOM_INSTRUCTION_LENGTH = 300;

export async function POST(req: Request) {
  let session;

  try {
    session = await getAuthSession();
  } catch (error) {
    if (
      error instanceof AuthConfigurationError ||
      error instanceof AuthStorageUnavailableError
    ) {
      return NextResponse.json(
        { error: "认证服务暂时不可用，请稍后再试" },
        { status: 503 }
      );
    }

    throw error;
  }

  if (!session) {
    return NextResponse.json(
      { error: "请先登录后再开始重制内容" },
      { status: 401 }
    );
  }

  let body: RequestBody;

  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const requestedPlatform = normalizeRequestedPlatform(body.platforms);
  if (!requestedPlatform.value) {
    return NextResponse.json({ error: requestedPlatform.error }, { status: 400 });
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
    const result = await runRepurposeWorkflow({
      userId: session.user.id,
      mode: body.mode,
      text: body.text,
      url: body.url,
      platform: requestedPlatform.value,
      tone: body.tone,
      customInstruction: sanitizedInstruction.value
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UrlExtractionWorkflowError) {
      const extractionError = buildUrlExtractionError(error.diagnostics);
      return NextResponse.json(extractionError, { status: 400 });
    }

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

function normalizeRequestedPlatform(input: unknown): {
  value?: PlatformKey;
  error: string;
} {
  if (!Array.isArray(input) || input.length === 0) {
    return { error: "至少选择一个目标平台" };
  }

  if (input.length !== 1) {
    return { error: "请一次只选择一个目标平台" };
  }

  const platform = input[0];
  if (platform === "twitter" || platform === "linkedin" || platform === "xiaohongshu") {
    return { value: platform, error: "" };
  }

  return { error: "请选择有效的目标平台" };
}

export { parseRepurposeResponse, sanitizeCustomInstruction };
