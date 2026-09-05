# Zvec Knowledge Memory Design

- Date: 2026-09-03
- Project: ReContent
- Status: App integration implemented; production EFS wiring pending

## Summary

Add Zvec as ReContent's lightweight knowledge memory layer. The first version should improve generation quality by retrieving user-specific writing memories and platform rules before prompt construction, while keeping MySQL as the source of truth for users, sessions, and drafts.

The first version does not add a knowledge management page, does not store every scraped URL, and does not make Zvec part of the critical generation path. If Zvec or embedding fails, ReContent continues with the current generation flow.

This implementation slice adds the application integration, local storage path, seed script, tests, and Docker runtime compatibility. Terraform EFS wiring is intentionally left for a separate infrastructure PR because the current ECS service ignores Terraform-managed task definition changes.

## Decisions

- Goal: improve user style memory and platform-rule consistency.
- Knowledge writes: write platform rules from a seed script; write user memories only after the user saves a draft.
- Deployment: local development uses `.data/zvec`; production runs Zvec inside the ReContent ECS container with data on EFS.
- Account isolation: one Zvec database or collection, with every user item tagged by `userId`; server-side search always filters by the authenticated session user.
- Retrieval: query up to 5 memories before building the prompt.
- Failure policy: skip knowledge retrieval on Zvec or embedding failure.
- Product surface: no new management page in the first version; the UI may later show a small "参考了 N 条记忆" indicator.

## Goals

- Make repeated generations reflect a user's saved style, wording, and preferred structure.
- Keep platform behavior more stable, especially for Xiaohongshu, LinkedIn, and Twitter/X.
- Reuse high-quality saved drafts without requiring the user to copy old examples into the prompt.
- Add the smallest stable module interface around Zvec so the repurpose workflow does not need to know vector database details.

## Non-Goals

- No multimodal document parsing.
- No file upload knowledge base.
- No user-facing knowledge dashboard.
- No database schema change for indexed status.
- No separate Zvec service.
- No hard dependency on knowledge retrieval for successful content generation.
- No Terraform-managed EFS mount in this application PR.

## Current System Facts

- `/api/repurpose` authenticates the user, validates input, and calls `runRepurposeWorkflow`.
- `runRepurposeWorkflow` extracts URL content when needed, then calls the model generation flow.
- `buildRepurposeUserPrompt` owns the final prompt text and platform rules.
- `/api/drafts` authenticates the user and calls `saveDraftForUser`.
- `saveDraftForUser` persists drafts in MySQL and returns the saved draft record with a stable `id`.

## Proposed Modules

### `app/lib/knowledge/types.ts`

Defines the small shared interface for knowledge records:

```ts
export type KnowledgeScope = "global" | "user";
export type KnowledgeKind = "platform_rule" | "style_memory" | "saved_example";

export type KnowledgeHit = {
  id: string;
  kind: KnowledgeKind;
  text: string;
  score: number;
  metadata: {
    scope: KnowledgeScope;
    userId?: string;
    platform?: "twitter" | "linkedin" | "xiaohongshu";
    draftId?: string;
  };
};
```

### `app/lib/knowledge/store.ts`

This is the main module interface. Callers should not import Zvec directly.

```ts
export async function searchKnowledgeForUser(input: {
  userId: string;
  platform: PlatformKey;
  query: string;
  limit?: number;
}): Promise<KnowledgeHit[]>;

export async function rememberDraftForUser(input: {
  userId: string;
  draft: WorkspaceDraftRecord;
}): Promise<void>;
```

The implementation hides:

- embedding creation
- Zvec connection and path resolution
- metadata filters
- global platform-rule inclusion
- duplicate handling by `draft.id`
- logging and failure swallowing

### `app/lib/knowledge/prompt-context.ts`

Formats retrieved knowledge into a short prompt block. This keeps `prompt-builder.ts` from learning Zvec concepts.

```ts
export function formatKnowledgeContext(hits: KnowledgeHit[]): string;
```

### `scripts/seed-zvec.mjs`

Seeds global platform rules into Zvec. It should be safe to run more than once by using stable ids such as:

- `platform_rule_twitter_v1`
- `platform_rule_linkedin_v1`
- `platform_rule_xiaohongshu_v1`

## Data Model

### Platform Rule

Stored as global knowledge:

```json
{
  "id": "platform_rule_xiaohongshu_v1",
  "kind": "platform_rule",
  "text": "小红书笔记标题不超过 20 字，正文偏真人分享，弱营销感...",
  "metadata": {
    "scope": "global",
    "platform": "xiaohongshu"
  }
}
```

### Saved Example

Stored when a user saves a draft:

```json
{
  "id": "draft_<draftId>",
  "kind": "saved_example",
  "text": "<selected generated result content>",
  "metadata": {
    "scope": "user",
    "userId": "<session.user.id>",
    "platform": "xiaohongshu",
    "draftId": "<draft.id>"
  }
}
```

### Style Memory

Optional first-version record derived from saved draft fields:

```json
{
  "id": "style:<userId>:<draftId>",
  "kind": "style_memory",
  "text": "用户偏好: 更像创始人发言; 语气: casual; 平台: linkedin",
  "metadata": {
    "scope": "user",
    "userId": "<session.user.id>",
    "platform": "linkedin",
    "draftId": "<draft.id>"
  }
}
```

## Generation Flow

1. Browser sends text or URL to `/api/repurpose`.
2. Route authenticates with `getAuthSession`.
3. Workflow resolves the final source content:
   - text mode uses trimmed text
   - URL mode uses existing extraction
4. Before model generation, workflow calls `searchKnowledgeForUser` with:
   - `userId` from session
   - target platform
   - source content plus custom instruction as query text
   - `limit: 5`
5. Knowledge module embeds the query and searches Zvec with:
   - global platform rules for the selected platform
   - user memories where `metadata.userId === session.user.id`
6. Prompt builder receives a formatted knowledge context block.
7. Model generates JSON exactly as it does today.
8. The route returns generation results.

## Draft Save Flow

1. Browser saves a draft through `/api/drafts`.
2. Route authenticates with `getAuthSession`.
3. `saveDraftForUser` writes the draft to MySQL.
4. After MySQL save succeeds, `/api/drafts` calls `rememberDraftForUser`.
5. Zvec write failures are logged but do not fail the draft save response.

This keeps MySQL as the authoritative store. Zvec is a retrieval index, not the system of record.

## Prompt Design

`buildRepurposeUserPrompt` should accept one optional string:

```ts
knowledgeContext?: string;
```

When present, the prompt includes a compact block before platform-specific generation instructions:

```text
可参考的历史记忆和平台规则：
---
1. [platform_rule] ...
2. [saved_example] ...
---

这些内容只用于补充风格、结构和平台适配；不得覆盖原文事实、JSON 输出要求或平台硬性规则。
```

Keep the block short. The first version should cap it by item count and formatted character length.

## Security And Isolation

- Never accept `userId` from the browser for knowledge search or writes.
- Always derive `userId` from `getAuthSession`.
- User records must include `metadata.scope = "user"` and `metadata.userId`.
- Global records must include `metadata.scope = "global"` and no user-specific content.
- `searchKnowledgeForUser` must apply the account filter inside the module, not at each caller.
- Zvec files must not be committed.

Recommended local ignored path:

```text
.data/zvec/
```

## Deployment

### Local Development

- Store Zvec files under `.data/zvec`.
- Add `.data/zvec/` to `.gitignore`.
- Run `npm run seed:zvec` after the database path is configured.

### AWS Production Follow-Up

- Run Zvec in the same ECS task as the ReContent Next.js app.
- Mount EFS into the container for persistent Zvec files.
- Keep RDS MySQL for users, sessions, and drafts.
- Optionally back up the Zvec directory to S3.

Do not expose Zvec over the public internet. All access goes through authenticated ReContent server routes.

## Environment Variables

```text
ZVEC_DATA_DIR=/app/.data/zvec
ZVEC_ENABLED=true
OPENAI_API_KEY=<existing or embedding-capable provider key>
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

If `ZVEC_ENABLED` is absent or false, the knowledge module should return no hits and skip writes.

## Testing Scope

- `searchKnowledgeForUser` filters out records for other users.
- Knowledge retrieval failure returns `[]` and does not fail generation.
- `buildRepurposeUserPrompt` includes the knowledge block only when provided.
- `/api/drafts` still returns a saved draft if Zvec write fails.
- Seed script can run twice without duplicating platform rules.

## Acceptance Criteria

- Generation works exactly as today when Zvec is disabled.
- Generation uses up to 5 relevant memories when Zvec is enabled.
- Saved drafts are indexed after MySQL save succeeds.
- One user's memories never appear in another user's retrieval results.
- No new UI is required for the first version.
- No MySQL migration is required for the first version.
