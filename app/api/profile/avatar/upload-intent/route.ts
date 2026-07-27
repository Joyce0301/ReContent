import { NextResponse } from "next/server";

import { consumeRateLimit } from "../../../../lib/auth/rate-limit";
import {
  getAuthSession,
  isAuthServiceError
} from "../../../../lib/auth/session";
import {
  getAvatarUploadState,
  reserveAvatarUpload
} from "../../../../lib/auth/user-store";
import { createAvatarObjectKeys } from "../../../../lib/avatar/object-key";
import { createAvatarPresignedPost } from "../../../../lib/avatar/s3-storage";
import {
  AvatarStorageConfigurationError,
  AvatarStorageUnavailableError
} from "../../../../lib/avatar/storage-errors";
import { validateAvatarUploadIntent } from "../../../../lib/avatar/validation";
import { readBoundedJson } from "../../../../lib/http/bounded-json";

const MAX_REQUEST_BODY_BYTES = 8192;
const SERVICE_UNAVAILABLE_ERROR = "头像服务暂时不可用，请稍后再试";
const UPLOAD_CONFLICT_ERROR = "当前头像状态不允许创建上传请求";

function isAvatarStorageServiceError(error: unknown) {
  return (
    error instanceof AvatarStorageConfigurationError ||
    error instanceof AvatarStorageUnavailableError
  );
}

function uploadConflictResponse() {
  return NextResponse.json({ error: UPLOAD_CONFLICT_ERROR }, { status: 409 });
}

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();

    if (!session) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const rateLimit = consumeRateLimit({
      bucket: "avatar-upload-intent",
      key: session.user.id,
      max: 5,
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

    const uploadState = await getAvatarUploadState(session.user.id);

    if (
      !uploadState ||
      (uploadState.status !== "not_uploaded" &&
        uploadState.status !== "failed" &&
        uploadState.status !== "pending_upload")
    ) {
      return uploadConflictResponse();
    }

    const { stagingKey } = createAvatarObjectKeys({
      userId: session.user.id,
      extension: validationResult.value.extension
    });
    const upload = await createAvatarPresignedPost({
      stagingKey,
      contentType: validationResult.value.contentType
    });
    const reserved = await reserveAvatarUpload({
      userId: session.user.id,
      stagingKey
    });

    if (!reserved) {
      return uploadConflictResponse();
    }

    return NextResponse.json({
      upload,
      objectKey: stagingKey
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
