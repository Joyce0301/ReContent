import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";

import { AvatarProcessorError } from "../src/errors";
import {
  MAX_INPUT_BYTES,
  transformAvatar
} from "../src/image-transform";

const fixtures = resolve(import.meta.dirname, "../fixtures");
let jpeg: Buffer;
let png: Buffer;
let webp: Buffer;

async function expectCode(input: Uint8Array, code: string) {
  await expect(transformAvatar(input)).rejects.toBeInstanceOf(
    AvatarProcessorError
  );
  await expect(transformAvatar(input)).rejects.toMatchObject({ code });
}

beforeAll(async () => {
  [jpeg, png, webp] = await Promise.all([
    readFile(resolve(fixtures, "avatar.jpg")),
    readFile(resolve(fixtures, "avatar.png")),
    readFile(resolve(fixtures, "avatar.webp"))
  ]);
});

describe("transformAvatar", () => {
  it.each([
    ["JPEG", () => jpeg],
    ["PNG", () => png],
    ["WebP", () => webp]
  ])("converts %s into one 512 x 512 WebP", async (_name, input) => {
    const output = await transformAvatar(input());
    const metadata = await sharp(output, { animated: true }).metadata();

    expect(metadata).toMatchObject({
      format: "webp",
      width: 512,
      height: 512
    });
    expect(metadata.pages ?? 1).toBe(1);
  });

  it("preserves transparency from an accepted PNG", async () => {
    const output = await transformAvatar(png);
    const metadata = await sharp(output).metadata();

    expect(metadata.hasAlpha).toBe(true);
  });

  it("applies orientation and strips source metadata", async () => {
    const oriented = await sharp({
      create: {
        width: 320,
        height: 640,
        channels: 3,
        background: { r: 20, g: 80, b: 160 }
      }
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    const output = await transformAvatar(oriented);
    const metadata = await sharp(output).metadata();

    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
  });

  it("rejects an input larger than 5 MiB before decoding", async () => {
    await expectCode(Buffer.alloc(MAX_INPUT_BYTES + 1), "INPUT_TOO_LARGE");
  });

  it("rejects corrupt image bytes", async () => {
    await expectCode(Buffer.from("not-an-image"), "INVALID_IMAGE");
  });

  it("rejects a decodable unsupported format", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'
    );

    await expectCode(svg, "UNSUPPORTED_IMAGE_FORMAT");
  });

  it("rejects animated or multi-page input", async () => {
    const first = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 }
      }
    })
      .png()
      .toBuffer();
    const second = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 4,
        background: { r: 0, g: 0, b: 255, alpha: 1 }
      }
    })
      .png()
      .toBuffer();
    const animated = await sharp([first, second], {
      join: { animated: true }
    })
      .gif({ delay: [100, 100], loop: 0 })
      .toBuffer();

    expect((await sharp(animated, { animated: true }).metadata()).pages).toBe(2);
    await expectCode(animated, "MULTI_PAGE_IMAGE");
  });

  it("rejects decoded dimensions above 40 million pixels", async () => {
    const oversized = await sharp({
      create: {
        width: 6325,
        height: 6325,
        channels: 3,
        background: { r: 1, g: 2, b: 3 }
      }
    })
      .png({ compressionLevel: 9 })
      .toBuffer();

    await expectCode(oversized, "IMAGE_TOO_LARGE_PIXELS");
  });
});
