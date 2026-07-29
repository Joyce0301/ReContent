import { describe, expect, it } from "vitest";

import { createAvatarObjectKeys } from "../../../app/lib/avatar/object-key";
import { AvatarProcessorError } from "../src/errors";
import {
  parseAvatarEvent,
  parseAvatarRecord
} from "../src/event-record";

const bucket = "recontent-avatar-pipeline";

function record(
  key: unknown,
  overrides: {
    bucket?: unknown;
    eventName?: unknown;
    eventSource?: unknown;
  } = {}
) {
  return {
    eventSource: overrides.eventSource ?? "aws:s3",
    eventName: overrides.eventName ?? "ObjectCreated:Put",
    s3: {
      bucket: { name: overrides.bucket ?? bucket },
      object: { key }
    }
  };
}

function expectCode(action: () => unknown, code: string) {
  expect(action).toThrowError(AvatarProcessorError);

  try {
    action();
  } catch (error) {
    expect((error as AvatarProcessorError).code).toBe(code);
  }
}

describe("parseAvatarEvent", () => {
  it("accepts the S3 notification test event without object processing", () => {
    expect(
      parseAvatarEvent({
        Service: "Amazon S3",
        Event: "s3:TestEvent",
        Time: "2026-07-29T00:00:00.000Z"
      })
    ).toEqual({ kind: "test-event" });
  });

  it.each([null, {}, { Records: [] }, { Records: "not-an-array" }])(
    "rejects a malformed normal event",
    event => {
      expectCode(() => parseAvatarEvent(event), "INVALID_EVENT");
    }
  );

  it("returns the records without interpreting them", () => {
    const records = [record("original/confirmed/user-1/upload-1.webp")];

    expect(parseAvatarEvent({ Records: records })).toEqual({
      kind: "records",
      records
    });
  });
});

describe("parseAvatarRecord", () => {
  it.each([
    ["jpg", "processed/ready/user-1/upload-1-jpg.webp"],
    ["png", "processed/ready/user-1/upload-1-png.webp"],
    ["webp", "processed/ready/user-1/upload-1-webp.webp"]
  ])("maps a confirmed %s key to its deterministic ready key", (extension, destinationKey) => {
    expect(
      parseAvatarRecord(
        record(`original/confirmed/user-1/upload-1.${extension}`),
        bucket
      )
    ).toEqual({
      sourceKey: `original/confirmed/user-1/upload-1.${extension}`,
      destinationKey,
      userId: "user-1",
      uploadId: "upload-1"
    });
  });

  it("decodes S3 plus and percent encoding before applying the prefix", () => {
    expect(
      parseAvatarRecord(
        record("outside%2Ffolder%2Ffile+name.webp"),
        bucket
      )
    ).toBeNull();
  });

  it("ignores well-formed object-created records outside the source prefix", () => {
    expect(
      parseAvatarRecord(
        record("processed/ready/user-1/upload-1.webp"),
        bucket
      )
    ).toBeNull();
  });

  it.each([
    [record("original/confirmed/user-1/upload-1.webp", { eventSource: "aws:sqs" }), "INVALID_EVENT"],
    [record("original/confirmed/user-1/upload-1.webp", { eventName: "ObjectRemoved:Delete" }), "INVALID_EVENT"],
    [record("original/confirmed/user-1/upload-1.webp", { bucket: "other-bucket" }), "WRONG_BUCKET"],
    [record(42), "INVALID_EVENT"],
    [record("original%2Fconfirmed%2Fuser-1%2Fbad%ZZ.webp"), "INVALID_OBJECT_KEY_ENCODING"],
    [record("original/confirmed/user-1.webp"), "INVALID_OBJECT_KEY"],
    [record("original/confirmed/user-1/upload-1.gif"), "INVALID_OBJECT_KEY"],
    [record("original/confirmed/user 1/upload-1.webp"), "INVALID_OBJECT_KEY"],
    [record("original/confirmed/user-1/upload.1.webp"), "INVALID_OBJECT_KEY"],
    [record("original/confirmed/user-1/.webp"), "INVALID_OBJECT_KEY"]
  ] as const)("rejects unsafe records with %s", (input, code) => {
    expectCode(() => parseAvatarRecord(input, bucket), code);
  });

  it("accepts every confirmed key emitted by the application helper", () => {
    const keys = createAvatarObjectKeys({
      userId: "user-1",
      extension: "png",
      id: "upload-1"
    });

    expect(parseAvatarRecord(record(keys.confirmedKey), bucket)).toEqual({
      sourceKey: "original/confirmed/user-1/upload-1.png",
      destinationKey: "processed/ready/user-1/upload-1-png.webp",
      userId: "user-1",
      uploadId: "upload-1"
    });
  });
});
