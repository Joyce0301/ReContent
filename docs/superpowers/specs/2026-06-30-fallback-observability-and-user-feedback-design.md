# Fallback Observability And User Feedback Design

## Goal

在现有 `/api/repurpose` 重试机制之上，补齐两项 P1 能力：

1. 细化失败分类，让系统能区分“服务抖动”“输出格式错误”“平台字段不合规”“个性化要求风险高”等不同失败来源。
2. 在 fallback 成功时，向前端返回一条简洁、可信的系统提示，让用户知道系统发生过自动降级，但不暴露底层实现细节。

本轮不引入新的 agent 步骤，不修改现有 retry 主流程，不做 dashboard，也不做按失败类型切换不同 prompt 模板。

## Scope

### In Scope

- 为现有失败结果新增产品层级的 `failureBucket`
- 在结构化运行日志中记录 `failureBucket`
- 在 fallback 成功响应中新增 `meta` 字段
- 为不同 `failureBucket` 生成对应的用户提示文案
- 为 API 与前端消费路径补充测试

### Out Of Scope

- 按失败类型切换不同 prompt 模板
- 新增 verifier / repairer / planner 等 agent 步骤
- 持久化日志到数据库或第三方监控系统
- 新增复杂的前端交互设计

## Current State

当前系统已经具备：

- 输入校验与个性化要求基础清洗
- `normal -> conservative` 的 fallback 机制
- `transient / generation` 两层失败分类
- 结构化运行日志基础字段
- 对空结果、空内容、小红书标题非法等结果 gate

当前缺口在于：

- 同属 `generation` 的错误没有进一步区分，无法支持精确统计
- fallback 成功后用户无感知，容易误以为 API 本身不稳定
- 前端无法知道本次结果是否来自保守模式

## Design

### 1. Failure Model

保留现有内部重试维度：

- `failureClass: "transient" | "generation"`
- `failureKind: ...`

在此基础上新增一个更贴近产品与运营分析的字段：

- `failureBucket`

建议的 bucket 定义如下：

- `provider_transient`
  - 适用：超时、限流、5xx、空响应
  - 目的：识别外部服务波动
- `output_format_error`
  - 适用：非法 JSON、JSON 外包裹解释文字、结构不匹配
  - 目的：识别模型输出格式不稳定
- `platform_validation_error`
  - 适用：平台字段缺失、内容空白、小红书标题不合法
  - 目的：识别结果虽然可解析但不可用
- `instruction_risk_error`
  - 适用：个性化要求过长、压缩后仍明显冲突、表达信号过密导致结果不稳定
  - 目的：识别用户输入复杂度对生成稳定性的影响

### 2. Mapping Rules

新增一层从现有错误信息到 `failureBucket` 的映射逻辑。

建议规则：

- `rate_limit / network_timeout / provider_5xx / empty_response` -> `provider_transient`
- `invalid_json / invalid_schema` -> `output_format_error`
- `empty_content` 或解析后平台字段不合规 -> `platform_validation_error`
- 个性化要求在进入生成前被判定为高风险，或保守模式下仍需显著压缩后才成功 -> `instruction_risk_error`

这里的关键点是：

- `failureClass` 继续只服务于 retry 决策
- `failureBucket` 服务于日志、统计、提示文案和后续 prompt router

这两个概念不能合并，否则后面会把控制流逻辑和产品分析逻辑搅在一起。

### 3. API Response Contract

当前响应格式：

```json
{
  "results": [...]
}
```

升级后：

```json
{
  "results": [...],
  "meta": {
    "fallbackTriggered": true,
    "finalMode": "conservative",
    "message": "系统检测到首轮结果不够稳定，已自动切换为更保守的生成模式。"
  }
}
```

约束：

- 首轮成功时不返回 `meta.message`
- 没有发生 fallback 时，`fallbackTriggered` 为 `false`
- 只有最终成功时才返回 `meta`
- 最终失败仍维持现有错误响应结构，不强加新字段

### 4. User Messaging

提示文案只在“发生 fallback 且最终成功”时展示，避免对正常请求造成噪音。

推荐文案：

- `provider_transient`
  - `生成过程出现短暂波动，系统已自动重试并输出结果。`
- `output_format_error`
  - `系统检测到首轮结果不够稳定，已自动切换为更保守的生成模式。`
- `platform_validation_error`
  - `系统已自动修正首轮结果中的平台格式问题，并返回更稳定的版本。`
- `instruction_risk_error`
  - `你的个性化要求较复杂，系统已优先保证平台格式和内容稳定性。`

设计原则：

- 不说“报错”“失败”“异常”，降低焦虑
- 不暴露 JSON、schema、retry count 等实现细节
- 承认系统做了保护动作，建立可信感

### 5. Frontend Behavior

前端本轮仅做轻量消费：

- 如果响应中存在 `meta.message`，在结果区域顶部显示一条浅灰色提示条
- 如果不存在 `meta.message`，前端行为完全不变

提示条应延续当前苹果官网风格的白灰系视觉，不新增警告红或高风险黄。

本轮不做：

- 可关闭 toast
- 提示历史
- 每个平台单独提示

### 6. Logging

扩展当前运行日志字段，至少包含：

- `hasCustomInstruction`
- `attemptCount`
- `attempts[].failureKind`
- `attempts[].failureBucket`
- `finalMode`
- `finalStatus`
- `fallbackTriggered`

日志中不得包含原文正文与用户完整个性化要求，只记录是否存在以及与失败相关的结构化信息，避免敏感内容泄露。

## File-Level Changes

预计涉及以下文件：

- `app/api/repurpose/failure-policy.ts`
  - 新增 `failureBucket` 类型与映射函数
- `app/api/repurpose/route.ts`
  - 记录 bucket、组装 `meta`、扩展日志与成功响应
- `app/api/repurpose/route.test.ts`
  - 覆盖新响应结构与提示分支
- 前端结果页相关文件
  - 消费 `meta.message` 并渲染轻量提示条

如果前端响应消费逻辑已经集中在单一组件中，则只改该组件；如果分散，则在 implementation plan 阶段明确具体文件。

## Error Handling

- 若 fallback 成功但 bucket 无法确定，默认不返回 `meta.message`
- 若存在多个失败尝试，以最终成功前“最关键的一次失败 bucket”生成用户提示
- 若输入在进入生成前就被直接 400 拒绝，不返回 `meta`

## Testing

至少覆盖以下测试：

- transient 失败后重试成功，返回 `provider_transient` 对应提示
- 非法 JSON 后保守模式成功，返回 `output_format_error` 对应提示
- 平台字段不合规后保守模式成功，返回 `platform_validation_error` 对应提示
- 个性化要求高风险触发保守模式并成功，返回 `instruction_risk_error` 对应提示
- 首轮成功时不返回 `meta.message`
- 日志包含 `failureBucket` 与 `fallbackTriggered`

## Rollout

建议按以下顺序落地：

1. 先补服务端 bucket 与日志
2. 再补成功响应 `meta`
3. 最后接前端提示条

这样即便前端还没接入，服务端层面的观测能力也能先上线。

## Success Criteria

本轮完成后，应满足：

- 每次 fallback 成功请求都能在日志里定位失败 bucket
- 前端能在保守模式成功时向用户展示一条准确、低打扰的解释
- 首轮成功请求的用户体验不变
- 现有测试与构建继续通过
