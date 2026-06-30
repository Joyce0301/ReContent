import { describe, expect, it, vi } from "vitest";

import { extractContentFromUrl } from "./content-extraction";

type SuccessFixture = {
  expectedSnippet: string;
  html: string;
  name: string;
  url: string;
};

const SUCCESS_FIXTURES: SuccessFixture[] = [
  {
    name: "standard article",
    url: "https://example.com/article",
    expectedSnippet: "long-form article paragraph",
    html: `
      <html>
        <head><title>Standard Article</title></head>
        <body>
          <article>
            <p>${"This is a long-form article paragraph with enough depth to look like a real post. ".repeat(
              8
            )}</p>
            <p>${"It also includes a second paragraph so the extractor sees a complete article body. ".repeat(
              8
            )}</p>
          </article>
        </body>
      </html>
    `
  },
  {
    name: "noisy landing page shell",
    url: "https://example.com/noisy-shell",
    expectedSnippet: "workflow reliability across channels",
    html: `
      <html>
        <head><title>Noisy Shell</title></head>
        <body>
          <div class="topbar">${"Home Pricing Docs Login ".repeat(20)}</div>
          <main>
            <div class="article-body">
              <p>${"The article explains how to improve workflow reliability across channels while preserving brand voice. ".repeat(
                7
              )}</p>
              <p>${"It also describes timeout fallbacks, extraction validation, and better delivery quality. ".repeat(
                7
              )}</p>
            </div>
          </main>
        </body>
      </html>
    `
  },
  {
    name: "messy paragraph cluster",
    url: "https://example.com/messy-cluster",
    expectedSnippet: "extraction validation and formatting",
    html: `
      <html>
        <head><title>Messy Cluster</title></head>
        <body>
          <div class="layout">
            <div class="hero">Hero copy</div>
            <div class="copy-block">
              <p>${"The new pipeline separates extraction validation and formatting so that retries can stay conservative. ".repeat(
                6
              )}</p>
              <p>${"This structure helps the system recover gracefully from unstable upstream readers and weak article markup. ".repeat(
                6
              )}</p>
            </div>
            <div class="footer-links">About Careers Contact Terms Privacy</div>
          </div>
        </body>
      </html>
    `
  },
  {
    name: "json ld article",
    url: "https://example.com/json-ld",
    expectedSnippet: "embedded in JSON-LD",
    html: `
      <html>
        <head>
          <title>Structured Story</title>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "NewsArticle",
              "headline": "Structured Story",
              "articleBody": "${"This article is embedded in JSON-LD and should be extracted even if the body is noisy. ".repeat(
                10
              ).replace(/"/g, '\\"')}"
            }
          </script>
        </head>
        <body><div>Home Pricing Docs Login</div></body>
      </html>
    `
  },
  {
    name: "meta description fallback",
    url: "https://example.com/meta",
    expectedSnippet: "workflow matters for creators",
    html: `
      <html>
        <head>
          <title>Metadata Summary</title>
          <meta name="description" content="${"This summary explains why the workflow matters for creators and how the parser now handles unstable pages. ".repeat(
            4
          ).trim()}" />
        </head>
        <body><div>Home Pricing Docs Login</div></body>
      </html>
    `
  },
  {
    name: "hydrated next data page",
    url: "https://example.com/hydrated-next-page",
    expectedSnippet: "Next.js hydration data",
    html: `
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
                      "${"This article body lives in Next.js hydration data and should remain extractable even when the DOM is sparse. ".repeat(
                        6
                      ).trim()}",
                      "${"A second paragraph explains how this fallback reduces failures on modern frontend applications. ".repeat(
                        5
                      ).trim()}"
                    ]
                  }
                }
              }
            }
          </script>
        </head>
        <body><div id="__next"><div>Loading article...</div></div></body>
      </html>
    `
  },
  {
    name: "inline state assignment page",
    url: "https://example.com/inline-state-page",
    expectedSnippet: "inline state assignment",
    html: `
      <html>
        <head>
          <title>Inline State Story</title>
          <script>
            window.__INITIAL_STATE__ = {
              "post": {
                "title": "Inline State Story",
                "body": [
                  "${"This article lives inside an inline state assignment and should remain extractable when the DOM shell is sparse. ".repeat(
                    5
                  ).trim()}",
                  "${"A second paragraph explains how this parser improves coverage for custom frontend stacks and JS-heavy pages. ".repeat(
                    5
                  ).trim()}"
                ]
              }
            };
          </script>
        </head>
        <body><div class="shell">Page shell only</div></body>
      </html>
    `
  },
  {
    name: "listing page metadata preference",
    url: "https://example.com/",
    expectedSnippet: "Get the latest news on how products at Cloudflare are built",
    html: `
      <html>
        <head>
          <title>The Cloudflare Blog</title>
          <meta
            name="description"
            content="Get the latest news on how products at Cloudflare are built, technologies used, and join the teams helping to build a better Internet."
          />
        </head>
        <body>
          <main>
            <article><h2>Post One</h2><p>${"Teaser paragraph one. ".repeat(10)}</p></article>
            <article><h2>Post Two</h2><p>${"Teaser paragraph two. ".repeat(10)}</p></article>
            <article><h2>Post Three</h2><p>${"Teaser paragraph three. ".repeat(10)}</p></article>
            <div>Older Posts</div>
          </main>
        </body>
      </html>
    `
  },
  {
    name: "wechat article",
    url: "https://mp.weixin.qq.com/s/demo",
    expectedSnippet: "微信公众号正文第一段",
    html: `
      <html>
        <head><title>微信文章标题</title></head>
        <body>
          <div id="activity-name">微信文章标题</div>
          <section id="js_content">
            <p>${"这是微信公众号正文第一段，用来验证正文容器提取逻辑。".repeat(8)}</p>
            <p>${"这是第二段正文，说明失败回退、超时控制和内容质量判断。".repeat(8)}</p>
          </section>
        </body>
      </html>
    `
  },
  {
    name: "zhihu article",
    url: "https://zhuanlan.zhihu.com/p/123456",
    expectedSnippet: "知乎专栏正文",
    html: `
      <html>
        <head><title>知乎专栏文章</title></head>
        <body>
          <div class="Post-RichText">
            <p>${"这是一段知乎专栏正文，讨论如何提高长内容重制系统的稳定性。".repeat(8)}</p>
            <p>${"第二段继续说明为什么要把错误原因反馈给用户，而不是只返回通用报错。".repeat(
              8
            )}</p>
          </div>
        </body>
      </html>
    `
  },
  {
    name: "csdn article",
    url: "https://blog.csdn.net/demo/article/details/123",
    expectedSnippet: "技术博客正文",
    html: `
      <html>
        <head><title>技术博客标题</title></head>
        <body>
          <div id="content_views">
            <p>${"这是一段技术博客正文，介绍网页抓取中的解析鲁棒性问题。".repeat(8)}</p>
            <p>${"后续段落说明如何加入结构化数据提取和站点特征提取来提高成功率。".repeat(
              8
            )}</p>
          </div>
        </body>
      </html>
    `
  },
  {
    name: "baidu baike page",
    url: "https://baike.baidu.com/item/demo",
    expectedSnippet: "百科摘要",
    html: `
      <html>
        <head><title>百科词条</title></head>
        <body>
          <div class="lemma-summary">${"这是百科摘要，介绍某个概念的背景和用途。".repeat(8)}</div>
          <div class="para">${"这是百科正文第一段，继续补充细节和上下文。".repeat(8)}</div>
          <div class="para">${"这是百科正文第二段，帮助提取器识别出完整正文。".repeat(8)}</div>
        </body>
      </html>
    `
  },
  {
    name: "split structured arrays",
    url: "https://example.com/split-structured",
    expectedSnippet: "第三段结构化正文",
    html: `
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
        <body><div>Home Pricing Docs Login</div></body>
      </html>
    `
  }
];

function makeResponse(body: string, ok = true) {
  return new Response(body, { status: ok ? 200 : 500 });
}

describe("content extraction curated corpus", () => {
  it("keeps a high success rate on the representative fixture corpus", async () => {
    const results = await Promise.all(
      SUCCESS_FIXTURES.map(async fixture => {
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
          const requestUrl = String(input);

          if (requestUrl.startsWith("https://r.jina.ai/")) {
            return Promise.resolve(makeResponse("Too short"));
          }

          return Promise.resolve(makeResponse(fixture.html));
        });

        const content = await extractContentFromUrl(fixture.url, {
          fetcher: fetchMock,
          timeoutMs: 50
        });

        return {
          content,
          name: fixture.name,
          passed: Boolean(content?.includes(fixture.expectedSnippet))
        };
      })
    );

    const passedCount = results.filter(result => result.passed).length;
    const successRate = passedCount / results.length;
    const failedCases = results
      .filter(result => !result.passed)
      .map(result => result.name);

    expect({
      failedCases,
      passedCount,
      successRate
    }).toEqual({
      failedCases: [],
      passedCount: SUCCESS_FIXTURES.length,
      successRate: 1
    });
  });
});
