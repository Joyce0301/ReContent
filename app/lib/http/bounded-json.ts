export type BoundedJsonResult =
  | { ok: true; value: unknown }
  | {
      ok: false;
      reason:
        | "INVALID_CONTENT_LENGTH"
        | "TOO_LARGE"
        | "INVALID_JSON"
        | "READ_FAILED";
    };

export async function readBoundedJson(
  request: Request,
  maxBytes: number
): Promise<BoundedJsonResult> {
  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      return { ok: false, reason: "INVALID_CONTENT_LENGTH" };
    }

    if (BigInt(contentLength) > BigInt(maxBytes)) {
      return { ok: false, reason: "TOO_LARGE" };
    }
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  if (request.body) {
    const reader = request.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        byteLength += value.byteLength;

        if (byteLength > maxBytes) {
          try {
            await reader.cancel();
          } catch {
            // The size limit result is stable even if the source cannot cancel.
          }

          return { ok: false, reason: "TOO_LARGE" };
        }

        chunks.push(value);
      }
    } catch {
      return { ok: false, reason: "READ_FAILED" };
    } finally {
      reader.releaseLock();
    }
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(body)) };
  } catch {
    return { ok: false, reason: "INVALID_JSON" };
  }
}
