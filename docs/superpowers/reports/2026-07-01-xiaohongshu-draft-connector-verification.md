# Xiaohongshu Draft Connector Verification Report

日期：2026-07-01

## 范围

本报告对应以下目标：

- 根据 `docs/superpowers/plans/2026-07-01-xiaohongshu-draft-connector.md` 完成小红书草稿连接器第一版开发
- 对照计划中的 `Acceptance Criteria` 做完成度审计

## 当前结论

### 已有强证据支持的部分

- 前端入口、状态流、校验、错误文案已经实现
- 新增独立的浏览器验收页 `/xiaohongshu-draft-debug`，可绕过完整生成链路直接验证桥接能力
- 新增 relay `probe` 握手与调试态展示，可快速区分“扩展未接通”和“小红书页面未登录/不支持”
- 新增 service worker 对本地 ReContent 页的主动 bridge reinject 逻辑，避免只依赖静态 content script 注入
- 修复了未登录路径中的两类真实浏览器问题：
  - creator 页登录跳转导致的 `Frame with ID 0 was removed.`
  - fill 执行 Promise 悬空，页面长期停留在 `opening`
- Chromium 扩展桥接骨架已经实现
- 小红书创作页填充逻辑、等待页面就绪逻辑、回读校验逻辑已经实现
- 代码层面的自动化验证已经通过：
  - `npm run lint`
  - `npx vitest run app/page.test.tsx app/xiaohongshu-draft-debug/page.test.tsx app/lib/xiaohongshu-draft-bridge.test.ts app/api/repurpose/*.test.ts extensions/xiaohongshu-draft-bridge/xiaohongshu-fill.test.ts extensions/xiaohongshu-draft-bridge/manifest.test.ts extensions/xiaohongshu-draft-bridge/service-worker.test.ts`
  - `npm run build`
- 常规 code review 已完成，复审结果为无剩余 actionable finding
- 已拿到真实 Edge 临时 profile 下的浏览器级证据：
  - 调试页显示 `桥接状态：已检测到`
  - 点击按钮后，浏览器实际打开小红书 creator / login 路径
  - ReContent 页面最终收敛到 `请先登录小红书，登录完成后重新发送。`

### 已完成的实机验收补充

- 2026-07-01 在已登录 Edge 临时 profile 中复测通过“已登录自动填充”链路：
  - 调试页触发后，ReContent 页面显示 `已打开小红书编辑页，请检查内容后保存草稿。`
  - creator 页最终停留在可编辑状态，而不是登录页或视频上传页
  - 标题被写入为 `AI 内容重制如何写成小红书`
  - 正文被写入为 `先讲一个真实场景：同一份素材要改成小红书版本。核心做法是保留观点，再重写表达。#AI工具 #内容运营`
- 为了稳定采集这段证据，仓库新增：
  - `scripts/verify-xiaohongshu-draft-cdp.mjs`
  - `npm run verify:xiaohongshu-draft:cdp`

因此：

> 当前实现已经达到“代码完成 + 自动化验证完成 + 未登录链路实机通过 + 已登录自动填充实机通过”。

## 证据映射

### Functional acceptance

#### 1. Xiaohongshu result cards render a visible `发送到小红书草稿` button, while Twitter / LinkedIn cards do not render this action.

- 证据：
  - `app/components/recontent/result-document.tsx`
  - `app/page.test.tsx`
- 验证结果：
  - 已通过自动测试

#### 2. Clicking `发送到小红书草稿` on a valid Xiaohongshu result sends a structured payload containing `sourceId`, `title`, `content`, and `tags`.

- 证据：
  - `app/lib/xiaohongshu-draft-bridge.ts`
  - `app/lib/xiaohongshu-draft-bridge.test.ts`
  - `app/page.test.tsx`
- 验证结果：
  - 已通过自动测试

#### 3. When the desktop bridge extension is installed and the browser is already logged into Xiaohongshu Creator, clicking the button opens the creator page and fills the title and body fields.

- 证据：
  - `extensions/xiaohongshu-draft-bridge/service-worker.js`
  - `extensions/xiaohongshu-draft-bridge/xiaohongshu-fill.js`
  - `extensions/xiaohongshu-draft-bridge/xiaohongshu-fill.test.ts`
- 验证结果：
  - 代码和脚本级测试已覆盖
  - 已通过真实 Edge 浏览器实机验证
  - 浏览器级证据已确认：
    - creator 页进入已登录编辑态
    - 标题成功写入 `AI 内容重制如何写成小红书`
    - 正文成功写入固定测试草稿和标签

#### 4. When the browser is not logged into Xiaohongshu Creator, clicking the button leads the user into the login path and the ReContent UI shows `请先登录小红书，登录完成后重新发送。`

- 证据：
  - `extensions/xiaohongshu-draft-bridge/xiaohongshu-fill.js`
  - `extensions/xiaohongshu-draft-bridge/xiaohongshu-fill.test.ts`
  - `app/page.test.tsx`
- 验证结果：
  - 已通过脚本级和页面级自动测试
  - 已通过真实 Edge 浏览器实机验证
  - 浏览器级现象已确认：
    - 调试页显示 `桥接状态：已检测到`
    - 点击按钮后会打开 `https://creator.xiaohongshu.com/login?...`
    - 页面文案最终收敛到 `请先登录小红书，登录完成后重新发送。`

#### 5. When the extension is not installed or not reachable, the UI shows `未检测到小红书草稿连接器，请先安装桌面扩展。` and the existing `复制内容` path still works.

- 证据：
  - `app/lib/xiaohongshu-draft-bridge.ts`
  - `app/page.test.tsx`
  - `app/xiaohongshu-draft-debug/page.tsx`
  - `docs/superpowers/reports/2026-07-01-xiaohongshu-draft-connector-manual-checklist.md`
- 验证结果：
  - 已通过自动测试
  - 已通过真实浏览器手工验证（Chrome，无扩展场景）
  - 已通过真实 Edge 临时 profile 验证“relay 未接通时快速失败”的页面反馈
  - 已通过自动测试覆盖“probe + reinject”代码路径，但尚未拿到 relay 真正接通的浏览器证据

#### 6. The flow never auto-clicks `保存草稿` or `发布`.

- 证据：
  - `extensions/xiaohongshu-draft-bridge/service-worker.js`
  - `extensions/xiaohongshu-draft-bridge/xiaohongshu-fill.js`
  - `README.md`
  - `extensions/xiaohongshu-draft-bridge/README.md`
- 验证结果：
  - 代码检查和文档约束已覆盖
  - 缺实机观察证据，但代码中不存在相关调用

### Validation acceptance

#### 1. Empty or too-long title is blocked before dispatch.

- 证据：
  - `app/lib/xiaohongshu-draft-bridge.ts`
  - `app/lib/xiaohongshu-draft-bridge.test.ts`
- 验证结果：
  - 已通过自动测试

#### 2. Empty normalized content is blocked before dispatch.

- 证据：
  - `app/lib/xiaohongshu-draft-bridge.ts`
  - `app/lib/xiaohongshu-draft-bridge.test.ts`
- 验证结果：
  - 已通过自动测试

#### 3. Tag extraction does not delete the main note body.

- 证据：
  - `app/lib/xiaohongshu-draft-bridge.ts`
  - `app/lib/xiaohongshu-draft-bridge.test.ts`
- 验证结果：
  - 已通过自动测试

### UX acceptance

#### 1. UI shows `opening` state while the local browser flow starts.

- 证据：
  - `app/page.tsx`
  - `app/page.test.tsx`
- 验证结果：
  - 已通过自动测试

#### 2. UI shows success message after a successful fill.

- 证据：
  - `app/page.tsx`
  - `app/page.test.tsx`
- 验证结果：
  - 已通过自动测试

#### 3. UI shows `unsupported_page` fallback and keeps copy available.

- 证据：
  - `app/page.test.tsx`
  - `extensions/xiaohongshu-draft-bridge/xiaohongshu-fill.test.ts`
- 验证结果：
  - 已通过自动测试

### Quality acceptance

#### 1. Targeted tests pass

- 证据：
  - `vitest` 结果：`99 passed | 1 skipped`

#### 2. Existing API regression coverage still passes

- 证据：
  - `app/api/repurpose/*.test.ts` included in targeted run

#### 3. Production build passes

- 证据：
  - `npm run build` 通过

#### 4. README includes desktop-only scope, install steps, and no-auto-publish boundary

- 证据：
  - `README.md`
  - `extensions/xiaohongshu-draft-bridge/README.md`

## 结论

当前 acceptance criteria 已获得以下证据组合支持：

1. 自动化测试：
   - `npm run verify:xiaohongshu-draft`
2. 真实浏览器未安装扩展验收：
   - 调试页正确落到 `bridge_unavailable`
3. 真实浏览器未登录验收：
   - creator 跳到登录页
   - 调试页正确落到 `login_required`
4. 真实浏览器已登录验收：
   - creator 进入可编辑页
   - 标题 / 正文真实写入
   - 调试页正确落到 `filled`
