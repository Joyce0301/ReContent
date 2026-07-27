import { describe, expect, it } from "vitest";
import { readBoundedJson } from "./bounded-json";

function createStreamRequest(
  stream: ReadableStream<Uint8Array>,
  headers: Record<string, string> = {}
) {
  return new Request("http://localhost/test", {
    method: "POST",
    headers,
    body: stream,
    duplex: "half"
  } as RequestInit & { duplex: "half" });
}

describe("readBoundedJson", () => {
  it("reads valid JSON within the byte limit", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify({ avatar: "image.webp" })
    });

    await expect(readBoundedJson(request, 8192)).resolves.toEqual({
      ok: true,
      value: { avatar: "image.webp" }
    });
  });

  it.each(["", "-1", "invalid", "1, 2", "1.5"])(
    "rejects invalid Content-Length %j",
    async contentLength => {
      const request = new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Length": contentLength },
        body: "{}"
      });

      await expect(readBoundedJson(request, 8192)).resolves.toEqual({
        ok: false,
        reason: "INVALID_CONTENT_LENGTH"
      });
    }
  );

  it("rejects an over-limit declared size", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Length": "8193" },
      body: "{}"
    });

    await expect(readBoundedJson(request, 8192)).resolves.toEqual({
      ok: false,
      reason: "TOO_LARGE"
    });
  });

  it("rejects an over-limit streamed size", async () => {
    const request = createStreamRequest(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(8193));
          controller.close();
        }
      })
    );

    await expect(readBoundedJson(request, 8192)).resolves.toEqual({
      ok: false,
      reason: "TOO_LARGE"
    });
  });

  it("rejects malformed JSON", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: "{"
    });

    await expect(readBoundedJson(request, 8192)).resolves.toEqual({
      ok: false,
      reason: "INVALID_JSON"
    });
  });

  it("returns READ_FAILED when the stream read rejects", async () => {
    const request = createStreamRequest(
      new ReadableStream({
        start(controller) {
          controller.error(new Error("request aborted"));
        }
      })
    );

    expect(await readBoundedJson(request, 8192)).toEqual({
      ok: false,
      reason: "READ_FAILED"
    });
  });
});
