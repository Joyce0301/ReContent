import { NextResponse } from "next/server";
import { consumeRateLimit } from "../../../lib/auth/rate-limit";
import {
  getAuthSession,
  isAuthServiceError
} from "../../../lib/auth/session";
import { readBoundedJson } from "../../../lib/http/bounded-json";
import { validateAvatarUploadIntent } from "../../../lib/avatar/validation";

const MAX_REQUEST_BODY_BYTES = 8192;

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

    const bodyResult = await readBoundedJson(req, MAX_REQUEST_BODY_BYTES);

    if (!bodyResult.ok) {
      if (bodyResult.reason === "INVALID_CONTENT_LENGTH") {
        return NextResponse.json(
          { error: "Content-Length 格式错误" },
          { status: 400 }
        );
      }

      if (bodyResult.reason === "TOO_LARGE") {
        return NextResponse.json({ error: "请求体过大" }, { status: 413 });
      }

      if (bodyResult.reason === "INVALID_JSON") {
        return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
      }

      return NextResponse.json(
        { error: "请求体读取失败，请重试" },
        { status: 400 }
      );
    }

    const validationResult = validateAvatarUploadIntent(bodyResult.value);

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
    if (isAuthServiceError(error)) {
      return NextResponse.json(
        { error: "头像服务暂时不可用，请稍后再试" },
        { status: 503 }
      );
    }

    throw error;
  }
}
