import "server-only";

import OpenAI from "openai";
import { existsSync } from "node:fs";
import path from "node:path";
import type { PlatformKey } from "../../api/repurpose/workflow";
import type { WorkspaceDraftRecord } from "../drafts/types";
import type { KnowledgeHit, KnowledgeKind, KnowledgeScope } from "./types";
import zvecSchema from "./zvec-schema.json";

const DEFAULT_LIMIT = 5;
const DEFAULT_DATA_DIR = ".data/zvec";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

type ZvecCollection = {
  querySync(params: {
    fieldName: string;
    vector: number[];
    topk: number;
    filter: string;
    outputFields: string[];
    includeVector: boolean;
  }): Array<{ id: string; score: number; fields?: Record<string, unknown> }>;
  upsertSync(doc: {
    id: string;
    vectors: { embedding: number[] };
    fields: Record<string, string>;
  }): unknown;
};

let collection: ZvecCollection | null = null;
let openai: OpenAI | null = null;

export async function searchKnowledgeForUser(input: {
  userId: string;
  platform: PlatformKey;
  query: string;
  limit?: number;
}): Promise<KnowledgeHit[]> {
  if (!isEnabled() || !input.query.trim()) {
    return [];
  }

  try {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const vector = await embed(input.query);
    const collection = await getCollection();
    const globalDocs = collection.querySync({
      fieldName: zvecSchema.vector.name,
      vector,
      topk: limit,
      filter: buildGlobalKnowledgeFilter(input.platform),
      outputFields: ["kind", "text", "scope", "user_id", "platform", "draft_id"],
      includeVector: false
    });
    const userDocs = collection.querySync({
      fieldName: zvecSchema.vector.name,
      vector,
      topk: limit,
      filter: buildUserOnlyKnowledgeFilter(input.userId, input.platform),
      outputFields: ["kind", "text", "scope", "user_id", "platform", "draft_id"],
      includeVector: false
    });

    return uniqueDocs([...globalDocs, ...userDocs])
      .map(doc => toKnowledgeHit(doc))
      .filter((hit): hit is KnowledgeHit => Boolean(hit))
      .filter(hit => canUserSeeHit(hit, input.userId, input.platform))
      .slice(0, limit);
  } catch (error) {
    console.warn("knowledge search skipped", error);
    return [];
  }
}

export async function rememberDraftForUser(input: {
  userId: string;
  draft: WorkspaceDraftRecord;
}): Promise<void> {
  if (!isEnabled()) {
    return;
  }

  const targetPlatform = input.draft.activePlatform ?? input.draft.selectedPlatform;
  const result = input.draft.results.find(item => item.platform === targetPlatform);

  if (!result) {
    return;
  }

  const text = result.content.trim();

  if (!text) {
    return;
  }

  try {
    const vector = await embed(text);
    (await getCollection()).upsertSync({
      id: `draft_${input.draft.id}`,
      vectors: { embedding: vector },
      fields: {
        kind: "saved_example",
        text,
        scope: "user",
        user_id: input.userId,
        platform: result.platform,
        draft_id: input.draft.id
      }
    });
  } catch (error) {
    console.warn("knowledge write skipped", error);
  }
}

export function buildUserKnowledgeFilter(userId: string, platform: PlatformKey) {
  return `(${buildGlobalKnowledgeFilter(platform)}) or (${buildUserOnlyKnowledgeFilter(userId, platform)})`;
}

function buildGlobalKnowledgeFilter(platform: PlatformKey) {
  return `scope = "global" and platform = "${escapeFilterString(platform)}"`;
}

function buildUserOnlyKnowledgeFilter(userId: string, platform: PlatformKey) {
  const safeUserId = escapeFilterString(userId);
  const safePlatform = escapeFilterString(platform);
  return `scope = "user" and user_id = "${safeUserId}" and platform = "${safePlatform}"`;
}

function isEnabled() {
  return process.env.ZVEC_ENABLED === "true";
}

async function embed(text: string) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for Zvec embeddings.");
  }

  openai ??= new OpenAI({ apiKey });
  const response = await openai.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
    input: text
  });
  const embedding = response.data[0]?.embedding;

  if (!embedding) {
    throw new Error("Embedding response did not include a vector.");
  }

  return embedding;
}

async function getCollection() {
  if (collection) {
    return collection;
  }

  const zvec = await import("@zvec/zvec");
  const schema = new zvec.ZVecCollectionSchema({
    name: zvecSchema.collectionName,
    vectors: {
      name: zvecSchema.vector.name,
      dataType: zvec.ZVecDataType.VECTOR_FP32,
      dimension: Number(process.env.OPENAI_EMBEDDING_DIMENSION || zvecSchema.vector.dimension)
    },
    fields: zvecSchema.fields.map(name => ({
      name,
      dataType: zvec.ZVecDataType.STRING,
      nullable: name === "user_id" || name === "draft_id"
    }))
  });

  const collectionPath = path.join(
    process.env.ZVEC_DATA_DIR || DEFAULT_DATA_DIR,
    zvecSchema.collectionName
  );
  collection = existsSync(collectionPath)
    ? zvec.ZVecOpen(collectionPath)
    : zvec.ZVecCreateAndOpen(collectionPath, schema);
  return collection;
}

function toKnowledgeHit(doc: {
  id: string;
  score: number;
  fields?: Record<string, unknown>;
}): KnowledgeHit | null {
  const fields = doc.fields ?? {};
  const kind = asKind(fields.kind);
  const scope = asScope(fields.scope);
  const text = typeof fields.text === "string" ? fields.text : "";
  const platform = asPlatform(fields.platform);

  if (!kind || !scope || !text || !platform) {
    return null;
  }

  return {
    id: doc.id,
    kind,
    text,
    score: doc.score,
    metadata: {
      scope,
      userId: typeof fields.user_id === "string" ? fields.user_id : undefined,
      platform,
      draftId: typeof fields.draft_id === "string" ? fields.draft_id : undefined
    }
  };
}

function uniqueDocs(
  docs: Array<{ id: string; score: number; fields?: Record<string, unknown> }>
) {
  const seen = new Set<string>();
  return docs.filter(doc => {
    if (seen.has(doc.id)) {
      return false;
    }
    seen.add(doc.id);
    return true;
  });
}

function canUserSeeHit(hit: KnowledgeHit, userId: string, platform: PlatformKey) {
  if (hit.metadata.platform !== platform) {
    return false;
  }

  if (hit.metadata.scope === "global") {
    return true;
  }

  return hit.metadata.userId === userId;
}

function asKind(value: unknown): KnowledgeKind | null {
  return value === "platform_rule" || value === "style_memory" || value === "saved_example"
    ? value
    : null;
}

function asScope(value: unknown): KnowledgeScope | null {
  return value === "global" || value === "user" ? value : null;
}

function asPlatform(value: unknown): PlatformKey | null {
  return value === "twitter" || value === "linkedin" || value === "xiaohongshu"
    ? value
    : null;
}

function escapeFilterString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
