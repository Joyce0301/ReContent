import sharp from "sharp";

import { AvatarProcessorError } from "./errors";

export const MAX_INPUT_BYTES = 5 * 1024 * 1024;
export const MAX_INPUT_PIXELS = 40_000_000;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

function asBuffer(input: Uint8Array) {
  return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
}

function rethrowKnown(error: unknown): never {
  if (error instanceof AvatarProcessorError) {
    throw error;
  }

  throw new AvatarProcessorError("INVALID_IMAGE");
}

export async function transformAvatar(input: Uint8Array): Promise<Buffer> {
  if (input.byteLength === 0) {
    throw new AvatarProcessorError("INVALID_IMAGE");
  }

  if (input.byteLength > MAX_INPUT_BYTES) {
    throw new AvatarProcessorError("INPUT_TOO_LARGE");
  }

  const source = asBuffer(input);

  try {
    const metadata = await sharp(source, {
      animated: true,
      failOn: "error",
      limitInputPixels: false
    }).metadata();

    if ((metadata.pages ?? 1) !== 1) {
      throw new AvatarProcessorError("MULTI_PAGE_IMAGE");
    }

    if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format)) {
      throw new AvatarProcessorError("UNSUPPORTED_IMAGE_FORMAT");
    }

    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > MAX_INPUT_PIXELS
    ) {
      throw new AvatarProcessorError("IMAGE_TOO_LARGE_PIXELS");
    }

    return await sharp(source, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS
    })
      .rotate()
      .resize(512, 512, { fit: "cover", position: "centre" })
      .webp({ quality: 80 })
      .toBuffer();
  } catch (error) {
    return rethrowKnown(error);
  }
}
