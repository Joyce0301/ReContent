import assert from "node:assert/strict";
import test from "node:test";

import { extractContentFromUrl } from "./content-extraction.ts";

const makeResponse = (body: string, ok = true) =>
  new Response(body, { status: ok ? 200 : 500 });

function createFetchMock(
  responses: Response[]
): typeof fetch & { calls: Array<[RequestInfo | URL, RequestInit | undefined]> } {
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push([input, init]);
    const next = responses.shift();
    if (!next) {
      throw new Error("No mock response available");
    }
    return next;
  }) as typeof fetch & {
    calls: Array<[RequestInfo | URL, RequestInit | undefined]>;
  };
  fetchMock.calls = calls;
  return fetchMock;
}

test("uses Jina Reader content when it is long enough", async () => {
  const jinaContent =
    "# Example title\n\n" +
    "This is a useful extracted article paragraph. ".repeat(20);
  const fetchMock = createFetchMock([makeResponse(jinaContent)]);

  const result = await extractContentFromUrl("https://example.com/post", {
    fetcher: fetchMock
  });

  assert.ok(result?.includes("Example title"));
  assert.equal(fetchMock.calls.length, 1);
  assert.equal(fetchMock.calls[0]?.[0], "https://r.jina.ai/https://example.com/post");
  assert.match(
    String(fetchMock.calls[0]?.[1]?.headers && (fetchMock.calls[0][1]?.headers as Record<string, string>)["User-Agent"]),
    /Mozilla/
  );
});

test("falls back to local HTML extraction when Jina content is too short", async () => {
  const html = `
    <html>
      <head><title>Fallback Article - Site</title></head>
      <body>
        <nav>Home Login Register</nav>
        <article>
          <h1>Fallback Article</h1>
          <p>${"A useful fallback paragraph with real content. ".repeat(20)}</p>
        </article>
      </body>
    </html>
  `;
  const fetchMock = createFetchMock([
    makeResponse("Too short"),
    makeResponse(html)
  ]);

  const result = await extractContentFromUrl("https://example.com/post", {
    fetcher: fetchMock
  });

  assert.ok(result?.includes("Fallback Article"));
  assert.ok(result?.includes("useful fallback paragraph"));
  assert.ok(!result?.includes("Home Login Register"));
  assert.equal(fetchMock.calls.length, 2);
});

test("returns short but meaningful Jina content when fallback HTML extraction fails", async () => {
  const shortArticle = [
    "Short Article",
    "A concise article with one strong takeaway and a clear summary paragraph.",
    "The text is shorter than the long-form threshold, but it is still meaningful content."
  ].join("\n\n");
  const fetchMock = createFetchMock([
    makeResponse(shortArticle),
    makeResponse("<html><head><title>Blocked</title></head><body></body></html>")
  ]);

  const result = await extractContentFromUrl("https://example.com/short-post", {
    fetcher: fetchMock
  });

  assert.ok(result?.includes("Short Article"));
  assert.ok(result?.includes("clear summary paragraph"));
  assert.equal(fetchMock.calls.length, 2);
});
