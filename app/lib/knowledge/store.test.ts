import { afterEach, describe, expect, it, vi } from "vitest";

const { embeddingCreateMock, existsSyncMock, querySyncMock, upsertSyncMock } = vi.hoisted(() => ({
  embeddingCreateMock: vi.fn(),
  existsSyncMock: vi.fn(),
  querySyncMock: vi.fn(),
  upsertSyncMock: vi.fn()
}));

vi.mock("openai", () => ({
  default: vi.fn(
    class {
      embeddings = {
        create: embeddingCreateMock
      };
    }
  )
}));

vi.mock("@zvec/zvec", () => ({
  ZVecCollectionSchema: vi.fn(),
  ZVecCreateAndOpen: vi.fn(() => ({
    querySync: querySyncMock,
    upsertSync: upsertSyncMock
  })),
  ZVecOpen: vi.fn(() => ({
    querySync: querySyncMock,
    upsertSync: upsertSyncMock
  })),
  ZVecDataType: {
    STRING: 2,
    VECTOR_FP32: 23
  }
}));

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock
}));

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("knowledge store", () => {
  it("returns no hits when Zvec is disabled", async () => {
    const { searchKnowledgeForUser } = await import("./store");

    const hits = await searchKnowledgeForUser({
      userId: "user-1",
      platform: "twitter",
      query: "source",
      limit: 5
    });

    expect(hits).toEqual([]);
    expect(querySyncMock).not.toHaveBeenCalled();
  });

  it("searches global platform rules and authenticated user memories", async () => {
    vi.stubEnv("ZVEC_ENABLED", "true");
    vi.stubEnv("ZVEC_DATA_DIR", ".data/zvec-test");
    vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
    embeddingCreateMock.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }]
    });
    querySyncMock.mockReturnValue([
      {
        id: "draft-1",
        score: 0.8,
        fields: {
          kind: "saved_example",
          text: "Saved result",
          scope: "user",
          user_id: "user-1",
          platform: "twitter",
          draft_id: "draft-1"
        }
      },
      {
        id: "wrong-user",
        score: 0.99,
        fields: {
          kind: "saved_example",
          text: "Other user result",
          scope: "user",
          user_id: "user-2",
          platform: "twitter"
        }
      }
    ]);

    const { searchKnowledgeForUser } = await import("./store");
    const hits = await searchKnowledgeForUser({
      userId: "user-1",
      platform: "twitter",
      query: "source",
      limit: 5
    });

    expect(querySyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldName: "embedding",
        topk: 5,
        filter: 'scope = "global" and platform = "twitter"'
      })
    );
    expect(hits).toEqual([
      {
        id: "draft-1",
        kind: "saved_example",
        text: "Saved result",
        score: 0.8,
        metadata: {
          scope: "user",
          userId: "user-1",
          platform: "twitter",
          draftId: "draft-1"
        }
      }
    ]);
  });

  it("keeps the platform rule before user memories", async () => {
    vi.stubEnv("ZVEC_ENABLED", "true");
    vi.stubEnv("ZVEC_DATA_DIR", ".data/zvec-test");
    vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
    embeddingCreateMock.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }]
    });
    querySyncMock
      .mockReturnValueOnce([
        {
          id: "platform_rule_twitter_v1",
          score: 0.3,
          fields: {
            kind: "platform_rule",
            text: "Twitter rule",
            scope: "global",
            platform: "twitter"
          }
        }
      ])
      .mockReturnValueOnce([
        ...Array.from({ length: 5 }, (_, index) => ({
          id: `draft-${index + 1}`,
          score: 0.9 - index * 0.01,
          fields: {
            kind: "saved_example",
            text: `Saved result ${index + 1}`,
            scope: "user",
            user_id: "user-1",
            platform: "twitter",
            draft_id: `draft-${index + 1}`
          }
        }))
      ]);

    const { searchKnowledgeForUser } = await import("./store");
    const hits = await searchKnowledgeForUser({
      userId: "user-1",
      platform: "twitter",
      query: "source",
      limit: 5
    });

    expect(hits).toHaveLength(5);
    expect(hits[0]).toMatchObject({
      id: "platform_rule_twitter_v1",
      kind: "platform_rule",
      text: "Twitter rule"
    });
    expect(hits.map(hit => hit.id)).toContain("draft-1");
  });

  it("opens an existing Zvec collection instead of trying to create it again", async () => {
    vi.stubEnv("ZVEC_ENABLED", "true");
    vi.stubEnv("ZVEC_DATA_DIR", ".data/zvec-test");
    vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
    existsSyncMock.mockReturnValue(true);
    embeddingCreateMock.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }]
    });
    querySyncMock.mockReturnValue([]);

    const zvec = await import("@zvec/zvec");
    const { searchKnowledgeForUser } = await import("./store");
    await searchKnowledgeForUser({
      userId: "user-1",
      platform: "twitter",
      query: "source"
    });

    expect(zvec.ZVecOpen).toHaveBeenCalledWith(".data/zvec-test/recontent_knowledge");
    expect(zvec.ZVecCreateAndOpen).not.toHaveBeenCalled();
  });

  it("indexes saved draft results when enabled", async () => {
    vi.stubEnv("ZVEC_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
    embeddingCreateMock.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }]
    });

    const { rememberDraftForUser } = await import("./store");
    await rememberDraftForUser({
      userId: "user-1",
      draft: {
        id: "draft-1",
        name: "Draft",
        inputMode: "text",
        sourceText: "source",
        sourceUrl: "",
        selectedPlatform: "twitter",
        tone: "neutral",
        customInstruction: "more direct",
        results: [{ platform: "twitter", content: "Saved result" }],
        activePlatform: "twitter",
        createdAt: "2026-09-03T00:00:00.000Z",
        updatedAt: "2026-09-03T00:00:00.000Z"
      }
    });

    expect(upsertSyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "draft_draft-1",
        fields: expect.objectContaining({
          kind: "saved_example",
          text: "Saved result",
          scope: "user",
          user_id: "user-1",
          platform: "twitter",
          draft_id: "draft-1"
        })
      })
    );
  });
});
