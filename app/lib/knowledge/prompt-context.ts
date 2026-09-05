import type { KnowledgeHit } from "./types";

const MAX_CONTEXT_HITS = 5;
const MAX_HIT_TEXT_LENGTH = 800;
const MAX_CONTEXT_LENGTH = 2000;

export function formatKnowledgeContext(hits: KnowledgeHit[]) {
  const context = hits
    .filter(hit => hit.text.trim().length > 0)
    .slice(0, MAX_CONTEXT_HITS)
    .map((hit, index) => `${index + 1}. [${hit.kind}] ${trim(hit.text, MAX_HIT_TEXT_LENGTH)}`)
    .join("\n");

  return truncate(context, MAX_CONTEXT_LENGTH);
}

function trim(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return truncate(normalized, maxLength);
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength - 3).trimEnd()}...`;
}
