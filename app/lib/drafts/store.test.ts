import { afterEach, describe, expect, it, vi } from "vitest";

const { executeMock, queryAllMock, queryOneMock, randomUuidMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  queryAllMock: vi.fn(),
  queryOneMock: vi.fn(),
  randomUuidMock: vi.fn()
}));

vi.mock("../auth/db", () => ({
  execute: executeMock,
  queryAll: queryAllMock,
  queryOne: queryOneMock
}));

vi.mock("node:crypto", () => ({
  randomUUID: randomUuidMock
}));

describe("draft store", () => {
  afterEach(() => {
    executeMock.mockReset();
    queryAllMock.mockReset();
    queryOneMock.mockReset();
    randomUuidMock.mockReset();
  });

  it("lists drafts ordered by the persisted rows", async () => {
    queryAllMock.mockResolvedValue([
      {
        id: "draft-1",
        user_id: "user-1",
        name: "Example draft",
        input_mode: "text",
        source_text: "source body",
        source_url: "",
        selected_platform: "twitter",
        tone: "neutral",
        custom_instruction: "更像创始人发言",
        results_json: '[{"platform":"twitter","content":"result"}]',
        active_platform: "twitter",
        created_at: "2026-08-16 10:00:00",
        updated_at: "2026-08-16 12:00:00"
      }
    ]);

    const { listDraftsByUserId } = await import("./store");

    await expect(listDraftsByUserId("user-1", 20)).resolves.toEqual([
      {
        id: "draft-1",
        name: "Example draft",
        inputMode: "text",
        sourceText: "source body",
        sourceUrl: "",
        selectedPlatform: "twitter",
        tone: "neutral",
        customInstruction: "更像创始人发言",
        results: [{ platform: "twitter", content: "result" }],
        activePlatform: "twitter",
        createdAt: "2026-08-16T10:00:00.000Z",
        updatedAt: "2026-08-16T12:00:00.000Z"
      }
    ]);
    expect(queryAllMock).toHaveBeenCalledWith(expect.stringContaining("WHERE user_id = ?"), ["user-1", 20]);
    expect(queryAllMock.mock.calls[0][0]).toContain("LIMIT 21 OFFSET ?");
  });

  it("uses the generated title for history and scopes updates to the authenticated owner", async () => {
    executeMock.mockResolvedValue([{ affectedRows: 1 }]);
    queryOneMock.mockResolvedValue({
      id: "draft-1", name: "生成的标题", input_mode: "text", source_text: "原文",
      source_url: "", selected_platform: "xiaohongshu", tone: "neutral", custom_instruction: "",
      results_json: "[]", active_platform: "xiaohongshu", created_at: new Date(), updated_at: new Date()
    });
    const { saveDraftForUser } = await import("./store");
    await saveDraftForUser({ draftId: "draft-1", userId: "user-1", snapshot: {
      inputMode: "text", sourceText: "原文", sourceUrl: "", selectedPlatform: "xiaohongshu", tone: "neutral",
      customInstruction: "", results: [{ platform: "xiaohongshu", title: "生成的标题", content: "正文" }], activePlatform: "xiaohongshu"
    } });
    expect(executeMock.mock.calls[0][1][0]).toBe("生成的标题");
    expect(executeMock.mock.calls[0][0]).toContain("WHERE id = ? AND user_id = ?");
    expect(executeMock.mock.calls[0][1].slice(-2)).toEqual(["draft-1", "user-1"]);
  });

  it("creates a new draft when no matching draft exists", async () => {
    randomUuidMock.mockReturnValue("draft-new");
    executeMock.mockResolvedValueOnce([{ affectedRows: 0 }]);
    executeMock.mockResolvedValueOnce([{ affectedRows: 1 }]);
    queryOneMock.mockResolvedValue({
      id: "draft-new",
      user_id: "user-1",
      name: "A draft headline",
      input_mode: "text",
      source_text: "A draft headline",
      source_url: "",
      selected_platform: "linkedin",
      tone: "formal",
      custom_instruction: "",
      results_json: "[]",
      active_platform: null,
      created_at: "2026-08-16 10:00:00",
      updated_at: "2026-08-16 10:00:00"
    });

    const { saveDraftForUser } = await import("./store");

    const saved = await saveDraftForUser({
      userId: "user-1",
      snapshot: {
        inputMode: "text",
        sourceText: "A draft headline",
        sourceUrl: "",
        selectedPlatform: "linkedin",
        tone: "formal",
        customInstruction: "",
        results: [],
        activePlatform: null
      }
    });

    expect(saved.id).toBe("draft-new");
    expect(executeMock).toHaveBeenCalledTimes(2);
    expect(String(executeMock.mock.calls[1]?.[0])).toContain("INSERT INTO drafts");
  });

  it("updates an existing draft and derives a readable URL-based name", async () => {
    executeMock.mockResolvedValueOnce([{ affectedRows: 1 }]);
    queryOneMock.mockResolvedValue({
      id: "draft-9",
      user_id: "user-1",
      name: "example.com / article",
      input_mode: "url",
      source_text: "",
      source_url: "https://example.com/article",
      selected_platform: "twitter",
      tone: "neutral",
      custom_instruction: "",
      results_json: "[]",
      active_platform: "twitter",
      created_at: "2026-08-16 10:00:00",
      updated_at: "2026-08-16 10:05:00"
    });

    const { saveDraftForUser } = await import("./store");

    const saved = await saveDraftForUser({
      draftId: "draft-9",
      userId: "user-1",
      snapshot: {
        inputMode: "url",
        sourceText: "",
        sourceUrl: "https://example.com/article",
        selectedPlatform: "twitter",
        tone: "neutral",
        customInstruction: "",
        results: [],
        activePlatform: "twitter"
      }
    });

    expect(saved.name).toBe("example.com / article");
    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(String(executeMock.mock.calls[0]?.[0])).toContain("UPDATE drafts");
    expect(executeMock.mock.calls[0]?.[1]?.[0]).toBe("example.com / article");
  });

  it("creates a fresh draft id when an update target is missing", async () => {
    randomUuidMock.mockReturnValueOnce("draft-recreated");
    executeMock.mockResolvedValueOnce([{ affectedRows: 0 }]);
    executeMock.mockResolvedValueOnce([{ affectedRows: 1 }]);
    queryOneMock.mockResolvedValue({
      id: "draft-recreated",
      user_id: "user-1",
      name: "Recovered draft",
      input_mode: "text",
      source_text: "Recovered draft",
      source_url: "",
      selected_platform: "twitter",
      tone: "neutral",
      custom_instruction: "",
      results_json: "[]",
      active_platform: null,
      created_at: "2026-08-16 10:00:00",
      updated_at: "2026-08-16 10:00:00"
    });

    const { saveDraftForUser } = await import("./store");

    const saved = await saveDraftForUser({
      draftId: "draft-original",
      userId: "user-1",
      snapshot: {
        inputMode: "text",
        sourceText: "Recovered draft",
        sourceUrl: "",
        selectedPlatform: "twitter",
        tone: "neutral",
        customInstruction: "",
        results: [],
        activePlatform: null
      }
    });

    expect(saved.id).toBe("draft-recreated");
    expect(executeMock).toHaveBeenCalledTimes(2);
    expect(executeMock.mock.calls[1]?.[1]?.[0]).toBe("draft-recreated");
    expect(queryOneMock).toHaveBeenCalledWith(expect.any(String), [
      "draft-recreated",
      "user-1"
    ]);
  });
});
