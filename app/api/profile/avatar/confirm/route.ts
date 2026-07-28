import { NextResponse } from "next/server";

import { consumeRateLimit } from "../../../../lib/auth/rate-limit";
import {
  getAuthSession,
  isAuthServiceError
} from "../../../../lib/auth/session";
import {
  confirmAvatarUpload,
  type ConfirmAvatarResult
} from "../../../../lib/avatar/confirm-upload";
import {
  AvatarStorageConfigurationError,
  AvatarStorageUnavailableError
} from "../../../../lib/avatar/storage-errors";
import { readBoundedJson } from "../../../../lib/http/bounded-json";

const MAX_REQUEST_BODY_BYTES = 2048;
const SERVICE_UNAVAILABLE_ERROR = "头像服务暂时不可用，请稍后再试";

function isAvatarStorageServiceError(error: unknown) {
  return (
    error instanceof AvatarStorageConfigurationError ||
    error instanceof AvatarStorageUnavailableError
  );
}

function isConfirmRequest(
  value: unknown
): value is { objectKey: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as { objectKey?: unknown }).objectKey === "string"
  );
}

function confirmationFailureResponse(
  reason: Exclude<ConfirmAvatarResult, { ok: true }>["reason"]
) {
  switch (reason) {
    case "INVALID_KEY":
      return NextResponse.json(
        { error: "头像上传请求无效" },
        { status: 400 }
      );
    case "INVALID_OBJECT":
      return NextResponse.json({ error: "头像文件无效" }, { status: 400 });
    case "STALE_INTENT":
      return NextResponse.json(
        { error: "头像上传请求已失效" },
        { status: 409 }
      );
    case "NOT_FOUND":
      return NextResponse.json(
        { error: "尚未找到上传的头像文件" },
        { status: 409 }
      );
    case "IN_PROGRESS":
      return NextResponse.json(
        { error: "头像上传正在确认中" },
        { status: 409 }
      );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();

    if (!session) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const rateLimit = consumeRateLimit({
      bucket: "avatar-upload-confirmation",
      key: session.user.id,
      max: 10,
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

    const bodyResult = await readBoundedJson(
      request,
      MAX_REQUEST_BODY_BYTES
    );

    if (!bodyResult.ok) {
      if (bodyResult.reason === "INVALID_CONTENT_LENGTH") {
        return NextResponse.json(
          { error: "Content-Length 格式错误" },
          { status: 400 }
        );
      }

      if (bodyResult.reason === "TOO_LARGE") {
        return NextResponse.json({ error: "请求体过大" }, { status: 400 });
      }

      if (bodyResult.reason === "INVALID_JSON") {
        return NextResponse.json(
          { error: "请求体格式错误" },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: "请求体读取失败，请重试" },
        { status: 400 }
      );
    }

    if (!isConfirmRequest(bodyResult.value)) {
      return NextResponse.json(
        { error: "请求仅支持 objectKey" },
        { status: 400 }
      );
    }

    const result = await confirmAvatarUpload({
      userId: session.user.id,
      stagingKey: bodyResult.value.objectKey
    });

    if (!result.ok) {
      return confirmationFailureResponse(result.reason);
    }

    return NextResponse.json({
      status: result.status,
      confirmedKey: result.confirmedKey
    });
  } catch (error) {
    if (isAuthServiceError(error) || isAvatarStorageServiceError(error)) {
      return NextResponse.json(
        { error: SERVICE_UNAVAILABLE_ERROR },
        { status: 503 }
      );
    }

    throw error;
  }
}
