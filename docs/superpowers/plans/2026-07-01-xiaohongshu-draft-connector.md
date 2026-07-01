# Xiaohongshu Draft Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `发送到小红书草稿` flow that opens Xiaohongshu Creator on the user's desktop browser, fills the generated title/body when the user is logged in, and falls back cleanly when login or bridge prerequisites are missing.

**Architecture:** Concretize the spec's "local bridge" as a Chromium extension instead of a backend-side automation process. The ReContent page sends a structured draft payload to the extension, the extension opens `https://creator.xiaohongshu.com/publish/publish`, checks whether the editor is available, fills the title/body inside the existing logged-in browser session, and reports status back to the page.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Chrome Extension Manifest V3, Chrome `runtime` / `tabs` / `scripting` APIs

---

## Acceptance Criteria

### Functional acceptance

- Xiaohongshu result cards render a visible `发送到小红书草稿` button, while Twitter / LinkedIn cards do not render this action.
- Clicking `发送到小红书草稿` on a valid Xiaohongshu result sends a structured payload containing `sourceId`, `title`, `content`, and `tags`.
- When the desktop bridge extension is installed and the browser is already logged into Xiaohongshu Creator, clicking the button opens `https://creator.xiaohongshu.com/publish/publish` and fills the title and body fields.
- When the browser is not logged into Xiaohongshu Creator, clicking the button leads the user into the login path and the ReContent UI shows `请先登录小红书，登录完成后重新发送。`
- When the extension is not installed or not reachable, the UI shows `未检测到小红书草稿连接器，请先安装桌面扩展。` and the existing `复制内容` path still works.
- The flow never auto-clicks `保存草稿` or `发布`.

### Validation acceptance

- If the Xiaohongshu title is empty or longer than 20 characters, the send-to-draft flow is blocked before dispatch and the UI shows a validation message.
- If the Xiaohongshu content becomes empty after payload normalization, the send-to-draft flow is blocked before dispatch and the UI shows a validation message.
- Tag extraction does not delete the main note body; only standalone hashtag lines are stripped into the `tags` array.

### UX acceptance

- While the bridge request is in progress, the UI shows an `opening` state message telling the user that the local browser is being opened.
- After a successful fill, the UI shows `已打开小红书编辑页，请检查内容后保存草稿。`
- If Xiaohongshu changes its page structure and the editor fields cannot be found, the UI shows an `unsupported_page` style fallback message and still leaves copy-to-clipboard available.

### Quality acceptance

- `npx vitest run app/page.test.tsx app/lib/xiaohongshu-draft-bridge.test.ts` passes.
- Existing API regression coverage for `app/api/repurpose/*.test.ts` still passes.
- `npm run build` passes.
- README includes desktop-only scope, extension install steps, and the no-auto-publish boundary.

### Manual acceptance checklist

- On a desktop Chromium browser with the extension loaded and Xiaohongshu already logged in, a generated Xiaohongshu result can be sent into the creator editor with title and body visible.
- On the same browser after logout, the same action leads to the login-required outcome instead of a silent failure.
- On a browser without the extension, the product shows install guidance instead of hanging indefinitely.

## File Structure

### Existing files to modify

- `app/components/recontent/types.ts`
  Add Xiaohongshu draft payload and bridge status types shared by UI components.
- `app/components/recontent/result-document.tsx`
  Show the new `发送到小红书草稿` action for the Xiaohongshu result and render bridge feedback copy.
- `app/components/recontent/result-surface.tsx`
  Thread bridge state into the active result document.
- `app/page.tsx`
  Own the bridge request lifecycle, extension availability detection, status reset, and message wiring.
- `app/page.test.tsx`
  Cover the new CTA, extension-missing state, request payload wiring, and success/error status rendering.
- `README.md`
  Document desktop-only scope, extension installation, and the review-before-publish safety boundary.

### New app-side files to create

- `app/lib/xiaohongshu-draft-bridge.ts`
  Browser-side client for talking to the extension via `window.postMessage`.
- `app/lib/xiaohongshu-draft-bridge.test.ts`
  Unit tests for payload building and extension response normalization.

### New extension files to create

- `extensions/xiaohongshu-draft-bridge/manifest.json`
  Manifest V3 definition, permissions, and externally reachable assets.
- `extensions/xiaohongshu-draft-bridge/service-worker.js`
  Extension entrypoint: open/focus creator tab, inject filler logic, and send status back.
- `extensions/xiaohongshu-draft-bridge/recontent-bridge.js`
  Content script injected on the ReContent app origin; relays `window.postMessage` traffic between the page and extension.
- `extensions/xiaohongshu-draft-bridge/xiaohongshu-fill.js`
  DOM script injected into the creator page to detect login state and fill title/body.
- `extensions/xiaohongshu-draft-bridge/README.md`
  Local install steps for Chrome/Edge and manual verification checklist.

### Assumptions locked for this plan

- V1 supports desktop Chromium browsers only.
- The bridge ships inside this repository as a local extension, not as a published Chrome Web Store package.
- V1 fills `title` and `content`; `tags` stay inside the note body footer as plain text suggestions.
- V1 does not auto-click `保存草稿` or `发布`.

### Shared contract

```ts
export type XiaohongshuDraftPayload = {
  sourceId: string;
  title: string;
  content: string;
  tags: string[];
};

export type XiaohongshuDraftBridgeStatus =
  | "idle"
  | "opening"
  | "filled"
  | "login_required"
  | "bridge_unavailable"
  | "unsupported_page"
  | "validation_error"
  | "failed";

export type XiaohongshuDraftBridgeResult = {
  status: XiaohongshuDraftBridgeStatus;
  message: string;
};
```

## Task 1: Define The Shared Draft Bridge Contract

**Files:**
- Modify: `app/components/recontent/types.ts`
- Create: `app/lib/xiaohongshu-draft-bridge.test.ts`

- [ ] **Step 1: Write the failing contract test**

```ts
import { describe, expect, it } from "vitest";
import { buildXiaohongshuDraftPayload } from "./xiaohongshu-draft-bridge";

describe("buildXiaohongshuDraftPayload", () => {
  it("converts a Xiaohongshu result into bridge payload", () => {
    const payload = buildXiaohongshuDraftPayload("req-1", {
      platform: "xiaohongshu",
      title: "标题",
      content: "正文第一段\n\n#效率工具 #内容运营"
    });

    expect(payload).toEqual({
      sourceId: "req-1",
      title: "标题",
      content: "正文第一段",
      tags: ["#效率工具", "#内容运营"]
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/xiaohongshu-draft-bridge.test.ts`

Expected: FAIL with `Cannot find module './xiaohongshu-draft-bridge'`

- [ ] **Step 3: Add shared types**

```ts
export type XiaohongshuDraftPayload = {
  sourceId: string;
  title: string;
  content: string;
  tags: string[];
};

export type XiaohongshuDraftBridgeStatus =
  | "idle"
  | "opening"
  | "filled"
  | "login_required"
  | "bridge_unavailable"
  | "unsupported_page"
  | "validation_error"
  | "failed";
```

- [ ] **Step 4: Implement the payload builder**

```ts
export function buildXiaohongshuDraftPayload(
  sourceId: string,
  result: RepurposeResult
): XiaohongshuDraftPayload {
  const lines = result.content.split("\n");
  const tags = lines
    .flatMap(line => line.match(/#[^\s#]+/g) ?? [])
    .slice(0, 5);

  const content = lines
    .filter(line => !line.trim().match(/^#[^\s#]+(?:\s+#[^\s#]+)*$/))
    .join("\n")
    .trim();

  return {
    sourceId,
    title: result.title?.trim() ?? "",
    content,
    tags
  };
}
```

- [ ] **Step 5: Run the contract test**

Run: `npx vitest run app/lib/xiaohongshu-draft-bridge.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/components/recontent/types.ts app/lib/xiaohongshu-draft-bridge.test.ts
git commit -m "feat: define xiaohongshu draft bridge contract"
```

## Task 2: Add The Browser Bridge Client

**Files:**
- Create: `app/lib/xiaohongshu-draft-bridge.ts`
- Test: `app/lib/xiaohongshu-draft-bridge.test.ts`

- [ ] **Step 1: Extend the failing test for bridge result mapping**

```ts
it("maps missing extension to bridge_unavailable", async () => {
  vi.stubGlobal("window", {
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setTimeout,
    clearTimeout
  });

  await expect(sendDraftToXiaohongshuBridge({} as XiaohongshuDraftPayload)).resolves.toEqual({
    status: "bridge_unavailable",
    message: "未检测到小红书草稿连接器，请先安装桌面扩展。"
  });
});
```

- [ ] **Step 2: Run the focused test**

Run: `npx vitest run app/lib/xiaohongshu-draft-bridge.test.ts -t bridge`

Expected: FAIL with `sendDraftToXiaohongshuBridge is not defined`

- [ ] **Step 3: Implement the client with timeout and message correlation**

```ts
const REQUEST_TYPE = "recontent:xiaohongshu-draft-request";
const RESPONSE_TYPE = "recontent:xiaohongshu-draft-response";
const BRIDGE_TIMEOUT_MS = 4000;

export async function sendDraftToXiaohongshuBridge(
  payload: XiaohongshuDraftPayload
): Promise<XiaohongshuDraftBridgeResult> {
  if (typeof window === "undefined") {
    return {
      status: "bridge_unavailable",
      message: "当前环境不支持桌面草稿连接。"
    };
  }

  return new Promise(resolve => {
    const requestId = crypto.randomUUID();
    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve({
        status: "bridge_unavailable",
        message: "未检测到小红书草稿连接器，请先安装桌面扩展。"
      });
    }, BRIDGE_TIMEOUT_MS);

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.type !== RESPONSE_TYPE) return;
      if (event.data?.requestId !== requestId) return;

      cleanup();
      resolve(event.data.result as XiaohongshuDraftBridgeResult);
    };

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);
    };

    window.addEventListener("message", onMessage);
    window.postMessage({ type: REQUEST_TYPE, requestId, payload }, window.location.origin);
  });
}
```

- [ ] **Step 4: Run the bridge unit test**

Run: `npx vitest run app/lib/xiaohongshu-draft-bridge.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/lib/xiaohongshu-draft-bridge.ts app/lib/xiaohongshu-draft-bridge.test.ts
git commit -m "feat: add xiaohongshu bridge browser client"
```

## Task 3: Wire The CTA Into The ReContent UI

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/components/recontent/result-surface.tsx`
- Modify: `app/components/recontent/result-document.tsx`
- Test: `app/page.test.tsx`

- [ ] **Step 1: Write the failing UI test for the new CTA**

```tsx
it("shows the send-to-draft action on xiaohongshu results", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      results: [{ platform: "xiaohongshu", title: "标题", content: "正文" }]
    })
  });

  vi.stubGlobal("fetch", fetchMock);
  render(<HomePage />);

  fireEvent.change(screen.getByLabelText("待重制的原始文本"), {
    target: { value: "source article" }
  });
  fireEvent.click(screen.getByRole("button", { name: "开始重制" }));

  expect(await screen.findByRole("button", { name: "发送到小红书草稿" })).toBeTruthy();
});
```

- [ ] **Step 2: Run the page test**

Run: `npx vitest run app/page.test.tsx -t send-to-draft`

Expected: FAIL because the button is not rendered

- [ ] **Step 3: Add page-level bridge state and handler**

```ts
const [draftBridgeStatus, setDraftBridgeStatus] =
  useState<XiaohongshuDraftBridgeResult | null>(null);

const handleSendToXiaohongshuDraft = async (result: RepurposeResult) => {
  setDraftBridgeStatus({
    status: "opening",
    message: "正在打开你本机浏览器中的小红书创作页…"
  });

  const payload = buildXiaohongshuDraftPayload(crypto.randomUUID(), result);
  const bridgeResult = await sendDraftToXiaohongshuBridge(payload);
  setDraftBridgeStatus(bridgeResult);
};
```

- [ ] **Step 4: Render CTA and feedback only for `xiaohongshu`**

```tsx
{result.platform === "xiaohongshu" ? (
  <button
    type="button"
    onClick={() => onSendToDraft(result)}
    className="inline-flex min-h-9 items-center rounded-full bg-slate-900 px-3.5 text-[11px] text-white transition hover:bg-slate-700"
  >
    发送到小红书草稿
  </button>
) : null}

{draftStatus ? (
  <p className="text-[11px] leading-5 text-slate-500">{draftStatus.message}</p>
) : null}
```

- [ ] **Step 5: Verify the page test passes**

Run: `npx vitest run app/page.test.tsx`

Expected: PASS, including the existing personalized prompt tests

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/components/recontent/result-surface.tsx app/components/recontent/result-document.tsx app/page.test.tsx
git commit -m "feat: add xiaohongshu draft action to result view"
```

## Task 4: Build The Chromium Extension Bridge

**Files:**
- Create: `extensions/xiaohongshu-draft-bridge/manifest.json`
- Create: `extensions/xiaohongshu-draft-bridge/recontent-bridge.js`
- Create: `extensions/xiaohongshu-draft-bridge/service-worker.js`

- [ ] **Step 1: Create the manifest**

```json
{
  "manifest_version": 3,
  "name": "ReContent Xiaohongshu Draft Bridge",
  "version": "0.1.0",
  "permissions": ["tabs", "scripting"],
  "host_permissions": [
    "http://localhost:3000/*",
    "https://re-content.pages.dev/*",
    "https://creator.xiaohongshu.com/*"
  ],
  "background": {
    "service_worker": "service-worker.js"
  },
  "content_scripts": [
    {
      "matches": [
        "http://localhost:3000/*",
        "https://re-content.pages.dev/*"
      ],
      "js": ["recontent-bridge.js"],
      "run_at": "document_start"
    }
  ]
}
```

- [ ] **Step 2: Run a manual load to verify the manifest is valid**

Run: open `chrome://extensions`, enable `Developer mode`, click `Load unpacked`, select `extensions/xiaohongshu-draft-bridge`

Expected: extension loads without manifest errors

- [ ] **Step 3: Implement page-to-extension relay**

```js
window.addEventListener("message", async event => {
  if (event.source !== window) return;
  if (event.data?.type !== "recontent:xiaohongshu-draft-request") return;

  const response = await chrome.runtime.sendMessage({
    type: "bridge:xiaohongshu-draft",
    requestId: event.data.requestId,
    payload: event.data.payload
  });

  window.postMessage(
    {
      type: "recontent:xiaohongshu-draft-response",
      requestId: event.data.requestId,
      result: response
    },
    window.location.origin
  );
});
```

- [ ] **Step 4: Implement the service worker tab orchestration**

```js
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "bridge:xiaohongshu-draft") return;

  openAndFillDraft(message.payload)
    .then(sendResponse)
    .catch(error =>
      sendResponse({
        status: "failed",
        message: error instanceof Error ? error.message : "发送到小红书草稿失败。"
      })
    );

  return true;
});
```

- [ ] **Step 5: Commit**

```bash
git add extensions/xiaohongshu-draft-bridge/manifest.json extensions/xiaohongshu-draft-bridge/recontent-bridge.js extensions/xiaohongshu-draft-bridge/service-worker.js
git commit -m "feat: scaffold xiaohongshu draft browser extension"
```

## Task 5: Inject The Creator-Page Filler And Login Detection

**Files:**
- Create: `extensions/xiaohongshu-draft-bridge/xiaohongshu-fill.js`
- Modify: `extensions/xiaohongshu-draft-bridge/service-worker.js`

- [ ] **Step 1: Write the filler contract directly in code comments and selectors**

```js
const TITLE_SELECTORS = ["input[placeholder*='标题']", "textarea[placeholder*='标题']"];
const CONTENT_SELECTORS = ["div[contenteditable='true']", "textarea[placeholder*='正文']"];
const LOGIN_MARKERS = ["input[placeholder*='手机号']", "img[alt*='登录']"];
```

- [ ] **Step 2: Inject a filler script that distinguishes logged-in vs login-required**

```js
export function fillDraft(payload) {
  const titleEl = findFirst(TITLE_SELECTORS);
  const contentEl = findFirst(CONTENT_SELECTORS);

  if (!titleEl || !contentEl) {
    if (findFirst(LOGIN_MARKERS)) {
      return {
        status: "login_required",
        message: "请先登录小红书，登录完成后重新发送。"
      };
    }

    return {
      status: "unsupported_page",
      message: "小红书页面结构已变化，当前无法自动填充。"
    };
  }

  writeValue(titleEl, payload.title);
  writeRichText(contentEl, appendTags(payload.content, payload.tags));

  return {
    status: "filled",
    message: "已打开小红书编辑页，请检查内容后保存草稿。"
  };
}
```

- [ ] **Step 3: Update the service worker to inject and await the filler result**

```js
async function openAndFillDraft(payload) {
  const tab = await chrome.tabs.create({
    url: "https://creator.xiaohongshu.com/publish/publish",
    active: true
  });

  await waitForTabComplete(tab.id);

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["xiaohongshu-fill.js"]
  });

  return await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: draft => window.__RECONTENT_XHS_FILL__(draft),
    args: [payload]
  }).then(entries => entries[0].result);
}
```

- [ ] **Step 4: Manual verification**

Run:

```text
1. 打开本地 ReContent 页面
2. 生成一条小红书结果
3. 点击“发送到小红书草稿”
4. 在已登录浏览器里确认标题与正文被填入
5. 退出登录后再次点击，确认回到登录提示
```

Expected:
- Logged-in path returns `filled`
- Logged-out path returns `login_required`

- [ ] **Step 5: Commit**

```bash
git add extensions/xiaohongshu-draft-bridge/xiaohongshu-fill.js extensions/xiaohongshu-draft-bridge/service-worker.js
git commit -m "feat: fill xiaohongshu creator draft from extension"
```

## Task 6: Polish Validation, Recovery Copy, And Docs

**Files:**
- Modify: `app/lib/xiaohongshu-draft-bridge.ts`
- Modify: `app/components/recontent/result-document.tsx`
- Modify: `README.md`
- Create: `extensions/xiaohongshu-draft-bridge/README.md`
- Test: `app/page.test.tsx`

- [ ] **Step 1: Add failing UI test for missing extension fallback**

```tsx
it("shows install guidance when the extension is unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      results: [{ platform: "xiaohongshu", title: "标题", content: "正文" }]
    })
  }));

  render(<HomePage />);
  fireEvent.change(screen.getByLabelText("待重制的原始文本"), {
    target: { value: "source article" }
  });
  fireEvent.click(screen.getByRole("button", { name: "开始重制" }));
  fireEvent.click(await screen.findByRole("button", { name: "发送到小红书草稿" }));

  expect(await screen.findByText("未检测到小红书草稿连接器，请先安装桌面扩展。")).toBeTruthy();
});
```

- [ ] **Step 2: Add lightweight payload validation before dispatch**

```ts
if (!payload.title || payload.title.length > 20) {
  return {
    status: "validation_error",
    message: "小红书标题需要在 1-20 个字符之间，请先调整后再发送。"
  };
}

if (!payload.content.trim()) {
  return {
    status: "validation_error",
    message: "当前正文为空，暂时无法发送到小红书草稿。"
  };
}
```

- [ ] **Step 3: Add recovery copy near the CTA**

```tsx
{draftStatus?.status === "bridge_unavailable" ? (
  <p className="text-[11px] leading-5 text-slate-500">
    你仍然可以先点“复制内容”，手动粘贴到小红书创作页。
  </p>
) : null}
```

- [ ] **Step 4: Document install and safety constraints**

```md
## 小红书草稿连接器（桌面版）

1. 打开 `extensions/xiaohongshu-draft-bridge`
2. 在 Chrome / Edge 的扩展管理页加载该目录
3. 保持你的小红书创作者后台登录状态
4. 在 ReContent 的小红书结果卡片点击 `发送到小红书草稿`

限制：
- 仅支持桌面 Chromium 浏览器
- 只填充标题与正文
- 不自动发布
```

- [ ] **Step 5: Run full verification**

Run:

```bash
npx vitest run app/page.test.tsx app/lib/xiaohongshu-draft-bridge.test.ts
npm run build
```

Expected:
- All targeted tests PASS
- Production build succeeds

- [ ] **Step 6: Commit**

```bash
git add app/lib/xiaohongshu-draft-bridge.ts app/components/recontent/result-document.tsx app/page.test.tsx README.md extensions/xiaohongshu-draft-bridge/README.md
git commit -m "docs: document xiaohongshu draft connector workflow"
```

## Task 7: Finish Flow

**Files:**
- No code changes required unless review finds issues

- [ ] **Step 1: Self-check the branch scope**

Run: `git status --short`

Expected: only Xiaohongshu draft connector files are modified

- [ ] **Step 2: Request code review**

Use `superpowers:requesting-code-review`

Expected: findings list with bugs / regressions / missing tests

- [ ] **Step 3: Request adversarial review**

Use a separate subagent through `superpowers:subagent-driven-development`

Expected: explicit attacks against login handling, missing extension, changed selectors, and long-title validation

- [ ] **Step 4: Fix review findings and rerun validation**

Run:

```bash
npx vitest run app/page.test.tsx app/lib/xiaohongshu-draft-bridge.test.ts app/api/repurpose/*.test.ts
npm run build
```

Expected: PASS

- [ ] **Step 5: Push and open PR**

```bash
git push -u origin <branch-name>
gh pr create --fill --reviewer <reviewer>
```

- [ ] **Step 6: Observe Cloudflare build**

Check the PR status and confirm preview/build is green before merging.

## Self-Review

### Spec coverage

- Button in Xiaohongshu result view: Task 3
- Logged-in open-and-fill path: Task 5
- Unlogged login-required path: Task 5
- Failure fallback and copy guidance: Task 6
- Desktop-only / local-only constraints: File structure assumptions + Task 6 docs
- No auto publish: Task 5 + Task 6 docs

### Placeholder scan

Search after edits:

```bash
python - <<'PY'
from pathlib import Path
text = Path("docs/superpowers/plans/2026-07-01-xiaohongshu-draft-connector.md").read_text()
checks = [
    bytes.fromhex("544f444f").decode(),
    bytes.fromhex("544244").decode(),
    bytes.fromhex("696d706c656d656e74206c61746572").decode(),
    bytes.fromhex("617070726f707269617465206572726f722068616e646c696e67").decode(),
    bytes.fromhex("73696d696c617220746f205461736b").decode(),
]
for check in checks:
    if check in text:
        print(check)
PY
```

Expected: no output

### Type consistency

- Shared payload shape is defined once in `types.ts`
- Client, UI, and extension all use the same result statuses
- Validation path adds `validation_error`, which is already part of the shared union
