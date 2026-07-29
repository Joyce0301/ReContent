import {
  GetObjectCommand,
  PutObjectCommand
} from "@aws-sdk/client-s3";
import type { Context } from "aws-lambda";
import { describe, expect, it } from "vitest";

import { AvatarProcessorError } from "../src/errors";
import { createHandler } from "../src/handler";
import { MAX_INPUT_BYTES } from "../src/image-transform";

const bucket = "recontent-avatar-pipeline";
const context = {
  awsRequestId: "request-1"
} as Context;

function event(keys: string[]) {
  return {
    Records: keys.map(key => ({
      eventSource: "aws:s3",
      eventName: "ObjectCreated:Put",
      s3: {
        bucket: { name: bucket },
        object: { key: encodeURIComponent(key).replaceAll("%2F", "/") }
      }
    }))
  };
}

function body(bytes: Uint8Array) {
  return {
    transformToByteArray: async () => bytes
  };
}

function harness(options: {
  getObject?: (key: string) => Promise<Record<string, unknown>>;
  putObject?: (input: Record<string, unknown>) => Promise<void>;
  transform?: (input: Uint8Array) => Promise<Buffer>;
} = {}) {
  const commands: unknown[] = [];
  const logs: Record<string, unknown>[] = [];
  const s3 = {
    async send(command: unknown) {
      commands.push(command);

      if (command instanceof GetObjectCommand) {
        return options.getObject
          ? options.getObject(String(command.input.Key))
          : {
              ContentLength: 3,
              Body: body(Uint8Array.from([1, 2, 3]))
            };
      }

      if (command instanceof PutObjectCommand) {
        await options.putObject?.(
          command.input as unknown as Record<string, unknown>
        );
        return {};
      }

      throw new Error("unexpected command");
    }
  };
  const transform =
    options.transform ?? (async () => Buffer.from("processed-webp"));

  return {
    commands,
    logs,
    run: createHandler({
      getBucketName: () => bucket,
      log: entry => logs.push(entry),
      s3,
      transform
    })
  };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AvatarProcessorError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe("avatar processor handler", () => {
  it("accepts an S3 test event without touching objects", async () => {
    const { commands, logs, run } = harness();

    await run({ Event: "s3:TestEvent" }, context);

    expect(commands).toEqual([]);
    expect(logs).toEqual([
      {
        requestId: "request-1",
        stage: "event",
        result: "test_event_ignored"
      }
    ]);
  });

  it("ignores object-created records outside the confirmed prefix", async () => {
    const { commands, run } = harness();

    await run(event(["processed/ready/user-1/upload-1.webp"]), context);

    expect(commands).toEqual([]);
  });

  it("reads, transforms, and writes the deterministic ready object", async () => {
    const { commands, logs, run } = harness();

    await run(event(["original/confirmed/user-1/upload-1.png"]), context);

    expect(commands).toHaveLength(2);
    expect(commands[0]).toBeInstanceOf(GetObjectCommand);
    expect((commands[0] as GetObjectCommand).input).toEqual({
      Bucket: bucket,
      Key: "original/confirmed/user-1/upload-1.png"
    });
    expect(commands[1]).toBeInstanceOf(PutObjectCommand);
    expect((commands[1] as PutObjectCommand).input).toEqual({
      Bucket: bucket,
      Key: "processed/ready/user-1/upload-1-png.webp",
      Body: Buffer.from("processed-webp"),
      ContentType: "image/webp",
      CacheControl: "private, max-age=31536000, immutable"
    });
    expect(logs.at(-1)).toEqual({
      requestId: "request-1",
      stage: "write",
      result: "ready",
      uploadId: "upload-1"
    });
  });

  it("rejects a declared object larger than 5 MiB without reading its body", async () => {
    let bodyRead = false;
    const { run } = harness({
      getObject: async () => ({
        ContentLength: MAX_INPUT_BYTES + 1,
        Body: {
          transformToByteArray: async () => {
            bodyRead = true;
            return new Uint8Array();
          }
        }
      })
    });

    await expectCode(
      run(event(["original/confirmed/user-1/upload-1.png"]), context),
      "BATCH_PROCESSING_FAILED"
    );
    expect(bodyRead).toBe(false);
  });

  it("rejects actual body bytes larger than 5 MiB", async () => {
    const { run } = harness({
      getObject: async () => ({
        Body: body(new Uint8Array(MAX_INPUT_BYTES + 1))
      })
    });

    await expectCode(
      run(event(["original/confirmed/user-1/upload-1.png"]), context),
      "BATCH_PROCESSING_FAILED"
    );
  });

  it("fails safely when S3 returns no readable body", async () => {
    const { run } = harness({
      getObject: async () => ({ ContentLength: 1 })
    });

    await expectCode(
      run(event(["original/confirmed/user-1/upload-1.png"]), context),
      "BATCH_PROCESSING_FAILED"
    );
  });

  it("attempts later records before aggregating an earlier failure", async () => {
    const written: string[] = [];
    const { run } = harness({
      getObject: async key => ({
        ContentLength: 1,
        Body: body(
          Uint8Array.from([key.includes("bad-upload") ? 0 : 1])
        )
      }),
      transform: async input => {
        if (input[0] === 0) {
          throw new AvatarProcessorError("INVALID_IMAGE");
        }

        return Buffer.from("ok");
      },
      putObject: async input => {
        written.push(String(input.Key));
      }
    });

    await expectCode(
      run(
        event([
          "original/confirmed/user-1/bad-upload.png",
          "original/confirmed/user-1/good-upload.png"
        ]),
        context
      ),
      "BATCH_PROCESSING_FAILED"
    );
    expect(written).toEqual([
      "processed/ready/user-1/good-upload-png.webp"
    ]);
  });

  it("uses the same destination key on duplicate delivery", async () => {
    const written: string[] = [];
    const { run } = harness({
      putObject: async input => {
        written.push(String(input.Key));
      }
    });
    const duplicate = event([
      "original/confirmed/user-1/upload-1.webp"
    ]);

    await run(duplicate, context);
    await run(duplicate, context);

    expect(written).toEqual([
      "processed/ready/user-1/upload-1-webp.webp",
      "processed/ready/user-1/upload-1-webp.webp"
    ]);
  });

  it("does not leak object keys or raw AWS errors into logs", async () => {
    const { logs, run } = harness({
      getObject: async () => {
        throw new Error(
          "secret AKIA original/confirmed/user-1/private-upload.png"
        );
      }
    });

    await expectCode(
      run(
        event(["original/confirmed/user-1/private-upload.png"]),
        context
      ),
      "BATCH_PROCESSING_FAILED"
    );

    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain("AKIA");
    expect(serialized).not.toContain("original/confirmed");
    expect(serialized).not.toContain("private-upload.png");
    expect(serialized).toContain("S3_READ_FAILED");
  });

  it("fails closed when the bucket environment value is missing", async () => {
    const run = createHandler({
      getBucketName: () => undefined,
      log: () => undefined,
      s3: { send: async () => undefined },
      transform: async () => Buffer.alloc(0)
    });

    await expectCode(
      run(event(["original/confirmed/user-1/upload-1.png"]), context),
      "CONFIGURATION_ERROR"
    );
  });
});
