import { describe, expect, it } from "vitest";

import { POST } from "./route";

describe("POST /api/repurpose", () => {
  it("returns 400 when customInstruction exceeds the maximum length", async () => {
    const req = new Request("http://localhost/api/repurpose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "text",
        text: "Valid source text",
        platforms: ["twitter"],
        tone: "neutral",
        customInstruction: "a".repeat(301)
      })
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("个性化要求过长，请精简后重试");
  });
});
