import { describe, expect, it, vi } from "vitest";

import { extractContentFromUrl } from "./content-extraction";

const makeResponse = (body: string, ok = true) =>
  new Response(body, { status: ok ? 200 : 500 });

describe("extractContentFromUrl", () => {
  it("uses Jina Reader content when it is long enough", async () => {
    const jinaContent =
      "# Example title\n\n" +
      "This is a useful extracted article paragraph. ".repeat(20);
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(jinaContent));

    const result = await extractContentFromUrl("https://example.com/post", {
      fetcher: fetchMock
    });

    expect(result).toContain("Example title");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://r.jina.ai/https://example.com/post",
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": expect.any(String)
        })
      })
    );
  });

  it("falls back to local HTML extraction when Jina content is too short", async () => {
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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse("Too short"))
      .mockResolvedValueOnce(makeResponse(html));

    const result = await extractContentFromUrl("https://example.com/post", {
      fetcher: fetchMock
    });

    expect(result).toContain("Fallback Article");
    expect(result).toContain("useful fallback paragraph");
    expect(result).not.toContain("Home Login Register");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
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
