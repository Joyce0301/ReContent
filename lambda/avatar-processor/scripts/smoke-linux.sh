#!/usr/bin/env bash
set -euo pipefail

node --input-type=module <<'EOF'
import sharp from "sharp";

if (process.platform !== "linux" || process.arch !== "x64") {
  throw new Error(`Expected linux/x64, received ${process.platform}/${process.arch}`);
}

const output = await sharp({
  create: {
    width: 2,
    height: 2,
    channels: 4,
    background: { r: 20, g: 80, b: 160, alpha: 0.5 }
  }
})
  .webp({ quality: 80 })
  .toBuffer();
const metadata = await sharp(output).metadata();

if (metadata.format !== "webp" || metadata.width !== 2 || metadata.height !== 2) {
  throw new Error("sharp Linux smoke transform failed");
}

await import("./index.mjs");
console.log("Lambda linux/x64 sharp smoke test passed");
EOF
