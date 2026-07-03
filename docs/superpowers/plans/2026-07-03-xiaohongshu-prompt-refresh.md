# Xiaohongshu Prompt Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the Xiaohongshu generation prompt so outputs become more detailed, more scene-driven, and more like real Xiaohongshu share-style notes without changing the API schema or other platforms.

**Architecture:** Keep the existing single-platform prompt builder and only rewrite the Xiaohongshu platform instruction text. Extend prompt-builder and route tests to lock in the new length, structure, conservative fallback, and tone hierarchy while avoiding cross-platform drift.

**Tech Stack:** Next.js, TypeScript, Vitest

---

### Task 1: Lock the new Xiaohongshu prompt contract in tests

**Files:**
- Modify: `app/api/repurpose/prompt-builder.test.ts`
- Reference: `app/api/repurpose/prompt-builder.ts`

- [ ] **Step 1: Write the failing test for the refreshed Xiaohongshu rules**

```ts
it("describes xiaohongshu as a detailed share-style note", () => {
  const prompt = buildRepurposeUserPrompt({
    source: "Source content",
    platform: "xiaohongshu",
    tone: "neutral",
    customInstruction: "更像真实博主分享"
  });

  expect(prompt).toContain("小红书笔记：1 篇中文笔记");
  expect(prompt).toContain("正文（约 700-1200 字）");
  expect(prompt).toContain("从具体场景、问题、感受或观察切入");
  expect(prompt).toContain("至少 3 个展开段");
  expect(prompt).toContain("像真人分享经验");
  expect(prompt).toContain("弱营销感");
  expect(prompt).toContain("3-5 个强相关标签");
});
```

- [ ] **Step 2: Run the targeted test to confirm it fails**

Run: `npx vitest run app/api/repurpose/prompt-builder.test.ts -t "describes xiaohongshu as a detailed share-style note"`

Expected: FAIL because the current prompt still says `正文（300-800 字）` and does not include the new structure/tone wording.

- [ ] **Step 3: Add a conservative-mode regression test**

```ts
it("keeps conservative mode strict while using the refreshed xiaohongshu guidance", () => {
  const prompt = buildRepurposeUserPrompt({
    source: "Source content",
    platform: "xiaohongshu",
    tone: "neutral",
    customInstruction: "更克制、更专业",
    mode: "conservative"
  });

  expect(prompt).toContain("只返回一个可被 JSON.parse 解析的 JSON 对象");
  expect(prompt).toContain("正文（约 300-600 字）");
  expect(prompt).toContain("正文用 2-4 个短段完成主要观点");
});
```

- [ ] **Step 4: Run the full prompt-builder test file and confirm the new tests fail first**

Run: `npx vitest run app/api/repurpose/prompt-builder.test.ts`

Expected: FAIL only on the newly added Xiaohongshu assertions.

### Task 2: Implement the refreshed Xiaohongshu prompt wording

**Files:**
- Modify: `app/api/repurpose/prompt-builder.ts`
- Test: `app/api/repurpose/prompt-builder.test.ts`

- [ ] **Step 1: Replace the old Xiaohongshu line with the new detailed guidance**

Update the platform section so the Xiaohongshu rule becomes:

```ts
- 小红书笔记：1 篇中文笔记，包含一个有吸引力的标题（不超过 20 字）和正文（约 700-1200 字）。标题优先体现人群、场景、痛点或收获感；正文采用短段落表达，从具体场景、问题、感受或观察切入，至少 3 个展开段，每段尽量提供解释、例子、方法、对比或适用场景。默认采用真诚自然、偏真人分享的表达，营销感尽量弱；在不削弱弱营销感、平台结构和 JSON 约束的前提下，可根据个性化要求微调口吻。可使用少量 emoji，并在结尾带上 3-5 个强相关标签。
```

- [ ] **Step 2: Add a conservative Xiaohongshu fallback that prefers JSON reliability**

Update the conservative Xiaohongshu rule so the fallback prompt becomes more compact:

```ts
- 小红书笔记：1 篇中文笔记，包含一个有吸引力的标题（不超过 20 字）和正文（约 300-600 字）。标题优先体现人群、场景、痛点或收获感；正文用 2-4 个短段完成主要观点，从具体场景、问题、感受或观察切入即可。优先保证标题、正文和 JSON 结构正确；如有必要，可进一步减少细节、例子和标签数量，但不要丢失核心信息。默认采用真诚自然、偏真人分享的表达，营销感尽量弱，并在结尾保留 1-3 个强相关标签。
```

- [ ] **Step 3: Keep all existing JSON and personalization hierarchy intact**

Keep these hierarchy lines intact:

```ts
${personalizedLine}
${modeSpecificLine}
${conflictLine}
```

and do not change the JSON example or return shape.

- [ ] **Step 4: Run the prompt-builder tests and confirm they pass**

Run: `npx vitest run app/api/repurpose/prompt-builder.test.ts`

Expected: PASS

### Task 3: Verify no API contract regressions

**Files:**
- Verify: `app/api/repurpose/route.test.ts`
- Verify: `app/api/repurpose/*.test.ts`

- [ ] **Step 1: Run the repurpose API tests**

Run: `npx vitest run app/api/repurpose/*.test.ts`

Expected: PASS

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: PASS

### Task 4: Finish with review and delivery gates

**Files:**
- Verify staged diff only includes prompt-refresh work

- [ ] **Step 1: Run an independent code review**

Request a subagent review focused on bugs, regressions, missing tests, and prompt hierarchy risks.

- [ ] **Step 2: Run an adversarial review**

Request a second subagent review focused on failure cases such as prompt drift, over-verbose outputs breaking JSON, or conflicts with custom instructions.

- [ ] **Step 3: Apply any required fixes and rerun validation**

Run:

```bash
npx vitest run app/api/repurpose/*.test.ts
npm run build
```

Expected: PASS

- [ ] **Step 4: Commit, push, and open PR**

Run:

```bash
git add app/api/repurpose/prompt-builder.ts app/api/repurpose/prompt-builder.test.ts docs/superpowers/specs/2026-07-03-xiaohongshu-prompt-refresh-design.md docs/superpowers/plans/2026-07-03-xiaohongshu-prompt-refresh.md
git commit -m "feat: refresh xiaohongshu prompt style"
git push -u origin codex/xhs-prompt-refresh
gh pr create --title "feat: refresh xiaohongshu prompt style" --body "<fill summary, risks, validation>"
```

Expected: branch pushed and PR created.
