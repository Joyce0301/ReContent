import { describe, expect, it, vi } from "vitest";

import { createKimiClient } from "./kimi-client";

describe("createKimiClient", () => {
  it("calls Moonshot chat completions with fetch and returns the assistant content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"results":[{"platform":"twitter","content":"ok"}]}'
              }
            }
          ]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    const client = createKimiClient({
      apiKey: "kimi-test-key",
      fetcher: fetchMock
    });

    const content = await client.createJsonCompletion({
      model: "kimi-k3",
      systemPrompt: "system",
      userPrompt: "user"
    });

    expect(content).toBe('{"results":[{"platform":"twitter","content":"ok"}]}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.moonshot.cn/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer kimi-test-key",
          "Content-Type": "application/json"
        })
      })
    );
  });

  it("surfaces upstream response details when Moonshot returns an error response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "quota exceeded"
          }
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    const client = createKimiClient({
      apiKey: "kimi-test-key",
      fetcher: fetchMock
    });

    await expect(
      client.createJsonCompletion({
        model: "kimi-k3",
        systemPrompt: "system",
        userPrompt: "user"
      })
    ).rejects.toThrow(/Kimi API error \(429\): quota exceeded/);
  });
});
