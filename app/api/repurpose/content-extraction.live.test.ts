import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { extractContentFromUrl } from "./content-extraction";

type LiveCorpusEntry = {
  expectedSnippets: string[];
  name: string;
  url: string;
};

const LIVE_CORPUS_ENV = process.env.URL_EXTRACTION_LIVE_CORPUS;
const LIVE_CORPUS_FILE = process.env.URL_EXTRACTION_LIVE_CORPUS_FILE;

function parseLiveCorpus(): LiveCorpusEntry[] {
  if (LIVE_CORPUS_FILE) {
    try {
      const content = readFileSync(LIVE_CORPUS_FILE, "utf8");
      const parsed = JSON.parse(content) as LiveCorpusEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  if (LIVE_CORPUS_ENV) {
    try {
      const parsed = JSON.parse(LIVE_CORPUS_ENV) as LiveCorpusEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

const LIVE_CORPUS = parseLiveCorpus();

describe("content extraction live corpus", () => {
  it.skipIf(process.env.URL_EXTRACTION_LIVE !== "1")(
    "evaluates current extraction success rate against real URLs",
    async () => {
      expect(
        LIVE_CORPUS.length,
        "请通过 URL_EXTRACTION_LIVE_CORPUS 或 URL_EXTRACTION_LIVE_CORPUS_FILE 传入至少一个样本"
      ).toBeGreaterThan(0);

      const results = await Promise.all(
        LIVE_CORPUS.map(async entry => {
          const content = await extractContentFromUrl(entry.url, {
            timeoutMs: 8000
          });

          const passed = entry.expectedSnippets.every(snippet =>
            content?.includes(snippet)
          );

          return {
            contentLength: content?.length ?? 0,
            name: entry.name,
            passed,
            url: entry.url
          };
        })
      );

      const passedCount = results.filter(result => result.passed).length;
      const successRate = passedCount / results.length;
      const failedCases = results.filter(result => !result.passed);

      console.info(
        "content extraction live corpus",
        JSON.stringify({
          failedCases,
          passedCount,
          successRate,
          total: results.length
        })
      );

      expect(successRate).toBeGreaterThanOrEqual(0.95);
    }
  );
});
