import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthSessionMock, listDraftsByUserIdMock, saveDraftForUserMock } = vi.hoisted(
  () => ({
    getAuthSessionMock: vi.fn(),
    listDraftsByUserIdMock: vi.fn(),
    saveDraftForUserMock: vi.fn()
  })
);

vi.mock("../../lib/auth/session", () => ({
  getAuthSession: getAuthSessionMock,
  isAuthServiceError: () => false
}));

vi.mock("../../lib/drafts/store", () => ({
  listDraftsByUserId: listDraftsByUserIdMock,
  saveDraftForUser: saveDraftForUserMock
}));

import { GET, POST } from "./route";

beforeEach(() => {
  getAuthSessionMock.mockResolvedValue({
    user: {
      id: "user-1",
      email: "joyce@example.com",
      displayName: "Joyce"
    },
    expiresAt: "2026-08-16T08:00:00.000Z"
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("/api/drafts", () => {
  it("lists drafts for the authenticated user", async () => {
    listDraftsByUserIdMock.mockResolvedValue([
      { id: "draft-1", name: "Draft", updatedAt: "2026-08-16T08:00:00.000Z" }
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(listDraftsByUserIdMock).toHaveBeenCalledWith("user-1");
    expect(data.drafts).toHaveLength(1);
  });

  it("returns 401 when listing drafts without a session", async () => {
    getAuthSessionMock.mockResolvedValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("saves a validated draft snapshot", async () => {
    saveDraftForUserMock.mockResolvedValue({
      id: "draft-1",
      name: "Draft"
    });

    const response = await POST(
      new Request("http://localhost/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputMode: "text",
          sourceText: "Draft body",
          sourceUrl: "",
          selectedPlatform: "twitter",
          tone: "neutral",
          customInstruction: "",
          results: [],
          activePlatform: null
        })
      })
    );

    expect(response.status).toBe(200);
    expect(saveDraftForUserMock).toHaveBeenCalledWith({
      draftId: undefined,
      userId: "user-1",
      snapshot: {
        inputMode: "text",
        sourceText: "Draft body",
        sourceUrl: "",
        selectedPlatform: "twitter",
        tone: "neutral",
        customInstruction: "",
        results: [],
        activePlatform: null
      }
    });
  });

  it("accepts a new draft save without sending draftId", async () => {
    saveDraftForUserMock.mockResolvedValue({
      id: "draft-2",
      name: "Draft"
    });

    const response = await POST(
      new Request("http://localhost/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputMode: "text",
          sourceText: "New draft body",
          sourceUrl: "",
          selectedPlatform: "twitter",
          tone: "neutral",
          customInstruction: "",
          results: [],
          activePlatform: null
        })
      })
    );

    expect(response.status).toBe(200);
    expect(saveDraftForUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: undefined })
    );
  });

  it("rejects malformed draft payloads", async () => {
    const response = await POST(
      new Request("http://localhost/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputMode: "text",
          sourceText: "Draft body",
          sourceUrl: "",
          selectedPlatform: "twitter",
          tone: "neutral",
          customInstruction: "",
          results: [{ platform: "bad", content: "x" }]
        })
      })
    );

    expect(response.status).toBe(400);
    expect(saveDraftForUserMock).not.toHaveBeenCalled();
  });

  it("rejects an overlong source url before hitting storage", async () => {
    const response = await POST(
      new Request("http://localhost/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputMode: "url",
          sourceText: "",
          sourceUrl: `https://example.com/${"a".repeat(2050)}`,
          selectedPlatform: "twitter",
          tone: "neutral",
          customInstruction: "",
          results: [],
          activePlatform: null
        })
      })
    );

    expect(response.status).toBe(400);
    expect(saveDraftForUserMock).not.toHaveBeenCalled();
  });
});
