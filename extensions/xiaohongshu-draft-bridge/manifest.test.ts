import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("xiaohongshu draft bridge manifest", () => {
  it("keeps host permissions scoped while injecting the relay broadly enough for localhost dev ports", () => {
    const manifestPath = resolve(
      process.cwd(),
      "extensions/xiaohongshu-draft-bridge/manifest.json"
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      content_scripts: Array<{ matches: string[] }>;
      host_permissions: string[];
    };

    expect(manifest.host_permissions).toEqual([
      "http://localhost/*",
      "http://127.0.0.1/*",
      "https://*.pages.dev/*",
      "https://re-content.pages.dev/*",
      "https://creator.xiaohongshu.com/*"
    ]);
    expect(manifest.content_scripts[0]?.matches).toEqual([
      "http://localhost/*",
      "http://127.0.0.1/*",
      "https://*.pages.dev/*",
      "https://re-content.pages.dev/*"
    ]);
  });
});
