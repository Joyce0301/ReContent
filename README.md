# ReContent

一个基于 LLM 的多平台内容重制应用，目标是把一份原始长内容快速改写成适配不同渠道的可发布版本。当前项目已经完成从输入、生成、展示到复制的核心闭环，并在后端加入了更稳健的失败回退策略，适合继续往 Agent 化内容生产工具方向扩展。

## 项目目前做到哪里了

当前阶段可以把它理解为一个已经具备完整主流程的 `MVP+` 版本，而不只是静态 Demo。

已经完成的关键能力包括：

- 支持两种输入来源：直接粘贴文本，或输入 URL 后自动抓取正文
- 支持三个目标平台：`Twitter / X`、`LinkedIn`、`小红书`
- 支持三种基础语气：`中性专业`、`正式商务`、`轻松口语`
- 支持用户追加“个性化要求”，例如“更像创始人发言”“更克制一点”“保留一点故事感”
- 前端一屏完成：输入内容、选择平台、设置语气、补充个性化风格、查看结果、复制成稿
- 后端已支持真实模型调用，并保留本地 `mock` 回退，方便开发联调
- API 已加入失败分类、重试决策和保守模式 fallback，降低个性化要求较复杂时的生成失败率

换句话说，这个项目现在已经能稳定演示一条完整链路：

`原始内容输入 -> 内容抽取/清洗 -> Prompt 构建 -> 模型生成 -> JSON 校验 -> 多平台结果展示`

## 已实现功能

### 1. 内容输入

- 文本模式：直接粘贴博客、文章、脚本、播客逐字稿等原始内容
- URL 模式：输入文章链接，后端自动提取正文文本
- 输入校验：空内容、非法输入模式、缺失平台等情况都会返回明确报错

### 2. 多平台内容重制

当前支持以下平台：

- `Twitter / X`
  生成适合线程阅读的短内容
- `LinkedIn`
  生成结构更完整、偏职业表达的长帖
- `小红书`
  生成带标题的中文笔记内容

平台是可多选的，一次请求可以同时生成多个平台版本。

### 3. 风格与个性化控制

除了基础语气选择外，用户还可以额外输入个性化要求，例如：

- 更像创始人公开发言
- 保留专业判断，但不要太营销
- 更自然一点，增加一点故事感

这一层输入会被拼接到系统内置 Prompt 后面，但不会覆盖平台格式、JSON 结构和事实约束。

目前已做的保护包括：

- 长度限制，避免超长个性化要求直接拉高失败率
- prompt-injection 风险词检测
- 空白字符清洗与规范化

### 4. 更稳健的失败回退策略

这是当前项目相对早期版本比较重要的一次升级。

为了减少“个性化要求一复杂就报错”这种情况，`/api/repurpose` 现在已经具备显式 fallback 机制：

- 先走 `normal mode`
- 如果是瞬时失败，例如限流、空响应、网络类问题，先按原模式重试一次
- 如果是生成类失败，例如无效 JSON、结构不合法、内容为空，直接切到 `conservative mode`
- `conservative mode` 会使用更严格的 Prompt、更低的 temperature，以及压缩后的个性化要求

这样做的作用是：

- 提高结构化 JSON 返回成功率
- 降低复杂风格描述导致的输出失控
- 让失败处理从“碰运气重试”变成“带策略的回退”

### 5. 结果展示与交互

前端已经不是简单的原始文本输出，而是做了可直接使用的成稿视图：

- 结果按平台分类展示
- 自动适配不同平台的阅读宽度与排版密度
- 支持一键复制
- 保留标题与正文结构
- 支持请求中、失败态、复制成功/失败等反馈

## 界面与体验

当前前端整体已经切到偏苹果官网风格的浅灰白视觉体系，页面不是“局部改白、整体还偏黑”的拼接风格，而是统一了：

- 整体背景与卡片层级
- 输入区和结果区的白灰色系
- 边框、阴影、圆角和信息密度
- 更偏原生产品官网的干净观感

这部分已经覆盖到主页主流程，包括输入面板、平台筛选、风格设置、个性化输入和结果展示区域。

## 技术栈

- `Next.js 16`
- `React 19`
- `TypeScript`
- `Tailwind CSS`
- `OpenAI SDK`
- 自定义 `Kimi` 客户端
- `Vitest` 用于 API 和 Prompt 相关测试
- `OpenNext + Cloudflare` 用于构建/预览/部署

## 项目结构

核心目录大致如下：

```text
app/
  api/repurpose/
    route.ts                 # 主 API 路由，负责校验、生成、fallback 编排
    prompt-builder.ts        # 根据模式构建 normal / conservative prompt
    failure-policy.ts        # 失败分类、压缩个性化要求、重试决策
    content-extraction.ts    # URL 正文抽取
    kimi-client.ts           # Kimi 模型调用封装
  components/recontent/
    input-panel.tsx          # 输入、平台、语气、个性化要求面板
    result-surface.tsx       # 结果容器
    result-document.tsx      # 单平台成稿视图
  page.tsx                   # 首页主流程
```

## 本地启动

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

在根目录创建 `.env.local`：

```bash
OPENAI_API_KEY=sk-xxxxx
KIMI_API_KEY=your-kimi-key
OPENAI_MODEL=gpt-4.1-mini
KIMI_MODEL=moonshot-v1-32k
```

说明：

- 配置 `KIMI_API_KEY` 时，后端会优先使用 Kimi
- 否则如果配置了 `OPENAI_API_KEY`，会走 OpenAI
- 两者都不配时，会使用内置 `mock` 返回示例内容，方便本地联调 UI

### 3. 启动开发环境

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)。

## 常用命令

```bash
npm run dev       # 本地开发
npm run build     # 生产构建
npm run start     # 本地启动生产环境
npm run preview   # OpenNext + Cloudflare 预览
npm run deploy    # 部署到 Cloudflare
```

## 测试与验证

当前项目已经覆盖了核心 API 能力的测试，重点包括：

- URL 内容抽取
- Prompt 构建
- Kimi 客户端调用
- 个性化要求校验
- fallback 重试路径
- JSON 解析与结构验证

可直接运行：

```bash
npx vitest run app/api/repurpose/route.test.ts \
  app/api/repurpose/prompt-builder.test.ts \
  app/api/repurpose/failure-policy.test.ts \
  app/api/repurpose/kimi-client.test.ts \
  app/api/repurpose/content-extraction.test.ts
```

## 当前项目亮点

如果从“项目描述”而不是“功能清单”的角度看，这个项目目前比较有代表性的点有：

- 不只是调用 LLM 生成文案，而是做了面向多平台改写的结构化输出约束
- 已支持用户个性化风格输入，而不是固定模板生成
- 有显式失败回退策略，开始具备 Agent 式编排的雏形
- 前后端链路完整，可本地开发、测试、构建、部署
- 保留多模型扩展空间，后续可以继续接更多 provider 或多模态能力

## 下一步可以继续做什么

如果继续往完整产品演进，比较自然的方向有：

- 接入 Supabase，支持用户登录、历史记录与项目保存
- 加入用量统计、额度控制和订阅体系
- 扩展更多平台模板，例如 Newsletter、公众号、Instagram、Threads
- 增强 URL 抽取质量，例如接入更稳定的抓取服务
- 增加“品牌语气 / 风格模板 / 历史学习”能力
- 增加多 provider 自动切换或降级策略
- 在前端补充生成历史、版本对比和二次编辑能力

## 项目定位

ReContent 现在已经不是“一个能调用大模型的页面”，而是一个已经具备内容重制核心链路、风格控制能力和基础可靠性设计的内容生产工具原型。后续继续往 Agent Framework、SaaS 化和多模型编排方向延展，会比较顺。
