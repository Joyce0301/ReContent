import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  extractContentFromUrl,
  extractContentFromUrlWithDiagnostics
} from "./content-extraction";

const makeResponse = (body: string, ok = true) =>
  new Response(body, { status: ok ? 200 : 500 });

beforeEach(() => {
  vi.stubEnv("FIRECRAWL_API_KEY", "");
  vi.stubEnv("FIRECRAWL_API_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("extractContentFromUrl", () => {
  it("prefers Firecrawl markdown when configured and available", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test-key");

    const firecrawlMarkdown =
      "# GPT-OSS-120B\n\n" +
      "Open-weight reasoning models should be easy to inspect and adapt. ".repeat(20);
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = String(input);

      if (requestUrl === "https://api.firecrawl.dev/v2/scrape") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: {
                markdown: firecrawlMarkdown
              }
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }
          )
        );
      }

      return Promise.resolve(makeResponse("should not be used"));
    });

    const result = await extractContentFromUrlWithDiagnostics(
      "https://openai.com/index/introducing-gpt-oss/",
      {
        fetcher: fetchMock,
        timeoutMs: 20
      }
    );

    expect(result.content).toContain("GPT-OSS-120B");
    expect(result.diagnostics.finalSource).toBe("firecrawl");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.firecrawl.dev/v2/scrape",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer fc-test-key",
          "Content-Type": "application/json"
        })
      })
    );
  });

  it("falls back to existing extractors when Firecrawl fails", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test-key");

    const html = `
      <html>
        <head><title>Fallback Article - Site</title></head>
        <body>
          <article>
            <h1>Fallback Article</h1>
            <p>${"HTML fallback still works when Firecrawl is unavailable. ".repeat(20)}</p>
          </article>
        </body>
      </html>
    `;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = String(input);

      if (requestUrl === "https://api.firecrawl.dev/v2/scrape") {
        return Promise.resolve(
          new Response(JSON.stringify({ success: false, error: "upstream failed" }), {
            status: 502,
            headers: { "Content-Type": "application/json" }
          })
        );
      }

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(makeResponse("Too short"));
      }

      return Promise.resolve(makeResponse(html));
    });

    const result = await extractContentFromUrlWithDiagnostics(
      "https://example.com/post",
      {
        fetcher: fetchMock,
        timeoutMs: 20
      }
    );

    expect(result.content).toContain("Fallback Article");
    expect(result.diagnostics.finalSource).toBe("html");
    expect(result.diagnostics.attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "firecrawl",
          outcome: "failed",
          failureReason: "http_error"
        })
      ])
    );
  });

  it("falls back when FIRECRAWL_API_URL is invalid", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test-key");
    vi.stubEnv("FIRECRAWL_API_URL", "localhost:3002");

    const html = `
      <html>
        <head><title>Fallback Article - Site</title></head>
        <body>
          <article>
            <h1>Fallback Article</h1>
            <p>${"HTML fallback still works when Firecrawl config is invalid. ".repeat(20)}</p>
          </article>
        </body>
      </html>
    `;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(makeResponse("Too short"));
      }

      return Promise.resolve(makeResponse(html));
    });

    const result = await extractContentFromUrlWithDiagnostics(
      "https://example.com/post",
      {
        fetcher: fetchMock,
        timeoutMs: 20
      }
    );

    expect(result.content).toContain("Fallback Article");
    expect(result.diagnostics.finalSource).toBe("html");
    expect(result.diagnostics.attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "firecrawl",
          outcome: "skipped"
        })
      ])
    );
  });

  it("rejects Firecrawl responses marked as unsuccessful and falls back", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test-key");

    const html = `
      <html>
        <head><title>Fallback Article - Site</title></head>
        <body>
          <article>
            <h1>Fallback Article</h1>
            <p>${"HTML fallback still works when Firecrawl returns an unsuccessful scrape payload. ".repeat(
              20
            )}</p>
          </article>
        </body>
      </html>
    `;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = String(input);

      if (requestUrl === "https://api.firecrawl.dev/v2/scrape") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: false,
              data: {
                markdown:
                  "# Access denied\n\n" +
                  "This page is blocked and should not be accepted as article content. ".repeat(
                    20
                  )
              }
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }
          )
        );
      }

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(makeResponse("Too short"));
      }

      return Promise.resolve(makeResponse(html));
    });

    const result = await extractContentFromUrlWithDiagnostics(
      "https://example.com/post",
      {
        fetcher: fetchMock,
        timeoutMs: 20
      }
    );

    expect(result.content).toContain("Fallback Article");
    expect(result.diagnostics.finalSource).toBe("html");
    expect(result.diagnostics.attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "firecrawl",
          outcome: "failed",
          failureReason: "no_content"
        })
      ])
    );
  });

  it("falls back to direct HTML extraction when Jina times out", async () => {
    const html = `
      <html>
        <head><title>Timeout Fallback Article</title></head>
        <body>
          <main>
            <article>
              <h1>Timeout Fallback Article</h1>
              <p>${"HTML fallback still works when Jina hangs. ".repeat(20)}</p>
            </article>
          </main>
        </body>
      </html>
    `;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      }

      return Promise.resolve(makeResponse(html));
    });

    const result = await extractContentFromUrl("https://example.com/post", {
      fetcher: fetchMock,
      timeoutMs: 20
    });

    expect(result).toContain("Timeout Fallback Article");
    expect(result).toContain("HTML fallback still works");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries Jina Reader with a longer timeout when direct HTML is a verification shell", async () => {
    const verificationShell = `
      <html>
        <head>
          <title>OpenAI</title>
          <meta http-equiv="refresh" content="360">
        </head>
        <body>
          <main>
            <div>OpenAI</div>
            <div>${"Checking your browser before accessing this site. Please verify you are human before continuing. ".repeat(
              30
            )}</div>
          </main>
        </body>
      </html>
    `;
    const jinaContent =
      "# Introducing GeneBench-Pro\n\n" +
      "Scientific data rarely arrive with instructions. ".repeat(20) +
      "GeneBench-Pro evaluates whether models can reason over complex biological datasets. ".repeat(
        10
      );
    let jinaCalls = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        jinaCalls += 1;
        if (jinaCalls === 1) {
          return new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          });
        }

        return new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
          setTimeout(() => resolve(makeResponse(jinaContent)), 25);
        });
      }

      return Promise.resolve(makeResponse(verificationShell));
    });

    const result = await extractContentFromUrlWithDiagnostics(
      "https://openai.com/index/introducing-genebench-pro/",
      {
        fetcher: fetchMock,
        timeoutMs: 20
      }
    );

    expect(result.content).toContain("Introducing GeneBench-Pro");
    expect(result.content).toContain("Scientific data rarely arrive");
    expect(result.content).not.toContain("Checking your browser");
    expect(result.diagnostics.finalSource).toBe("jina_reader");
    expect(
      result.diagnostics.attempts.filter(attempt => attempt.source === "jina_reader")
    ).toHaveLength(2);
  });

  it("rejects Jina Reader anti-bot shells instead of treating them as article content", async () => {
    const jinaChallenge = [
      "Title: Just a moment...",
      "",
      "Warning: Target URL returned error 403: Forbidden",
      "Warning: This page maybe not fully loaded, consider explicitly specify a timeout."
    ].join("\n");
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(makeResponse(jinaChallenge));
      }

      return Promise.resolve(
        makeResponse(
          "<html><head><title>OpenAI</title></head><body>Checking your browser</body></html>"
        )
      );
    });

    const result = await extractContentFromUrlWithDiagnostics(
      "https://openai.com/index/introducing-genebench-pro/",
      {
        fetcher: fetchMock,
        timeoutMs: 20
      }
    );

    expect(result.content).toBeNull();
    expect(result.diagnostics.finalOutcome).toBe("failure");
    expect(result.diagnostics.attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "jina_reader",
          outcome: "failed",
          failureReason: "no_content"
        })
      ])
    );
  });

  it("rejects generic Jina Reader browser challenge shells", async () => {
    const jinaChallenge = [
      "Just a moment.",
      "Please enable JavaScript and cookies to continue.",
      "Verify you are human before accessing this site.",
      "Security check in progress."
    ].join("\n");
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(makeResponse(jinaChallenge));
      }

      return Promise.resolve(
        makeResponse(
          "<html><head><title>OpenAI</title></head><body>Checking your browser</body></html>"
        )
      );
    });

    const result = await extractContentFromUrlWithDiagnostics(
      "https://openai.com/index/introducing-genebench-pro/",
      {
        fetcher: fetchMock,
        timeoutMs: 20
      }
    );

    expect(result.content).toBeNull();
    expect(result.diagnostics.finalOutcome).toBe("failure");
    expect(result.diagnostics.attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "jina_reader",
          outcome: "failed",
          failureReason: "no_content"
        })
      ])
    );
  });

  it("retries Jina Reader after network errors when direct HTML is a verification shell", async () => {
    const verificationShell = `
      <html>
        <head><title>Security Check</title></head>
        <body>
          <main>
            <div>${"Checking your browser before accessing this site. Please verify you are human before continuing. ".repeat(
              8
            )}</div>
          </main>
        </body>
      </html>
    `;
    const jinaContent =
      "# Network Retry Article\n\n" +
      "The reader eventually recovered after a transient upstream network error. ".repeat(
        20
      );
    let jinaCalls = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        jinaCalls += 1;
        if (jinaCalls === 1) {
          return Promise.reject(new Error("ECONNRESET"));
        }

        return Promise.resolve(makeResponse(jinaContent));
      }

      return Promise.resolve(makeResponse(verificationShell));
    });

    const result = await extractContentFromUrlWithDiagnostics(
      "https://openai.com/index/network-retry-article/",
      {
        fetcher: fetchMock,
        timeoutMs: 20
      }
    );

    expect(result.content).toContain("Network Retry Article");
    expect(result.diagnostics.finalSource).toBe("jina_reader");
    expect(
      result.diagnostics.attempts.filter(attempt => attempt.source === "jina_reader")
    ).toEqual([
      expect.objectContaining({
        outcome: "failed",
        failureReason: "network_error"
      }),
      expect.objectContaining({
        outcome: "success"
      })
    ]);
  });

  it("uses Jina Reader content when it is long enough", async () => {
    const jinaContent =
      "# Example title\n\n" +
      "This is a useful extracted article paragraph. ".repeat(20);
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(makeResponse(jinaContent));
      }

      return Promise.resolve(
        makeResponse("<html><head><title>Empty</title></head><body></body></html>")
      );
    });

    const result = await extractContentFromUrl("https://example.com/post", {
      fetcher: fetchMock
    });

    expect(result).toContain("Example title");
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(makeResponse("Too short"));
      }

      return Promise.resolve(makeResponse(html));
    });

    const result = await extractContentFromUrl("https://example.com/post", {
      fetcher: fetchMock
    });

    expect(result).toContain("Fallback Article");
    expect(result).toContain("useful fallback paragraph");
    expect(result).not.toContain("Home Login Register");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns short but meaningful Jina content when fallback HTML extraction fails", async () => {
    const shortArticle = [
      "Short Article",
      "A concise article with one strong takeaway and a clear summary paragraph.",
      "The text is shorter than the long-form threshold, but it is still meaningful content."
    ].join("\n\n");
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(makeResponse(shortArticle));
      }

      return Promise.resolve(
        makeResponse("<html><head><title>Blocked</title></head><body></body></html>")
      );
    });

    const result = await extractContentFromUrl("https://example.com/short-post", {
      fetcher: fetchMock
    });

    expect(result).toContain("Short Article");
    expect(result).toContain("clear summary paragraph");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the join.qq.com job details API for dynamic post detail pages", async () => {
    const apiPayload = {
      status: 0,
      data: {
        title: "解决方案-行业咨询方向",
        tidName: "技术",
        projectName: "应届实习",
        introduction:
          "你将在充满机遇与挑战的工作中，成为客户与技术产品间的桥梁，为产业发展提供多元价值。",
        desc: "1、学习和理解技术、产品及应用场景；\n2、深度参与解决方案落地。",
        request: "1、理工科专业优先；\n2、具有良好的沟通能力。",
        internBonus: "同等条件下，有腾讯云从业资格认证者优先。",
        recruitCityList: ["远程面试"],
        workCityList: ["深圳总部", "上海"],
        intentionBGDList: [{ showTitle: "CSIG", showTxt: "云与智慧产业事业群" }]
      }
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(apiPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const result = await extractContentFromUrl(
      "https://join.qq.com/post_detail.html?postid=1153452731391100928",
      {
        fetcher: fetchMock
      }
    );

    expect(result).toContain("解决方案-行业咨询方向");
    expect(result).toContain("岗位描述");
    expect(result).toContain("岗位要求");
    expect(result).toContain("远程面试");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://join.qq.com/api/v1/jobDetails/getJobDetailsByPostId?postId=1153452731391100928",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Requested-With": "XMLHttpRequest"
        })
      })
    );
  });

  it("prefers article-style containers over noisy generic div blocks", async () => {
    const html = `
      <html>
        <head><title>Layered Layout</title></head>
        <body>
          <div class="page-shell">
            <div class="nav-copy">${"Home Pricing Docs Login ".repeat(30)}</div>
            <main>
              <article class="article-body">
                <h1>Layered Layout</h1>
                <p>${"This is the real article paragraph with useful product analysis. ".repeat(18)}</p>
                <p>${"It should win over generic wrapper text because it has clearer structure. ".repeat(16)}</p>
              </article>
            </main>
          </div>
        </body>
      </html>
    `;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(makeResponse("Too short"));
      }

      return Promise.resolve(makeResponse(html));
    });

    const result = await extractContentFromUrl("https://example.com/layout-post", {
      fetcher: fetchMock,
      timeoutMs: 50
    });

    expect(result).toContain("Layered Layout");
    expect(result).toContain("real article paragraph");
    expect(result).not.toContain("Home Pricing Docs Login");
  });

  it("extracts meaningful paragraph clusters when the page lacks clear article containers", async () => {
    const html = `
      <html>
        <head><title>Messy Product Update</title></head>
        <body>
          <div class="topbar">Home Products Docs Pricing Login</div>
          <div class="layout">
            <div class="hero">Announcing something new</div>
            <div class="content-wrap">
              <div class="copy-block">
                <p>${"Our team rebuilt the workflow to reduce failed generations and improve reliability for long-form source articles. ".repeat(6)}</p>
                <p>${"The new pipeline now separates extraction, validation, and formatting so that platform-ready output is easier to produce consistently. ".repeat(5)}</p>
                <p>${"We also added better fallback behavior for timeouts and unstable upstream readers, which significantly improves success rate on messy pages. ".repeat(5)}</p>
              </div>
            </div>
            <div class="footer-links">About Careers Contact Terms Privacy</div>
          </div>
        </body>
      </html>
    `;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(makeResponse("Too short"));
      }

      return Promise.resolve(makeResponse(html));
    });

    const result = await extractContentFromUrl("https://example.com/messy-post", {
      fetcher: fetchMock,
      timeoutMs: 50
    });

    expect(result).toContain("Messy Product Update");
    expect(result).toContain("reduce failed generations");
    expect(result).toContain("platform-ready output");
    expect(result).not.toContain("Home Products Docs Pricing Login");
    expect(result).not.toContain("About Careers Contact Terms Privacy");
  });

  it("reports diagnostics when Jina times out but HTML fallback succeeds", async () => {
    const html = `
      <html>
        <head><title>Observed Fallback</title></head>
        <body>
          <article>
            <p>${"HTML extraction succeeds after a Jina timeout. ".repeat(18)}</p>
          </article>
        </body>
      </html>
    `;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      }

      return Promise.resolve(makeResponse(html));
    });

    const result = await extractContentFromUrlWithDiagnostics(
      "https://example.com/observed-post",
      {
        fetcher: fetchMock,
        timeoutMs: 20
      }
    );

    expect(result.content).toContain("Observed Fallback");
    expect(result.diagnostics.finalOutcome).toBe("success");
    expect(result.diagnostics.finalSource).toBe("html");
    expect(result.diagnostics.attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "site_specific",
          outcome: "skipped",
          failureReason: "unsupported_site"
        }),
        expect.objectContaining({
          source: "html",
          outcome: "success"
        })
      ])
    );
  });

  it("reports no-content diagnostics when both Jina and HTML extraction fail", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(makeResponse("Too short"));
      }

      return Promise.resolve(
        makeResponse("<html><head><title>Empty</title></head><body></body></html>")
      );
    });

    const result = await extractContentFromUrlWithDiagnostics(
      "https://example.com/empty-post",
      {
        fetcher: fetchMock,
        timeoutMs: 20
      }
    );

    expect(result.content).toBeNull();
    expect(result.diagnostics.finalOutcome).toBe("failure");
    expect(result.diagnostics.attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "jina_reader",
          outcome: "failed",
          failureReason: "no_content"
        }),
        expect.objectContaining({
          source: "html",
          outcome: "failed",
          failureReason: "no_content"
        })
      ])
    );
  });

  it("retries HTML extraction with a longer timeout after transient failures", async () => {
    const html = `
      <html>
        <head><title>Retry Success</title></head>
        <body>
          <article>
            <p>${"The second HTML attempt succeeds after the first timed out, proving the conservative retry path works. ".repeat(
              12
            )}</p>
          </article>
        </body>
      </html>
    `;
    let htmlAttempts = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(makeResponse("Too short"));
      }

      htmlAttempts += 1;

      if (htmlAttempts === 1) {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      }

      return Promise.resolve(makeResponse(html));
    });

    const result = await extractContentFromUrlWithDiagnostics(
      "https://example.com/retry-post",
      {
        fetcher: fetchMock,
        timeoutMs: 20
      }
    );

    expect(result.content).toContain("Retry Success");
    expect(result.diagnostics.finalSource).toBe("html");
    expect(result.diagnostics.attempts.filter(attempt => attempt.source === "html")).toEqual([
      expect.objectContaining({
        outcome: "failed",
        failureReason: "timeout"
      }),
      expect.objectContaining({
        outcome: "success"
      })
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns promptly when Jina succeeds but direct HTML hangs", async () => {
    const jinaContent =
      "# Fast Jina\n\n" +
      "This extracted content is already good enough and should not wait for a slower HTML fetch. ".repeat(
        18
      );
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(makeResponse(jinaContent));
      }

      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });

    const startedAt = Date.now();
    const result = await extractContentFromUrl("https://example.com/slow-html-post", {
      fetcher: fetchMock,
      timeoutMs: 40
    });
    const elapsed = Date.now() - startedAt;

    expect(result).toContain("Fast Jina");
    expect(elapsed).toBeLessThan(40);
  });

  it("extracts article content from JSON-LD metadata when body structure is noisy", async () => {
    const html = `
      <html>
        <head>
          <title>Structured Story</title>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "NewsArticle",
              "headline": "Structured Story",
              "articleBody": "${"This story is embedded in JSON-LD and should still be extracted reliably even when the visible body is messy. ".repeat(
                12
              ).replace(/"/g, '\\"')}"
            }
          </script>
        </head>
        <body>
          <div class="shell">
            <div class="topbar">Home Pricing Docs Login</div>
            <div class="hero">Marketing hero copy</div>
            <div class="footer-links">About Careers Contact Terms Privacy</div>
          </div>
        </body>
      </html>
    `;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(makeResponse("Too short"));
      }

      return Promise.resolve(makeResponse(html));
    });

    const result = await extractContentFromUrl("https://example.com/structured-story", {
      fetcher: fetchMock,
      timeoutMs: 50
    });

    expect(result).toContain("Structured Story");
    expect(result).toContain("embedded in JSON-LD");
    expect(result).not.toContain("Home Pricing Docs Login");
  });

  it("falls back to meta description style content when it is the only meaningful source", async () => {
    const description =
      "This page uses a strong description field to summarize the article, including its key points, launch context, and why the workflow matters for creators across platforms. ".repeat(
        3
      );
    const html = `
      <html>
        <head>
          <title>Metadata Summary</title>
          <meta name="description" content="${description.trim()}" />
          <meta property="og:description" content="${description.trim()}" />
        </head>
        <body>
          <div class="shell">
            <div class="topbar">Home Pricing Docs Login</div>
          </div>
        </body>
      </html>
    `;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(makeResponse("Too short"));
      }

      return Promise.resolve(makeResponse(html));
    });

    const result = await extractContentFromUrl("https://example.com/meta-summary", {
      fetcher: fetchMock,
      timeoutMs: 50
    });

    expect(result).toContain("Metadata Summary");
    expect(result).toContain("workflow matters for creators");
    expect(result).not.toContain("Home Pricing Docs Login");
  });

  it("prefers metadata summary on noisy listing pages", async () => {
    const description =
      "Get the latest news on how products at Cloudflare are built, technologies used, and join the teams helping to build a better Internet.";
    const html = `
      <html>
        <head>
          <title>The Cloudflare Blog</title>
          <meta name="description" content="${description}" />
          <meta property="og:description" content="${description}" />
        </head>
        <body>
          <main>
            <article>
              <h2>Post One</h2>
              <p>${"Here is a teaser paragraph for a blog post. ".repeat(8)}</p>
            </article>
            <article>
              <h2>Post Two</h2>
              <p>${"Here is another teaser paragraph for a second blog post. ".repeat(8)}</p>
            </article>
            <article>
              <h2>Post Three</h2>
              <p>${"Here is yet another teaser paragraph for a third blog post. ".repeat(8)}</p>
            </article>
            <div>Older Posts</div>
          </main>
        </body>
      </html>
    `;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(makeResponse("Too short"));
      }

      return Promise.resolve(makeResponse(html));
    });

    const result = await extractContentFromUrl("https://example.com/", {
      fetcher: fetchMock,
      timeoutMs: 50
    });

    expect(result).toContain("The Cloudflare Blog");
    expect(result).toContain("Get the latest news on how products at Cloudflare are built");
    expect(result).not.toContain("Here is another teaser paragraph");
  });

  it("extracts article content from hydration data when visible DOM is mostly empty", async () => {
    const html = `
      <html>
        <head>
          <title>Hydrated Story</title>
          <script id="__NEXT_DATA__" type="application/json">
            {
              "props": {
                "pageProps": {
                  "article": {
                    "title": "Hydrated Story",
                    "content": [
                      "${"This article body lives inside Next.js hydration data and should still be extracted reliably. ".repeat(
                        6
                      ).trim()}",
                      "${"The second paragraph explains how hydration-aware parsing improves success rate on modern frontend pages. ".repeat(
                        5
                      ).trim()}"
                    ]
                  }
                }
              }
            }
          </script>
        </head>
        <body>
          <div id="__next">
            <div class="hero">Loading article...</div>
          </div>
        </body>
      </html>
    `;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(makeResponse("Too short"));
      }

      return Promise.resolve(makeResponse(html));
    });

    const result = await extractContentFromUrl("https://example.com/hydrated-story", {
      fetcher: fetchMock,
      timeoutMs: 50
    });

    expect(result).toContain("Hydrated Story");
    expect(result).toContain("inside Next.js hydration data");
    expect(result).toContain("hydration-aware parsing improves success rate");
    expect(result).not.toContain("Loading article");
  });

  it("extracts article content from inline state assignment scripts", async () => {
    const html = `
      <html>
        <head>
          <title>Inline State Story</title>
          <script>
            window.__INITIAL_STATE__ = {
              "post": {
                "title": "Inline State Story",
                "body": [
                  "${"This article lives inside an inline state assignment and should still be extracted without relying on visible DOM blocks. ".repeat(
                    5
                  ).trim()}",
                  "${"A follow-up paragraph explains how inline JSON parsing improves coverage for pages rendered by custom frontend stacks. ".repeat(
                    5
                  ).trim()}"
                ]
              }
            };
          </script>
        </head>
        <body>
          <div class="shell">
            <div class="hero">Page shell only</div>
          </div>
        </body>
      </html>
    `;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(makeResponse("Too short"));
      }

      return Promise.resolve(makeResponse(html));
    });

    const result = await extractContentFromUrl("https://example.com/inline-state", {
      fetcher: fetchMock,
      timeoutMs: 50
    });

    expect(result).toContain("Inline State Story");
    expect(result).toContain("inline state assignment");
    expect(result).toContain("custom frontend stacks");
    expect(result).not.toContain("Page shell only");
  });

  it("extracts article content from WeChat article containers", async () => {
    const html = `
      <html>
        <head>
          <title>微信文章标题</title>
          <meta property="og:title" content="微信文章标题" />
        </head>
        <body>
          <div id="activity-name">微信文章标题</div>
          <div id="meta_content">作者信息</div>
          <section id="js_content">
            <p>${"这是微信公众号正文第一段，包含完整背景信息和上下文，用来验证定制化提取逻辑是否稳定。".repeat(
              4
            )}</p>
            <p>${"这是第二段正文，继续说明产品优化思路、失败回退策略，以及为什么这个页面不应该只抓到顶部装饰内容。".repeat(
              4
            )}</p>
          </section>
        </body>
      </html>
    `;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(makeResponse("Too short"));
      }

      return Promise.resolve(makeResponse(html));
    });

    const result = await extractContentFromUrl("https://mp.weixin.qq.com/s/example", {
      fetcher: fetchMock,
      timeoutMs: 50
    });

    expect(result).toContain("微信文章标题");
    expect(result).toContain("这是微信公众号正文第一段");
    expect(result).toContain("失败回退策略");
    expect(result).not.toContain("作者信息");
  });

  it("ignores WeChat access challenge text from Jina and falls back to article HTML", async () => {
    const jinaChallenge = `
      Title: Weixin Official Accounts Platform

      URL Source: https://mp.weixin.qq.com/s/demo

      Warning: This page maybe requiring CAPTCHA, please make sure you are authorized to access this page.

      Markdown Content:
      ## 环境异常

      当前环境异常，完成验证后即可继续访问。

      [去验证](https://mp.weixin.qq.com/s/demo)
    `;
    const html = `
      <html>
        <head>
          <title>Loop Engineering 实践指南</title>
          <meta property="og:title" content="Loop Engineering 实践指南" />
        </head>
        <body>
          <div id="activity-name">Loop Engineering 实践指南</div>
          <section id="js_content">
            <p>${"Loop Engineering 是围绕大模型构建自主循环运行系统，让 AI 从单次响应工具升级为长期自治代理。".repeat(
              5
            )}</p>
            <p>${"这类文章需要在 Jina 返回访问验证页时继续等待 HTML 兜底，否则用户会看到生成无法完成。".repeat(
              5
            )}</p>
          </section>
        </body>
      </html>
    `;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(makeResponse(jinaChallenge));
      }

      return Promise.resolve(makeResponse(html));
    });

    const result = await extractContentFromUrl("https://mp.weixin.qq.com/s/demo", {
      fetcher: fetchMock,
      timeoutMs: 50
    });

    expect(result).toContain("Loop Engineering 实践指南");
    expect(result).toContain("自主循环运行系统");
    expect(result).toContain("HTML 兜底");
    expect(result).not.toContain("环境异常");
    expect(result).not.toContain("去验证");
  });

  it("does not drop legitimate articles that discuss access challenges", async () => {
    const html = `
      <html>
        <head><title>排查访问验证问题</title></head>
        <body>
          <article>
            <p>${"这篇文章讨论环境异常、去验证和 CAPTCHA 这些现象，但它本身是一篇正常的技术复盘。".repeat(
              6
            )}</p>
            <p>${"作者解释 complete verification 提示如何影响内容抽取，并给出监控、重试和用户提示策略。".repeat(
              6
            )}</p>
          </article>
        </body>
      </html>
    `;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(makeResponse("Too short"));
      }

      return Promise.resolve(makeResponse(html));
    });

    const result = await extractContentFromUrl("https://example.com/access-review", {
      fetcher: fetchMock,
      timeoutMs: 50
    });

    expect(result).toContain("正常的技术复盘");
    expect(result).toContain("complete verification");
    expect(result).toContain("用户提示策略");
  });

  it("extracts nested JSON-LD array content when articleBody is split into blocks", async () => {
    const html = `
      <html>
        <head>
          <title>Split Structured Story</title>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Article",
              "headline": "Split Structured Story",
              "articleBody": [
                "第一段结构化正文，解释为什么文章抓取会受动态渲染和站点结构影响。第一段结构化正文，解释为什么文章抓取会受动态渲染和站点结构影响。",
                "第二段结构化正文，描述如何通过站点特征提取和兜底策略提高成功率。第二段结构化正文，描述如何通过站点特征提取和兜底策略提高成功率。"
              ],
              "hasPart": [
                {
                  "@type": "WebPageElement",
                  "text": "第三段结构化正文，进一步补充回退策略和失败原因提示的价值。第三段结构化正文，进一步补充回退策略和失败原因提示的价值。"
                }
              ]
            }
          </script>
        </head>
        <body>
          <div class="shell">
            <div class="topbar">Home Pricing Docs Login</div>
          </div>
        </body>
      </html>
    `;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const requestUrl = String(input);

      if (requestUrl.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(makeResponse("Too short"));
      }

      return Promise.resolve(makeResponse(html));
    });

    const result = await extractContentFromUrl(
      "https://example.com/split-structured-story",
      {
        fetcher: fetchMock,
        timeoutMs: 50
      }
    );

    expect(result).toContain("Split Structured Story");
    expect(result).toContain("第一段结构化正文");
    expect(result).toContain("第三段结构化正文");
    expect(result).not.toContain("Home Pricing Docs Login");
  });
});
