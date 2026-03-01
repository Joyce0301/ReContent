# ReContent — AI 内容重制 MVP

基于《AI Content Repurposer — 智能内容重制平台》PRD 实现的最小可用版本（MVP）：

- 文本 / URL 作为输入
- 支持 Twitter / LinkedIn / 小红书 三个平台适配
- 前端一屏完成「输入 → 平台选择 → AI 生成 → 编辑 & 一键复制」
- 后端调用 OpenAI（或使用内置 Mock）完成多平台内容生成

本仓库使用 **Next.js + React + TypeScript + TailwindCSS** 实现，方便后续继续扩展 Supabase、认证、用量限制等完整 SaaS 能力。

## 1. 快速开始

### 1.1 安装依赖

在项目根目录执行：

```bash
pnpm install   # 或 npm install / yarn install
```

### 1.2 配置环境变量（可选但推荐）

在项目根目录创建 `.env.local` 文件，填入你的 OpenAI Key：

```bash
OPENAI_API_KEY=sk-xxxxx
```

> 如果不配置 `OPENAI_API_KEY`，后端会自动使用内置的 Mock 逻辑，返回结构正确的示例文案，方便本地开发联调。

### 1.3 启动开发环境

```bash
pnpm dev   # 或 npm run dev / yarn dev
```

然后访问浏览器中的 `http://localhost:3000`。

## 2. 功能说明（对应 PRD 的 MVP）

- **内容输入**
  - 文本粘贴：在左侧大文本框中直接粘贴博客、脚本或长文内容
  - URL 输入：切换到「输入 URL」标签，粘贴文章链接，后端会简单抓取页面正文文本
- **平台选择**
  - 支持 Twitter / LinkedIn / 小红书 三个平台多选
  - 后续可以在此处扩展 Newsletter、Instagram 等平台
- **语气与风格**
  - 支持「中性专业 / 正式商务 / 轻松口语」三种语气，作为 Prompt 的一部分传给大模型
- **AI 生成 & 结果展示**
  - 点击「开始重制」后调用 `/api/repurpose` 路由
  - 右侧区域按平台卡片展示生成结果，支持一键复制

## 3. 代码结构概览

- `app/layout.tsx`：应用基础 Layout 与全局样式引用
- `app/page.tsx`：MVP 主界面，包含输入区、平台选择、语气选择、结果展示与复制
- `app/api/repurpose/route.ts`：后端 API
  - 文本校验与 URL 抓取
  - 调用 OpenAI 完成多平台内容重制（或使用 Mock 结果）
- `app/globals.css` / `tailwind.config.ts`：全局样式与 Tailwind 配置

## 4. 后续扩展建议（对齐 PRD）

在此基础上，你可以按 PRD 路线图逐步扩展：

- 接入 Supabase 做用户认证与历史记录保存
- 增加用量计数与免费额度限制
- 新增 Newsletter / Instagram 等更多平台适配
- 增强 URL 抓取能力（接入 Firecrawl 等服务）
- 增加团队协作、风格学习等高级功能

欢迎在本项目基础上继续迭代成完整 SaaS。👍

