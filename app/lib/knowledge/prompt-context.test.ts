import { describe, expect, it } from "vitest";

import { formatKnowledgeContext } from "./prompt-context";
import type { KnowledgeHit } from "./types";

describe("formatKnowledgeContext", () => {
  it("formats a small bounded memory block for the prompt", () => {
    const context = formatKnowledgeContext([
      hit("rule-1", "platform_rule", "Use short paragraphs."),
      hit("draft-1", "saved_example", "Founder-style post.")
    ]);

    expect(context).toBe(
      "1. [platform_rule] Use short paragraphs.\n2. [saved_example] Founder-style post."
    );
  });

  it("omits empty text and caps the number of hits", () => {
    const context = formatKnowledgeContext([
      hit("empty", "saved_example", " "),
      hit("1", "saved_example", "one"),
      hit("2", "saved_example", "two"),
      hit("3", "saved_example", "three"),
      hit("4", "saved_example", "four"),
      hit("5", "saved_example", "five"),
      hit("6", "saved_example", "six")
    ]);

    expect(context).toContain("5. [saved_example] five");
    expect(context).not.toContain("six");
    expect(context).not.toContain("empty");
  });

  it("caps the total formatted context length", () => {
    const context = formatKnowledgeContext([
      hit("1", "saved_example", "a".repeat(3000)),
      hit("2", "saved_example", "b".repeat(3000)),
      hit("3", "saved_example", "c".repeat(3000))
    ]);

    expect(context.length).toBeLessThanOrEqual(2000);
    expect(context).toContain("...");
  });
});

function hit(
  id: string,
  kind: KnowledgeHit["kind"],
  text: string
): KnowledgeHit {
  return {
    id,
    kind,
    text,
    score: 0.9,
    metadata: {
      scope: "user",
      userId: "user-1",
      platform: "twitter"
    }
  };
}
