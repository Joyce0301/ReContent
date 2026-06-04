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

  it("returns short but meaningful Jina content when fallback HTML extraction fails", async () => {
    const shortArticle = [
      "Short Article",
      "A concise article with one strong takeaway and a clear summary paragraph.",
      "The text is shorter than the long-form threshold, but it is still meaningful content."
    ].join("\n\n");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(shortArticle))
      .mockResolvedValueOnce(
        makeResponse("<html><head><title>Blocked</title></head><body></body></html>")
      );

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
});
