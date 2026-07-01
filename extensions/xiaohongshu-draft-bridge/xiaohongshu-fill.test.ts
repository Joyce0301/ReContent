// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FillResult = {
  status: string;
  message: string;
};

type DraftPayload = {
  title: string;
  content: string;
  tags: string[];
};

declare global {
  interface Window {
    __RECONTENT_XHS_FILL__?: (payload: DraftPayload) => Promise<FillResult>;
  }
}

const scriptPath = resolve(
  process.cwd(),
  "extensions/xiaohongshu-draft-bridge/xiaohongshu-fill.js"
);
const scriptSource = readFileSync(scriptPath, "utf8");

function loadFillScript() {
  window.eval(scriptSource);
  return window.__RECONTENT_XHS_FILL__;
}

describe("xiaohongshu-fill extension script", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    delete window.__RECONTENT_XHS_FILL__;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    delete window.__RECONTENT_XHS_FILL__;
  });

  it("returns login_required when login markers exist but editor fields do not", async () => {
    document.body.innerHTML = `
      <form>
        <input placeholder="请输入手机号" />
        <input placeholder="请输入验证码" />
      </form>
    `;

    const fillDraft = loadFillScript();
    const result = await fillDraft?.({
      title: "标题",
      content: "正文",
      tags: []
    });

    expect(result).toEqual({
      status: "login_required",
      message: "请先登录小红书，登录完成后重新发送。"
    });
  });

  it("fills title, content, and tags on an editor-like page", async () => {
    document.body.innerHTML = `
      <input id="title" placeholder="填写标题会有更多赞哦" />
      <div id="editor" contenteditable="true"></div>
    `;

    const fillDraft = loadFillScript();
    const result = await fillDraft?.({
      title: "标题",
      content: "正文第一段\n正文第二段",
      tags: ["#效率工具", "#内容运营"]
    });

    expect(result).toEqual({
      status: "filled",
      message: "已打开小红书编辑页，请检查内容后保存草稿。"
    });
    expect(
      (document.querySelector("#title") as HTMLInputElement).value
    ).toBe("标题");
    expect(document.querySelector("#editor")?.textContent).toBe(
      "正文第一段正文第二段#效率工具 #内容运营"
    );
    expect(document.querySelector("#editor")?.innerHTML).toContain("<br>");
  });

  it("waits for delayed editor fields before filling", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<div id="app"></div>`;

    window.setTimeout(() => {
      document.body.innerHTML = `
        <input id="title" placeholder="填写标题会有更多赞哦" />
        <div id="editor" contenteditable="true"></div>
      `;
    }, 500);

    const fillDraft = loadFillScript();
    const promise = fillDraft?.({
      title: "标题",
      content: "正文",
      tags: []
    });

    await vi.advanceTimersByTimeAsync(750);

    await expect(promise).resolves.toEqual({
      status: "filled",
      message: "已打开小红书编辑页，请检查内容后保存草稿。"
    });
    vi.useRealTimers();
  });

  it("switches through the long-form creation flow before filling", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="article-tab" role="button">写长文</div>
      <button id="new-article">新的创作</button>
    `;

    document.querySelector("#article-tab")?.addEventListener("click", () => {
      document.querySelector("#new-article")?.setAttribute("data-article-tab-opened", "true");
    });

    document.querySelector("#new-article")?.addEventListener("click", () => {
      if (
        document
          .querySelector("#new-article")
          ?.getAttribute("data-article-tab-opened") !== "true"
      ) {
        return;
      }

      document.body.innerHTML = `
        <input id="title" placeholder="输入标题" />
        <div id="editor" contenteditable="true"></div>
      `;
    });

    const fillDraft = loadFillScript();
    const promise = fillDraft?.({
      title: "标题",
      content: "正文第一段",
      tags: ["#效率工具"]
    });

    await vi.advanceTimersByTimeAsync(1200);

    await expect(promise).resolves.toEqual({
      status: "filled",
      message: "已打开小红书编辑页，请检查内容后保存草稿。"
    });
    expect(
      (document.querySelector("#title") as HTMLInputElement).value
    ).toBe("标题");
    expect(document.querySelector("#editor")?.textContent).toContain("正文第一段");
    expect(document.querySelector("#editor")?.textContent).toContain("#效率工具");
    vi.useRealTimers();
  });

  it("returns unsupported_page when neither editor nor login fields are found", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<div>unknown page</div>`;

    const fillDraft = loadFillScript();
    const promise = fillDraft?.({
      title: "标题",
      content: "正文",
      tags: []
    });

    await vi.advanceTimersByTimeAsync(10000);

    await expect(promise).resolves.toEqual({
      status: "unsupported_page",
      message: "小红书页面结构已变化，当前无法自动填充。"
    });
    vi.useRealTimers();
  });
});
