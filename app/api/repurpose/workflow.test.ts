import { afterEach, describe, expect, it, vi } from "vitest";

type WorkflowModule = typeof import("./workflow");
const { searchKnowledgeForUserMock } = vi.hoisted(() => ({
  searchKnowledgeForUserMock: vi.fn()
}));

vi.mock("../../lib/knowledge/store", () => ({
  searchKnowledgeForUser: searchKnowledgeForUserMock
}));

vi.mock("../../lib/knowledge/prompt-context", () => ({
  formatKnowledgeContext: () => "1. [saved_example] Founder-style post"
}));

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.doUnmock("./kimi-client");
  vi.doUnmock("./content-extraction");
});

async function loadWorkflowModule(): Promise<WorkflowModule> {
  return import("./workflow");
}

async function loadWorkflowModuleWithKimi(
  createJsonCompletion: ReturnType<typeof vi.fn>
): Promise<WorkflowModule> {
  vi.resetModules();
  vi.stubEnv("KIMI_API_KEY", "kimi-test-key");
  vi.doMock("./kimi-client", () => ({
    createKimiClient: () => ({ createJsonCompletion })
  }));

  return import("./workflow");
}

async function loadWorkflowModuleWithExtractionMock(
  extractContentFromUrlWithDiagnostics: ReturnType<typeof vi.fn>
): Promise<WorkflowModule> {
  vi.resetModules();
  vi.doMock("./content-extraction", async () => {
    const actual = await vi.importActual<typeof import("./content-extraction")>(
      "./content-extraction"
    );

    return {
      ...actual,
      extractContentFromUrlWithDiagnostics
    };
  });

  return import("./workflow");
}

describe("runRepurposeWorkflow", () => {
  it("throws a workflow extraction error and keeps diagnostics when URL extraction fails", async () => {
    const extractionMock = vi.fn().mockResolvedValue({
      content: null,
      diagnostics: {
        url: "https://example.com/fail-post",
        normalizedUrl: "https://example.com/fail-post",
        finalOutcome: "failure",
        attempts: [
          {
            source: "site_specific",
            outcome: "skipped",
            failureReason: "unsupported_site"
          },
          {
            source: "html",
            outcome: "failed",
            failureReason: "timeout"
          }
        ]
      }
    });

    const { runRepurposeWorkflow, UrlExtractionWorkflowError } =
      await loadWorkflowModuleWithExtractionMock(extractionMock);

    await expect(
      runRepurposeWorkflow({
        mode: "url",
        url: "https://example.com/fail-post",
        platform: "twitter",
        tone: "neutral"
      })
    ).rejects.toBeInstanceOf(UrlExtractionWorkflowError);

    try {
      await runRepurposeWorkflow({
        mode: "url",
        url: "https://example.com/fail-post",
        platform: "twitter",
        tone: "neutral"
      });
    } catch (error) {
      expect(error).toBeInstanceOf(UrlExtractionWorkflowError);
      expect((error as InstanceType<typeof UrlExtractionWorkflowError>).diagnostics).toEqual(
        expect.objectContaining({
          finalOutcome: "failure"
        })
      );
    }
  });

  it("owns retry and run trace inside the workflow module", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const createJsonCompletion = vi
      .fn()
      .mockResolvedValueOnce("not-json")
      .mockResolvedValueOnce(
        '{"results":[{"platform":"twitter","content":"workflow success"}]}'
      );

    const { runRepurposeWorkflow } = await loadWorkflowModuleWithKimi(createJsonCompletion);

    const result = await runRepurposeWorkflow({
      mode: "text",
      text: "Valid source text",
      platform: "twitter",
      tone: "neutral",
      customInstruction: "更像创始人发言，但更克制"
    });

    expect(result.results).toEqual([{ platform: "twitter", content: "workflow success" }]);
    expect(createJsonCompletion).toHaveBeenCalledTimes(2);
    expect(infoSpy).toHaveBeenCalledWith(
      "repurpose run",
      expect.stringContaining('"finalMode":"conservative"')
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "repurpose run",
      expect.stringContaining('"failureKind":"invalid_json"')
    );
  });

  it("retrieves user knowledge before building the model prompt", async () => {
    searchKnowledgeForUserMock.mockResolvedValue([
      {
        id: "draft-1",
        kind: "saved_example",
        text: "Founder-style post",
        score: 0.8,
        metadata: {
          scope: "user",
          userId: "user-1",
          platform: "twitter"
        }
      }
    ]);
    const createJsonCompletion = vi
      .fn()
      .mockResolvedValue('{"results":[{"platform":"twitter","content":"ok"}]}');

    const { runRepurposeWorkflow } = await loadWorkflowModuleWithKimi(createJsonCompletion);

    await runRepurposeWorkflow({
      userId: "user-1",
      mode: "text",
      text: "Valid source text",
      platform: "twitter",
      tone: "neutral",
      customInstruction: "更像创始人"
    });

    expect(searchKnowledgeForUserMock).toHaveBeenCalledWith({
      userId: "user-1",
      platform: "twitter",
      query: "Valid source text\n更像创始人",
      limit: 5
    });
    expect(createJsonCompletion.mock.calls[0]?.[0]?.userPrompt).toContain(
      "1. [saved_example] Founder-style post"
    );
  });

  it("uses the current Kimi default model when KIMI_MODEL is not configured", async () => {
    const createJsonCompletion = vi
      .fn()
      .mockResolvedValue('{"results":[{"platform":"twitter","content":"ok"}]}');

    const { runRepurposeWorkflow } = await loadWorkflowModuleWithKimi(createJsonCompletion);

    await runRepurposeWorkflow({
      mode: "text",
      text: "Valid source text",
      platform: "twitter",
      tone: "neutral"
    });

    expect(createJsonCompletion.mock.calls[0]?.[0]?.model).toBe("kimi-k3");
  });

  it("uses Kimi K3's required temperature on normal and conservative attempts", async () => {
    const createJsonCompletion = vi
      .fn()
      .mockResolvedValueOnce("not-json")
      .mockResolvedValueOnce(
        '{"results":[{"platform":"twitter","content":"workflow success"}]}'
      );

    const { runRepurposeWorkflow } = await loadWorkflowModuleWithKimi(createJsonCompletion);

    await runRepurposeWorkflow({
      mode: "text",
      text: "Valid source text",
      platform: "twitter",
      tone: "neutral"
    });

    expect(createJsonCompletion.mock.calls[0]?.[0]?.temperature).toBe(1);
    expect(createJsonCompletion.mock.calls[1]?.[0]?.temperature).toBe(1);
  });
});
