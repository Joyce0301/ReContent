type KimiClientOptions = {
  apiKey: string;
  fetcher?: typeof fetch;
};

type KimiCompletionInput = {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
};

type KimiResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
};

const KIMI_BASE_URL = "https://api.moonshot.cn/v1";

export function createKimiClient(options: KimiClientOptions) {
  const fetcher = options.fetcher ?? fetch;

  return {
    async createJsonCompletion(input: KimiCompletionInput): Promise<string> {
      let response: Response;

      try {
        response = await fetcher(`${KIMI_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: input.model,
            messages: [
              { role: "system", content: input.systemPrompt },
              { role: "user", content: input.userPrompt }
            ],
            temperature: input.temperature ?? 0.7,
            response_format: { type: "json_object" }
          })
        });
      } catch (error) {
        throw new Error(`Kimi connection error: ${getErrorMessage(error)}`);
      }

      const rawText = await response.text();
      let payload: KimiResponse | null = null;

      try {
        payload = rawText ? (JSON.parse(rawText) as KimiResponse) : null;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const errorMessage =
          payload?.error?.message || rawText || `HTTP ${response.status}`;
        throw new Error(`Kimi API error (${response.status}): ${errorMessage}`);
      }

      const content = payload?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Kimi 返回为空");
      }

      return content;
    }
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error";
}
