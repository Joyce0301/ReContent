import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  acquireAvatarConfirmationLeaseMock,
  completeAvatarConfirmationMock,
  copyAvatarToConfirmedMock,
  failAvatarConfirmationMock,
  failPendingAvatarUploadMock,
  getAvatarUploadStateMock,
  headAvatarObjectMock
} = vi.hoisted(() => ({
  acquireAvatarConfirmationLeaseMock: vi.fn(),
  completeAvatarConfirmationMock: vi.fn(),
  copyAvatarToConfirmedMock: vi.fn(),
  failAvatarConfirmationMock: vi.fn(),
  failPendingAvatarUploadMock: vi.fn(),
  getAvatarUploadStateMock: vi.fn(),
  headAvatarObjectMock: vi.fn()
}));

vi.mock("server-only", () => ({}));

vi.mock("../auth/user-store", () => ({
  acquireAvatarConfirmationLease: acquireAvatarConfirmationLeaseMock,
  completeAvatarConfirmation: completeAvatarConfirmationMock,
  failAvatarConfirmation: failAvatarConfirmationMock,
  failPendingAvatarUpload: failPendingAvatarUploadMock,
  getAvatarUploadState: getAvatarUploadStateMock
}));

vi.mock("./s3-storage", () => ({
  copyAvatarToConfirmed: copyAvatarToConfirmedMock,
  headAvatarObject: headAvatarObjectMock
}));

import {
  AvatarStorageConflictError,
  AvatarStorageNotFoundError,
  AvatarStoragePreconditionError,
  AvatarStorageUnavailableError
} from "./storage-errors";
import { confirmAvatarUpload } from "./confirm-upload";

const stagingKey = "original/pending/user-1/upload-1.webp";
const confirmedKey = "original/confirmed/user-1/upload-1.webp";
const leaseToken = "lease-token-1";
const validMetadata = {
  contentLength: 1024,
  contentType: "image/webp",
  eTag: '"source-etag"'
};

function state(
  status: "pending_upload" | "confirming" | "uploaded",
  key = status === "uploaded" ? confirmedKey : stagingKey
) {
  return {
    key,
    status,
    updatedAt: "2026-07-27T12:00:00.000Z"
  };
}

function expectNoS3OrWrites() {
  expect(headAvatarObjectMock).not.toHaveBeenCalled();
  expect(copyAvatarToConfirmedMock).not.toHaveBeenCalled();
  expect(acquireAvatarConfirmationLeaseMock).not.toHaveBeenCalled();
  expect(completeAvatarConfirmationMock).not.toHaveBeenCalled();
  expect(failPendingAvatarUploadMock).not.toHaveBeenCalled();
  expect(failAvatarConfirmationMock).not.toHaveBeenCalled();
}

function expectNoTerminalWritesAfterAcquireLoss() {
  expect(copyAvatarToConfirmedMock).not.toHaveBeenCalled();
  expect(completeAvatarConfirmationMock).not.toHaveBeenCalled();
  expect(failPendingAvatarUploadMock).not.toHaveBeenCalled();
  expect(failAvatarConfirmationMock).not.toHaveBeenCalled();
}

beforeEach(() => {
  getAvatarUploadStateMock.mockResolvedValue(state("pending_upload"));
  headAvatarObjectMock.mockResolvedValue(validMetadata);
  acquireAvatarConfirmationLeaseMock.mockResolvedValue(leaseToken);
  copyAvatarToConfirmedMock.mockResolvedValue(undefined);
  completeAvatarConfirmationMock.mockResolvedValue(true);
  failPendingAvatarUploadMock.mockResolvedValue(true);
  failAvatarConfirmationMock.mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("confirmAvatarUpload", () => {
  it.each([
    "not-an-avatar-key",
    "original/pending/other-user/upload-1.webp",
    "original/pending/user-1/../upload-1.webp"
  ])("rejects malformed or cross-user key before DB and S3: %s", async key => {
    await expect(
      confirmAvatarUpload({ userId: "user-1", stagingKey: key })
    ).resolves.toEqual({ ok: false, reason: "INVALID_KEY" });

    expect(getAvatarUploadStateMock).not.toHaveBeenCalled();
    expectNoS3OrWrites();
  });

  it("returns idempotent success for the matching uploaded key without S3", async () => {
    getAvatarUploadStateMock.mockResolvedValueOnce(state("uploaded"));

    await expect(
      confirmAvatarUpload({ userId: "user-1", stagingKey })
    ).resolves.toEqual({
      ok: true,
      status: "uploaded",
      confirmedKey
    });

    expectNoS3OrWrites();
  });

  it.each([
    null,
    { key: "original/pending/user-1/other.webp", status: "pending_upload", updatedAt: null },
    { key: stagingKey, status: "failed", updatedAt: null },
    { key: stagingKey, status: "ready", updatedAt: null }
  ])("rejects a stale key or ineligible state before S3: %j", async uploadState => {
    getAvatarUploadStateMock.mockResolvedValueOnce(uploadState);

    await expect(
      confirmAvatarUpload({ userId: "user-1", stagingKey })
    ).resolves.toEqual({ ok: false, reason: "STALE_INTENT" });

    expectNoS3OrWrites();
  });

  it("heads staging before acquiring, copies with its ETag, and completes with one token", async () => {
    const calls: string[] = [];
    headAvatarObjectMock.mockImplementationOnce(async () => {
      calls.push("head-staging");
      return validMetadata;
    });
    acquireAvatarConfirmationLeaseMock.mockImplementationOnce(async () => {
      calls.push("acquire");
      return leaseToken;
    });
    copyAvatarToConfirmedMock.mockImplementationOnce(async () => {
      calls.push("copy");
    });
    completeAvatarConfirmationMock.mockImplementationOnce(async () => {
      calls.push("complete");
      return true;
    });

    await expect(
      confirmAvatarUpload({ userId: "user-1", stagingKey })
    ).resolves.toEqual({
      ok: true,
      status: "uploaded",
      confirmedKey
    });

    expect(calls).toEqual(["head-staging", "acquire", "copy", "complete"]);
    expect(headAvatarObjectMock).toHaveBeenCalledWith(stagingKey);
    expect(acquireAvatarConfirmationLeaseMock).toHaveBeenCalledWith({
      userId: "user-1",
      stagingKey
    });
    expect(copyAvatarToConfirmedMock).toHaveBeenCalledWith({
      stagingKey,
      confirmedKey,
      sourceETag: '"source-etag"'
    });
    expect(completeAvatarConfirmationMock).toHaveBeenCalledWith({
      userId: "user-1",
      stagingKey,
      confirmedKey,
      leaseToken
    });
  });

  it("returns NOT_FOUND when pending staging is absent without changing state", async () => {
    headAvatarObjectMock.mockRejectedValueOnce(
      new AvatarStorageNotFoundError()
    );

    await expect(
      confirmAvatarUpload({ userId: "user-1", stagingKey })
    ).resolves.toEqual({ ok: false, reason: "NOT_FOUND" });

    expect(acquireAvatarConfirmationLeaseMock).not.toHaveBeenCalled();
    expect(copyAvatarToConfirmedMock).not.toHaveBeenCalled();
    expect(failPendingAvatarUploadMock).not.toHaveBeenCalled();
    expect(failAvatarConfirmationMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...validMetadata, contentLength: 0 }, "zero length"],
    [{ ...validMetadata, contentLength: 5 * 1024 * 1024 + 1 }, "oversize"],
    [{ ...validMetadata, contentLength: 1.5 }, "fractional length"],
    [{ ...validMetadata, contentType: "image/gif" }, "unsupported type"],
    [{ ...validMetadata, contentType: "image/png" }, "extension mismatch"],
    [{ ...validMetadata, eTag: "   " }, "blank ETag"]
  ])("conditionally fails invalid pending metadata: %s", async (metadata) => {
    headAvatarObjectMock.mockResolvedValueOnce(metadata);

    await expect(
      confirmAvatarUpload({ userId: "user-1", stagingKey })
    ).resolves.toEqual({ ok: false, reason: "INVALID_OBJECT" });

    expect(failPendingAvatarUploadMock).toHaveBeenCalledWith({
      userId: "user-1",
      stagingKey
    });
    expect(acquireAvatarConfirmationLeaseMock).not.toHaveBeenCalled();
    expect(copyAvatarToConfirmedMock).not.toHaveBeenCalled();
    expect(failAvatarConfirmationMock).not.toHaveBeenCalled();
  });

  it.each([
    ["uploaded", state("uploaded"), { ok: true, status: "uploaded", confirmedKey }],
    ["not uploaded", state("confirming"), { ok: false, reason: "IN_PROGRESS" }]
  ] as const)(
    "stops after pending lease acquisition loss when fresh state is %s",
    async (_label, freshState, expected) => {
      acquireAvatarConfirmationLeaseMock.mockResolvedValueOnce(null);
      getAvatarUploadStateMock
        .mockResolvedValueOnce(state("pending_upload"))
        .mockResolvedValueOnce(freshState);

      await expect(
        confirmAvatarUpload({ userId: "user-1", stagingKey })
      ).resolves.toEqual(expected);

      expect(headAvatarObjectMock).toHaveBeenCalledOnce();
      expectNoTerminalWritesAfterAcquireLoss();
    }
  );

  it.each([
    ["fresh confirming", state("confirming"), { ok: false, reason: "IN_PROGRESS" }],
    ["concurrent completion", state("uploaded"), { ok: true, status: "uploaded", confirmedKey }]
  ] as const)(
    "uses lease CAS, not a JS clock, and stops without S3 for %s",
    async (_label, freshState, expected) => {
      getAvatarUploadStateMock
        .mockResolvedValueOnce(state("confirming"))
        .mockResolvedValueOnce(freshState);
      acquireAvatarConfirmationLeaseMock.mockResolvedValueOnce(null);

      await expect(
        confirmAvatarUpload({ userId: "user-1", stagingKey })
      ).resolves.toEqual(expected);

      expect(acquireAvatarConfirmationLeaseMock).toHaveBeenCalledWith({
        userId: "user-1",
        stagingKey
      });
      expectNoTerminalWritesAfterAcquireLoss();
      expect(headAvatarObjectMock).not.toHaveBeenCalled();
    }
  );

  it("reacquires confirming before heading confirmed and completes without copying", async () => {
    const calls: string[] = [];
    getAvatarUploadStateMock.mockResolvedValueOnce(state("confirming"));
    acquireAvatarConfirmationLeaseMock.mockImplementationOnce(async () => {
      calls.push("reacquire");
      return "new-token";
    });
    headAvatarObjectMock.mockImplementationOnce(async () => {
      calls.push("head-confirmed");
      return validMetadata;
    });
    completeAvatarConfirmationMock.mockImplementationOnce(async () => {
      calls.push("complete");
      return true;
    });

    await expect(
      confirmAvatarUpload({ userId: "user-1", stagingKey })
    ).resolves.toEqual({
      ok: true,
      status: "uploaded",
      confirmedKey
    });

    expect(calls).toEqual(["reacquire", "head-confirmed", "complete"]);
    expect(headAvatarObjectMock).toHaveBeenCalledWith(confirmedKey);
    expect(copyAvatarToConfirmedMock).not.toHaveBeenCalled();
    expect(completeAvatarConfirmationMock).toHaveBeenCalledWith({
      userId: "user-1",
      stagingKey,
      confirmedKey,
      leaseToken: "new-token"
    });
  });

  it("reacquires confirming, heads confirmed then staging, and conditionally copies", async () => {
    getAvatarUploadStateMock.mockResolvedValueOnce(state("confirming"));
    headAvatarObjectMock
      .mockRejectedValueOnce(new AvatarStorageNotFoundError())
      .mockResolvedValueOnce(validMetadata);

    await expect(
      confirmAvatarUpload({ userId: "user-1", stagingKey })
    ).resolves.toMatchObject({ ok: true, confirmedKey });

    expect(headAvatarObjectMock.mock.calls).toEqual([
      [confirmedKey],
      [stagingKey]
    ]);
    expect(copyAvatarToConfirmedMock).toHaveBeenCalledWith({
      stagingKey,
      confirmedKey,
      sourceETag: '"source-etag"'
    });
  });

  it.each([
    [{ ...validMetadata, contentLength: 0 }, "length"],
    [{ ...validMetadata, contentType: "image/png" }, "extension"],
    [{ ...validMetadata, contentType: "application/octet-stream" }, "type"]
  ])("fails invalid confirmed metadata with the reacquired token: %s", async metadata => {
    getAvatarUploadStateMock.mockResolvedValueOnce(state("confirming"));
    headAvatarObjectMock.mockResolvedValueOnce(metadata);

    await expect(
      confirmAvatarUpload({ userId: "user-1", stagingKey })
    ).resolves.toEqual({ ok: false, reason: "INVALID_OBJECT" });

    expect(failAvatarConfirmationMock).toHaveBeenCalledWith({
      userId: "user-1",
      stagingKey,
      leaseToken
    });
    expect(copyAvatarToConfirmedMock).not.toHaveBeenCalled();
  });

  it("conditionally fails with the reacquired token when both keys are missing", async () => {
    getAvatarUploadStateMock.mockResolvedValueOnce(state("confirming"));
    headAvatarObjectMock
      .mockRejectedValueOnce(new AvatarStorageNotFoundError())
      .mockRejectedValueOnce(new AvatarStorageNotFoundError());

    await expect(
      confirmAvatarUpload({ userId: "user-1", stagingKey })
    ).resolves.toEqual({ ok: false, reason: "NOT_FOUND" });

    expect(headAvatarObjectMock.mock.calls).toEqual([
      [confirmedKey],
      [stagingKey]
    ]);
    expect(failAvatarConfirmationMock).toHaveBeenCalledWith({
      userId: "user-1",
      stagingKey,
      leaseToken
    });
    expect(copyAvatarToConfirmedMock).not.toHaveBeenCalled();
  });

  it.each([
    ["precondition", new AvatarStoragePreconditionError()],
    ["conflict", new AvatarStorageConflictError()]
  ])(
    "recovers a destination %s by heading confirmed and never copying twice",
    async (_label, copyError) => {
      copyAvatarToConfirmedMock.mockRejectedValueOnce(copyError);
      headAvatarObjectMock
        .mockResolvedValueOnce(validMetadata)
        .mockResolvedValueOnce(validMetadata);

      await expect(
        confirmAvatarUpload({ userId: "user-1", stagingKey })
      ).resolves.toMatchObject({ ok: true, confirmedKey });

      expect(copyAvatarToConfirmedMock).toHaveBeenCalledOnce();
      expect(headAvatarObjectMock.mock.calls).toEqual([
        [stagingKey],
        [confirmedKey]
      ]);
      expect(completeAvatarConfirmationMock).toHaveBeenCalledOnce();
    }
  );

  it("conditionally fails a changed source when precondition recovery finds no confirmed object", async () => {
    copyAvatarToConfirmedMock.mockRejectedValueOnce(
      new AvatarStoragePreconditionError()
    );
    headAvatarObjectMock
      .mockResolvedValueOnce(validMetadata)
      .mockRejectedValueOnce(new AvatarStorageNotFoundError());

    await expect(
      confirmAvatarUpload({ userId: "user-1", stagingKey })
    ).resolves.toEqual({ ok: false, reason: "INVALID_OBJECT" });

    expect(copyAvatarToConfirmedMock).toHaveBeenCalledOnce();
    expect(failAvatarConfirmationMock).toHaveBeenCalledWith({
      userId: "user-1",
      stagingKey,
      leaseToken
    });
  });

  it("returns IN_PROGRESS for destination conflict when confirmed is still absent", async () => {
    copyAvatarToConfirmedMock.mockRejectedValueOnce(
      new AvatarStorageConflictError()
    );
    headAvatarObjectMock
      .mockResolvedValueOnce(validMetadata)
      .mockRejectedValueOnce(new AvatarStorageNotFoundError());

    await expect(
      confirmAvatarUpload({ userId: "user-1", stagingKey })
    ).resolves.toEqual({ ok: false, reason: "IN_PROGRESS" });

    expect(copyAvatarToConfirmedMock).toHaveBeenCalledOnce();
    expect(completeAvatarConfirmationMock).not.toHaveBeenCalled();
    expect(failAvatarConfirmationMock).not.toHaveBeenCalled();
  });

  it("uses a fresh read when stale-owner completion loses its token CAS", async () => {
    completeAvatarConfirmationMock.mockResolvedValueOnce(false);
    getAvatarUploadStateMock
      .mockResolvedValueOnce(state("pending_upload"))
      .mockResolvedValueOnce(state("confirming"));

    await expect(
      confirmAvatarUpload({ userId: "user-1", stagingKey })
    ).resolves.toEqual({ ok: false, reason: "IN_PROGRESS" });

    expect(completeAvatarConfirmationMock).toHaveBeenCalledWith(
      expect.objectContaining({ leaseToken })
    );
    expect(getAvatarUploadStateMock).toHaveBeenCalledTimes(2);
  });

  it("accepts only matching uploaded state after a lost completion CAS", async () => {
    completeAvatarConfirmationMock.mockResolvedValueOnce(false);
    getAvatarUploadStateMock
      .mockResolvedValueOnce(state("pending_upload"))
      .mockResolvedValueOnce(state("uploaded"));

    await expect(
      confirmAvatarUpload({ userId: "user-1", stagingKey })
    ).resolves.toEqual({
      ok: true,
      status: "uploaded",
      confirmedKey
    });
  });

  it("uses a fresh read when pending failure loses its CAS", async () => {
    headAvatarObjectMock.mockResolvedValueOnce({
      ...validMetadata,
      contentLength: 0
    });
    failPendingAvatarUploadMock.mockResolvedValueOnce(false);
    getAvatarUploadStateMock
      .mockResolvedValueOnce(state("pending_upload"))
      .mockResolvedValueOnce(state("confirming"));

    await expect(
      confirmAvatarUpload({ userId: "user-1", stagingKey })
    ).resolves.toEqual({ ok: false, reason: "IN_PROGRESS" });

    expect(failAvatarConfirmationMock).not.toHaveBeenCalled();
    expect(getAvatarUploadStateMock).toHaveBeenCalledTimes(2);
  });

  it("uses a fresh read when stale-owner leased failure loses its token CAS", async () => {
    getAvatarUploadStateMock
      .mockResolvedValueOnce(state("confirming"))
      .mockResolvedValueOnce(state("uploaded"));
    headAvatarObjectMock
      .mockRejectedValueOnce(new AvatarStorageNotFoundError())
      .mockRejectedValueOnce(new AvatarStorageNotFoundError());
    failAvatarConfirmationMock.mockResolvedValueOnce(false);

    await expect(
      confirmAvatarUpload({ userId: "user-1", stagingKey })
    ).resolves.toEqual({
      ok: true,
      status: "uploaded",
      confirmedKey
    });

    expect(failAvatarConfirmationMock).toHaveBeenCalledWith({
      userId: "user-1",
      stagingKey,
      leaseToken
    });
    expect(getAvatarUploadStateMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["403", "head", new AvatarStorageUnavailableError()],
    ["credential", "copy", new AvatarStorageUnavailableError()],
    ["network", "recovery", new AvatarStorageUnavailableError()]
  ])("preserves typed unavailable errors from %s failures", async (_label, stage, error) => {
    if (stage === "head") {
      headAvatarObjectMock.mockRejectedValueOnce(error);
    } else if (stage === "copy") {
      copyAvatarToConfirmedMock.mockRejectedValueOnce(error);
    } else {
      copyAvatarToConfirmedMock.mockRejectedValueOnce(
        new AvatarStorageConflictError()
      );
      headAvatarObjectMock
        .mockResolvedValueOnce(validMetadata)
        .mockRejectedValueOnce(error);
    }

    await expect(
      confirmAvatarUpload({ userId: "user-1", stagingKey })
    ).rejects.toBe(error);
  });
});
