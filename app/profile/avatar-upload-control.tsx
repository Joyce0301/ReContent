"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { AvatarStatus } from "../lib/avatar/types";
import {
  type AvatarUploadIntent,
  validateAvatarUploadIntent
} from "../lib/avatar/validation";

type AvatarUploadControlProps = {
  avatarInitial: string;
  initialStatus: AvatarStatus;
};

type ControlPhase =
  | "initial"
  | "validating"
  | "valid"
  | "pending"
  | "pending_s3"
  | "uploaded"
  | "error";

const INITIAL_STATUS_LABELS: Record<AvatarStatus, string> = {
  not_uploaded: "尚未上传",
  pending_upload: "待接入 S3",
  confirming: "正在确认上传",
  uploaded: "原图已上传，等待处理",
  ready: "头像已就绪",
  failed: "上次准备失败"
};

const MALFORMED_RESPONSE_MESSAGE =
  "头像服务返回了无法识别的响应，请稍后再试";

type UploadIntentResponse = {
  upload: {
    url: string;
    fields: Record<string, string>;
    expiresAt: string;
  };
  objectKey: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isUploadIntentResponse(
  value: unknown
): value is UploadIntentResponse {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as {
    upload?: unknown;
    objectKey?: unknown;
  };
  if (
    typeof candidate.upload !== "object" ||
    candidate.upload === null ||
    !isNonEmptyString(candidate.objectKey)
  ) {
    return false;
  }

  const upload = candidate.upload as {
    url?: unknown;
    fields?: unknown;
    expiresAt?: unknown;
  };
  return (
    isNonEmptyString(upload.url) &&
    isNonEmptyString(upload.expiresAt) &&
    typeof upload.fields === "object" &&
    upload.fields !== null &&
    !Array.isArray(upload.fields) &&
    Object.values(upload.fields).every(isNonEmptyString)
  );
}

function isConfirmResponse(
  value: unknown
): value is { status: "uploaded"; confirmedKey: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { status?: unknown }).status === "uploaded" &&
    isNonEmptyString((value as { confirmedKey?: unknown }).confirmedKey)
  );
}

function isErrorBody(value: unknown): value is { error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { error?: unknown }).error === "string" &&
    (value as { error: string }).error.length > 0
  );
}

export function AvatarUploadControl({
  avatarInitial,
  initialStatus
}: AvatarUploadControlProps) {
  const [phase, setPhase] = useState<ControlPhase>("initial");
  const [intent, setIntent] = useState<AvatarUploadIntent | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showAuthLink, setShowAuthLink] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const pendingRef = useRef(false);
  const requestControllerRef = useRef<AbortController | null>(null);

  function revokePreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    setPreviewUrl(null);
  }

  useEffect(
    () => () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }

      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
    },
    []
  );

  function finishRequest(controller: AbortController) {
    if (requestControllerRef.current === controller) {
      requestControllerRef.current = null;
      pendingRef.current = false;
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    revokePreview();
    setIntent(null);
    setSelectedFile(null);
    setFeedback(null);
    setShowAuthLink(false);

    if (!file) {
      setPhase("initial");
      return;
    }

    setPhase("validating");

    const validation = validateAvatarUploadIntent({
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size
    });

    if (!validation.ok) {
      setPhase("error");
      setFeedback(validation.error);
      event.target.value = "";
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    previewUrlRef.current = nextPreviewUrl;
    setPreviewUrl(nextPreviewUrl);
    setIntent(validation.value);
    setSelectedFile(file);
    setPhase("valid");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !intent ||
      !selectedFile ||
      pendingRef.current ||
      phase === "pending_s3" ||
      phase === "uploaded"
    ) {
      return;
    }

    pendingRef.current = true;
    setPhase("pending");
    setFeedback(null);
    setShowAuthLink(false);

    requestControllerRef.current?.abort();
    const requestController = new AbortController();
    requestControllerRef.current = requestController;

    let intentResponse: Response;

    try {
      intentResponse = await fetch("/api/profile/avatar/upload-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: requestController.signal,
        body: JSON.stringify({
          fileName: intent.fileName,
          contentType: intent.contentType,
          sizeBytes: intent.sizeBytes
        })
      });
    } catch {
      if (requestController.signal.aborted) {
        finishRequest(requestController);
        return;
      }

      setPhase("error");
      setFeedback("网络连接失败，请稍后再试");
      finishRequest(requestController);
      return;
    }

    if (requestController.signal.aborted) {
      finishRequest(requestController);
      return;
    }

    let body: unknown;

    try {
      body = await intentResponse.json();
    } catch {
      if (requestController.signal.aborted) {
        finishRequest(requestController);
        return;
      }

      setPhase("error");
      setFeedback(MALFORMED_RESPONSE_MESSAGE);
      finishRequest(requestController);
      return;
    }

    if (requestController.signal.aborted) {
      finishRequest(requestController);
      return;
    }

    if (intentResponse.status === 200 && isUploadIntentResponse(body)) {
      const formData = new FormData();
      for (const [field, value] of Object.entries(body.upload.fields)) {
        formData.append(field, value);
      }
      formData.append("file", selectedFile);

      let s3Response: Response;

      setPhase("pending_s3");

      try {
        s3Response = await fetch(body.upload.url, {
          method: "POST",
          signal: requestController.signal,
          body: formData
        });
      } catch {
        if (requestController.signal.aborted) {
          finishRequest(requestController);
          return;
        }

        setPhase("error");
        setFeedback("网络连接失败，请稍后再试");
        finishRequest(requestController);
        return;
      }

      if (requestController.signal.aborted) {
        finishRequest(requestController);
        return;
      }

      if (s3Response.status !== 204) {
        setPhase("error");
        setFeedback("头像准备失败，请稍后再试");
        finishRequest(requestController);
        return;
      }

      let confirmResponse: Response;

      try {
        confirmResponse = await fetch("/api/profile/avatar/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: requestController.signal,
          body: JSON.stringify({ objectKey: body.objectKey })
        });
      } catch {
        if (requestController.signal.aborted) {
          finishRequest(requestController);
          return;
        }

        setPhase("error");
        setFeedback("网络连接失败，请稍后再试");
        finishRequest(requestController);
        return;
      }

      if (requestController.signal.aborted) {
        finishRequest(requestController);
        return;
      }

      let confirmBody: unknown;

      try {
        confirmBody = await confirmResponse.json();
      } catch {
        if (requestController.signal.aborted) {
          finishRequest(requestController);
          return;
        }

        setPhase("error");
        setFeedback(MALFORMED_RESPONSE_MESSAGE);
        finishRequest(requestController);
        return;
      }

      if (requestController.signal.aborted) {
        finishRequest(requestController);
        return;
      }

      if (confirmResponse.status === 200 && isConfirmResponse(confirmBody)) {
        setIntent(null);
        setSelectedFile(null);
        setPhase("uploaded");
        setFeedback("原图已上传，等待处理");
      } else {
        setPhase("error");
        setFeedback(MALFORMED_RESPONSE_MESSAGE);
      }
    } else if (intentResponse.status === 200) {
      setPhase("error");
      setFeedback(MALFORMED_RESPONSE_MESSAGE);
    } else if (intentResponse.status === 400) {
      setPhase("error");
      setFeedback(
        isErrorBody(body) ? body.error : MALFORMED_RESPONSE_MESSAGE
      );
    } else if (intentResponse.status === 401) {
      setPhase("error");
      setFeedback("登录已过期，请重新登录");
      setShowAuthLink(true);
    } else if (intentResponse.status === 429) {
      setPhase("error");
      setFeedback("请求过于频繁，请稍后再试");
    } else if (intentResponse.status === 503) {
      setPhase("error");
      setFeedback("头像服务暂时不可用，请稍后再试");
    } else {
      setPhase("error");
      setFeedback("头像准备失败，请稍后再试");
    }

    finishRequest(requestController);
  }

  const statusLabel =
    phase === "initial"
      ? INITIAL_STATUS_LABELS[initialStatus]
      : phase === "validating"
        ? "正在校验头像"
        : phase === "valid"
          ? "已验证，等待准备"
          : phase === "pending"
            ? "正在准备头像"
            : phase === "pending_s3"
              ? "待接入 S3"
              : phase === "uploaded"
                ? "原图已上传，等待处理"
                : "准备失败";
  const isSubmitting = phase === "pending" || phase === "pending_s3";

  return (
    <div className="w-full min-w-0">
      <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex shrink-0 items-center gap-3">
          <div
            role="img"
            aria-label={`当前头像首字母 ${avatarInitial}`}
            className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-[radial-gradient(circle_at_30%_30%,rgba(125,211,252,0.96)_0%,rgba(37,99,235,0.88)_58%,rgba(15,23,42,0.94)_100%)] text-3xl font-semibold text-white shadow-[0_18px_48px_rgba(37,99,235,0.24)]"
          >
            {avatarInitial}
          </div>

          {previewUrl ? (
            <div className="min-w-0">
              <Image
                src={previewUrl}
                alt="所选头像的本地预览"
                width={96}
                height={96}
                unoptimized
                className="h-24 w-24 rounded-[28px] object-cover shadow-[0_18px_48px_rgba(15,23,42,0.14)]"
              />
              <p className="mt-2 max-w-24 text-center text-xs leading-4 text-slate-500">
                本地预览，尚未保存
              </p>
            </div>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-950">头像准备</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            支持 JPEG、PNG、WebP，文件不超过 5 MiB。
          </p>
          <p
            className="mt-2 text-sm font-medium text-sky-700"
            role="status"
            aria-live="polite"
          >
            {statusLabel}
          </p>
        </div>
      </div>

      <form
        className="mt-5 flex min-w-0 flex-col gap-3 sm:flex-row"
        onSubmit={handleSubmit}
      >
        <input
          id="avatar-file"
          className="peer sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          disabled={isSubmitting}
        />
        <label
          htmlFor="avatar-file"
          className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950 peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-sky-500 peer-focus-visible:ring-offset-2"
        >
          选择头像文件
        </label>
        <button
          type="submit"
          disabled={!intent || isSubmitting}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-medium text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          上传头像
        </button>
      </form>

      {feedback ? (
        <div
          className={`mt-4 rounded-2xl border px-4 py-3 text-sm leading-6 ${
            phase === "pending_s3" || phase === "uploaded"
              ? "border-sky-200 bg-sky-50 text-sky-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
          role={phase === "error" ? "alert" : "status"}
        >
          {feedback}
          {showAuthLink ? (
            <>
              {" "}
              <Link
                href="/auth"
                className="inline-flex min-h-11 items-center font-semibold underline decoration-rose-300 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              >
                前往登录
              </Link>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
