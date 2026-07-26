import { NextResponse } from "next/server";
import { consumeRateLimit } from "../../../lib/auth/rate-limit";
import {
  getAuthSession,
  isAuthServiceError
} from "../../../lib/auth/session";
import { validateAvatarUploadIntent } from "../../../lib/avatar/validation";

const MAX_REQUEST_BODY_BYTES = 8192;

class RequestBodyReadError extends Error {
  constructor(cause: unknown) {
    super("Unable to read request body", { cause });
    this.name = "RequestBodyReadError";
  }
}

async function readBoundedBody(req: Request) {
  if (!req.body) {
    return { ok: true as const, text: "" };
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>;

      try {
        result = await reader.read();
      } catch (error) {
        throw new RequestBodyReadError(error);
      }

      const { done, value } = result;

      if (done) {
        break;
      }

      byteLength += value.byteLength;

      if (byteLength > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel();
        return { ok: false as const };
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    ok: true as const,
    text: new TextDecoder().decode(body)
  };
}

export async function POST(req: Request) {
  try {
    const session = await getAuthSession();

    if (!session) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const rateLimit = consumeRateLimit({
      bucket: "avatar-upload-intent",
      key: session.user.id,
      max: 20,
      windowMs: 10 * 60 * 1000
    });

    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: "请求过于频繁，请稍后再试" },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds)
          }
        }
      );
    }

    const contentLength = req.headers.get("content-length");

    if (contentLength !== null) {
      if (!/^\d+$/.test(contentLength)) {
        return NextResponse.json(
          { error: "Content-Length 格式错误" },
          { status: 400 }
        );
      }

      if (BigInt(contentLength) > BigInt(MAX_REQUEST_BODY_BYTES)) {
        return NextResponse.json({ error: "请求体过大" }, { status: 413 });
      }
    }

    const bodyResult = await readBoundedBody(req);

    if (!bodyResult.ok) {
      return NextResponse.json({ error: "请求体过大" }, { status: 413 });
    }

    let body: unknown;

    try {
      body = JSON.parse(bodyResult.text);
    } catch {
      return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
    }

    const validationResult = validateAvatarUploadIntent(body);

    if (!validationResult.ok) {
      return NextResponse.json(
        { error: validationResult.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      validation: {
        status: "ready_for_storage"
      },
      message: "头像信息已通过校验，图片尚未上传或保存"
    });
  } catch (error) {
    if (error instanceof RequestBodyReadError) {
      return NextResponse.json(
        { error: "请求体读取失败，请重试" },
        { status: 400 }
      );
    }

    if (isAuthServiceError(error)) {
      return NextResponse.json(
        { error: "头像服务暂时不可用，请稍后再试" },
        { status: 503 }
      );
    }

    throw error;
  }
}
