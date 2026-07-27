import "server-only";

import {
  acquireAvatarConfirmationLease,
  completeAvatarConfirmation,
  failAvatarConfirmation,
  failPendingAvatarUpload,
  getAvatarUploadState
} from "../auth/user-store";
import { parseAvatarStagingKey } from "./object-key";
import {
  copyAvatarToConfirmed,
  headAvatarObject,
  type AvatarObjectMetadata
} from "./s3-storage";
import {
  AvatarStorageConflictError,
  AvatarStorageNotFoundError,
  AvatarStoragePreconditionError
} from "./storage-errors";
import { MAX_AVATAR_SIZE_BYTES } from "./validation";

export type ConfirmAvatarResult =
  | { ok: true; status: "uploaded"; confirmedKey: string }
  | {
      ok: false;
      reason:
        | "INVALID_KEY"
        | "STALE_INTENT"
        | "NOT_FOUND"
        | "INVALID_OBJECT"
        | "IN_PROGRESS";
    };

type ConfirmationContext = {
  confirmedKey: string;
  stagingKey: string;
  userId: string;
};

function uploaded(confirmedKey: string): ConfirmAvatarResult {
  return { ok: true, status: "uploaded", confirmedKey };
}

function isMatchingUploadedState(
  uploadState: Awaited<ReturnType<typeof getAvatarUploadState>>,
  confirmedKey: string
) {
  return (
    uploadState?.status === "uploaded" &&
    uploadState.key === confirmedKey
  );
}

async function readAfterLostCas(
  context: ConfirmationContext
): Promise<ConfirmAvatarResult> {
  const freshState = await getAvatarUploadState(context.userId);

  return isMatchingUploadedState(freshState, context.confirmedKey)
    ? uploaded(context.confirmedKey)
    : { ok: false, reason: "IN_PROGRESS" };
}

function isValidObjectMetadata(
  metadata: AvatarObjectMetadata,
  extension: "jpg" | "png" | "webp"
) {
  const expectedContentType =
    extension === "jpg"
      ? "image/jpeg"
      : extension === "png"
        ? "image/png"
        : "image/webp";

  return (
    Number.isInteger(metadata.contentLength) &&
    metadata.contentLength >= 1 &&
    metadata.contentLength <= MAX_AVATAR_SIZE_BYTES &&
    metadata.contentType === expectedContentType &&
    typeof metadata.eTag === "string" &&
    metadata.eTag.trim().length > 0
  );
}

async function completeWithLease(
  context: ConfirmationContext,
  leaseToken: string
): Promise<ConfirmAvatarResult> {
  const completed = await completeAvatarConfirmation({
    ...context,
    leaseToken
  });

  return completed
    ? uploaded(context.confirmedKey)
    : readAfterLostCas(context);
}

async function failPending(
  context: ConfirmationContext
): Promise<ConfirmAvatarResult> {
  const failed = await failPendingAvatarUpload({
    userId: context.userId,
    stagingKey: context.stagingKey
  });

  return failed
    ? { ok: false, reason: "INVALID_OBJECT" }
    : readAfterLostCas(context);
}

async function failWithLease(
  context: ConfirmationContext,
  leaseToken: string,
  reason: "INVALID_OBJECT" | "NOT_FOUND"
): Promise<ConfirmAvatarResult> {
  const failed = await failAvatarConfirmation({
    userId: context.userId,
    stagingKey: context.stagingKey,
    leaseToken
  });

  return failed ? { ok: false, reason } : readAfterLostCas(context);
}

async function recoverAfterConditionalCopy(
  context: ConfirmationContext,
  extension: "jpg" | "png" | "webp",
  leaseToken: string,
  copyError:
    | AvatarStorageConflictError
    | AvatarStoragePreconditionError
): Promise<ConfirmAvatarResult> {
  let confirmedMetadata: AvatarObjectMetadata;

  try {
    confirmedMetadata = await headAvatarObject(context.confirmedKey);
  } catch (error) {
    if (!(error instanceof AvatarStorageNotFoundError)) {
      throw error;
    }

    if (copyError instanceof AvatarStorageConflictError) {
      return { ok: false, reason: "IN_PROGRESS" };
    }

    return failWithLease(context, leaseToken, "INVALID_OBJECT");
  }

  if (!isValidObjectMetadata(confirmedMetadata, extension)) {
    return failWithLease(context, leaseToken, "INVALID_OBJECT");
  }

  return completeWithLease(context, leaseToken);
}

async function copyAndComplete(
  context: ConfirmationContext,
  extension: "jpg" | "png" | "webp",
  leaseToken: string,
  stagingMetadata: AvatarObjectMetadata
): Promise<ConfirmAvatarResult> {
  try {
    await copyAvatarToConfirmed({
      stagingKey: context.stagingKey,
      confirmedKey: context.confirmedKey,
      sourceETag: stagingMetadata.eTag
    });
  } catch (error) {
    if (
      error instanceof AvatarStoragePreconditionError ||
      error instanceof AvatarStorageConflictError
    ) {
      return recoverAfterConditionalCopy(
        context,
        extension,
        leaseToken,
        error
      );
    }

    throw error;
  }

  return completeWithLease(context, leaseToken);
}

async function confirmPending(
  context: ConfirmationContext,
  extension: "jpg" | "png" | "webp"
): Promise<ConfirmAvatarResult> {
  let stagingMetadata: AvatarObjectMetadata;

  try {
    stagingMetadata = await headAvatarObject(context.stagingKey);
  } catch (error) {
    if (error instanceof AvatarStorageNotFoundError) {
      return { ok: false, reason: "NOT_FOUND" };
    }

    throw error;
  }

  if (!isValidObjectMetadata(stagingMetadata, extension)) {
    return failPending(context);
  }

  const leaseToken = await acquireAvatarConfirmationLease({
    userId: context.userId,
    stagingKey: context.stagingKey
  });

  if (!leaseToken) {
    return readAfterLostCas(context);
  }

  return copyAndComplete(context, extension, leaseToken, stagingMetadata);
}

async function confirmStaleLease(
  context: ConfirmationContext,
  extension: "jpg" | "png" | "webp"
): Promise<ConfirmAvatarResult> {
  const leaseToken = await acquireAvatarConfirmationLease({
    userId: context.userId,
    stagingKey: context.stagingKey
  });

  if (!leaseToken) {
    return readAfterLostCas(context);
  }

  try {
    const confirmedMetadata = await headAvatarObject(context.confirmedKey);

    if (!isValidObjectMetadata(confirmedMetadata, extension)) {
      return failWithLease(context, leaseToken, "INVALID_OBJECT");
    }

    return completeWithLease(context, leaseToken);
  } catch (error) {
    if (!(error instanceof AvatarStorageNotFoundError)) {
      throw error;
    }
  }

  let stagingMetadata: AvatarObjectMetadata;

  try {
    stagingMetadata = await headAvatarObject(context.stagingKey);
  } catch (error) {
    if (error instanceof AvatarStorageNotFoundError) {
      return failWithLease(context, leaseToken, "NOT_FOUND");
    }

    throw error;
  }

  if (!isValidObjectMetadata(stagingMetadata, extension)) {
    return failWithLease(context, leaseToken, "INVALID_OBJECT");
  }

  return copyAndComplete(context, extension, leaseToken, stagingMetadata);
}

export async function confirmAvatarUpload(input: {
  userId: string;
  stagingKey: string;
}): Promise<ConfirmAvatarResult> {
  const parsedKey = parseAvatarStagingKey(input.stagingKey, input.userId);

  if (!parsedKey) {
    return { ok: false, reason: "INVALID_KEY" };
  }

  const context: ConfirmationContext = {
    userId: input.userId,
    stagingKey: input.stagingKey,
    confirmedKey: parsedKey.confirmedKey
  };
  const uploadState = await getAvatarUploadState(input.userId);

  if (isMatchingUploadedState(uploadState, context.confirmedKey)) {
    return uploaded(context.confirmedKey);
  }

  if (
    !uploadState ||
    uploadState.key !== context.stagingKey ||
    (uploadState.status !== "pending_upload" &&
      uploadState.status !== "confirming")
  ) {
    return { ok: false, reason: "STALE_INTENT" };
  }

  if (uploadState.status === "pending_upload") {
    return confirmPending(context, parsedKey.extension);
  }

  return confirmStaleLease(context, parsedKey.extension);
}
