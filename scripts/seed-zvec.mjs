import OpenAI from "openai";
import { existsSync } from "node:fs";
import path from "node:path";
import zvecSchema from "../app/lib/knowledge/zvec-schema.json" with { type: "json" };
import {
  ZVecCollectionSchema,
  ZVecCreateAndOpen,
  ZVecOpen,
  ZVecDataType
} from "@zvec/zvec";

const dataDir = process.env.ZVEC_DATA_DIR || ".data/zvec";
const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const dimension = Number(process.env.OPENAI_EMBEDDING_DIMENSION || zvecSchema.vector.dimension);
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required to seed Zvec.");
}

const rules = [
  {
    id: "platform_rule_twitter_v1",
    platform: "twitter",
    text:
      "Twitter / X: write concise threads, keep each post within 280 characters, preserve the main facts, use light hashtags only when relevant."
  },
  {
    id: "platform_rule_linkedin_v1",
    platform: "linkedin",
    text:
      "LinkedIn: write a structured professional post with a strong opening, clear takeaways, concrete examples, and a light call to action."
  },
  {
    id: "platform_rule_xiaohongshu_v1",
    platform: "xiaohongshu",
    text:
      "小红书：标题不超过 20 字，正文偏真人分享，弱营销感，短段落表达，从具体场景、问题、感受或观察切入，结尾使用 3-5 个强相关标签。"
  }
];

const collectionPath = path.join(dataDir, zvecSchema.collectionName);
const schema = new ZVecCollectionSchema({
  name: zvecSchema.collectionName,
  vectors: {
    name: zvecSchema.vector.name,
    dataType: ZVecDataType.VECTOR_FP32,
    dimension
  },
  fields: zvecSchema.fields.map(name => ({
    name,
    dataType: ZVecDataType.STRING,
    nullable: name === "user_id" || name === "draft_id"
  }))
});
const collection = existsSync(collectionPath)
  ? ZVecOpen(collectionPath)
  : ZVecCreateAndOpen(collectionPath, schema);

const openai = new OpenAI({ apiKey });

for (const rule of rules) {
  const response = await openai.embeddings.create({
    model,
    input: rule.text
  });
  const embedding = response.data[0]?.embedding;

  if (!embedding) {
    throw new Error(`Embedding missing for ${rule.id}`);
  }

  collection.upsertSync({
    id: rule.id,
    vectors: { [zvecSchema.vector.name]: embedding },
    fields: {
      kind: "platform_rule",
      text: rule.text,
      scope: "global",
      user_id: "",
      platform: rule.platform,
      draft_id: ""
    }
  });
}

console.log(`Seeded ${rules.length} Zvec platform rules into ${dataDir}`);
