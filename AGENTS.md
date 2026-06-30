# AGENTS Guide

本文件面向所有进入本仓库协作的 agent。目标只有一个：在不污染主工作区的前提下，稳定、可审查地推进 ReContent 的开发。

## First Rule: Use Git Worktree By Default

从现在开始，`git worktree` 是本项目的默认工作方式，不是可选优化。

任何 agent 在开始以下任务前，都应优先考虑新建独立 worktree：

- 新功能开发
- bug 修复
- README / 文档更新
- PR 冲突修复
- 实验性 prompt / fallback / UI 调整

不要在一个已经混有其他任务改动的工作区里直接开启新任务。

## Why This Matters In ReContent

ReContent 当前会并行演进多条任务线：

- API 与 fallback 稳定性
- prompt / failure-policy 策略
- 前端体验与视觉风格
- 文档、spec、plan
- 紧急 hotfix

如果这些任务都在同一个目录里进行，很容易出现：

- 改动串味：一个 PR 混入不相关文件
- 测试失真：当前验证结果被别的未完成改动污染
- agent 互相阻塞：一个任务未收尾，另一个任务无法安全展开

`git worktree` 的作用就是给每条任务线一个独立、可提交、可验证、可删除的隔离环境。

## Default Workflow

### 1. Start From A Clean Baseline

优先基于 `origin/main` 或明确指定的目标分支创建 worktree，不要直接在脏工作区里切分支。

示例：

```bash
git fetch origin
git worktree add -b codex/p1-fallback-feedback ../ReContent-p1-fallback origin/main
```

这条命令会：

- 在仓库同级目录创建一个新的工作目录
- 新建并切换到分支 `codex/p1-fallback-feedback`
- 让该目录只服务当前任务

### 2. One Worktree, One Task

每个 worktree 只做一件事。

推荐映射关系：

- 一个功能 = 一个 worktree
- 一个 bugfix = 一个 worktree
- 一个 README / 文档 PR = 一个 worktree
- 一个冲突修复 PR = 一个 worktree

禁止在同一个 worktree 内同时推进：

- API fallback 改造
- 前端样式重构
- README 扩写

即使这些工作都“顺手”，也要拆开。

### 3. Name Worktrees Clearly

工作目录名应直接体现任务目的，推荐格式：

```bash
../ReContent-<topic>
```

例如：

- `../ReContent-p1-fallback`
- `../ReContent-ui-polish`
- `../ReContent-readme`
- `../ReContent-hotfix`

分支名推荐与目录名语义保持一致：

- `codex/p1-fallback-feedback`
- `codex/ui-polish`
- `codex/readme-refresh`

## ReContent Task Examples

适合拆成独立 worktree 的典型任务：

- `P1.1 + P1.2` 失败 bucket 与用户提示
- `P2` prompt router
- 苹果风格前端统一改版
- `README` / `spec` / `plan` 文档整理
- Cloudflare 构建报错修复
- 某个 PR merge conflict 修复

不建议把这些任务混在一个工作区里一起提交。

## Execution Rules For Agents

所有 agent 都应遵守以下规则：

1. 在开始实现前，先检查当前工作区是否已经存在不相关改动。
2. 如果存在不相关改动，优先新建 worktree，而不是在原目录硬做。
3. 不要为了“省事”直接复用一个历史 worktree 做新任务。
4. 未经明确要求，不要清理或覆盖其他 worktree 中的用户改动。
5. 提交前只 stage 当前任务涉及的文件，避免把别的 worktree 思路带进来。

## Verification Inside A Worktree

每个 worktree 都必须独立完成最小验证，再进入 PR 阶段。

至少执行：

```bash
npx vitest run app/api/repurpose/*.test.ts
npm run build
```

如果任务只涉及文档，也要至少确认：

- 文档落点正确
- 与现有实现不矛盾
- 没有把别的未完成改动一起提交

## Cleanup Rules

PR 合并后，应尽快清理对应 worktree，避免旧环境长期堆积。

示例：

```bash
git worktree remove ../ReContent-p1-fallback
git branch -d codex/p1-fallback-feedback
```

如果分支已经推送并合并，也可删除远端分支：

```bash
git push origin --delete codex/p1-fallback-feedback
```

## What To Avoid

不要这样做：

- 在主工作区里同时改 API、UI、README
- 在脏目录里新开需求
- 一个 worktree 连续承接多个无关任务
- 为了临时修 bug，直接覆盖另一个任务未提交的改动
- 提交时使用会把无关文件一起带上的粗暴暂存方式

## Recommended Habit

把 worktree 当作“任务沙箱”。

当一个 agent 接到新任务时，默认先判断：

`这个任务是否应该有自己的独立目录和分支？`

在 ReContent 里，大多数情况下答案都是“应该”。
