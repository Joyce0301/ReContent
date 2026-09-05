import type { PlatformKey } from "../../api/repurpose/workflow";

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
    platform?: PlatformKey;
    draftId?: string;
  };
};
