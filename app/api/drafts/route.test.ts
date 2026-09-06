import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthStorageUnavailableError } from "../../lib/auth/errors";

const {
  getAuthSessionMock,
  listDraftsByUserIdMock,
  saveDraftForUserMock,
  rememberDraftForUserMock
} = vi.hoisted(
  () => ({
    getAuthSessionMock: vi.fn(),
    listDraftsByUserIdMock: vi.fn(),
    saveDraftForUserMock: vi.fn(),
    rememberDraftForUserMock: vi.fn()
  })
);

vi.mock("../../lib/auth/session", () => ({
  getAuthSession: getAuthSessionMock,
  isAuthServiceError: (error: unknown) => error instanceof AuthStorageUnavailableError
}));

vi.mock("../../lib/drafts/store", () => ({
  listDraftsByUserId: listDraftsByUserIdMock,
  saveDraftForUser: saveDraftForUserMock
}));

vi.mock("../../lib/knowledge/store", () => ({
  rememberDraftForUser: rememberDraftForUserMock
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
  rememberDraftForUserMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe("/api/drafts", () => {
  it.each(["list", "save"])("logs safe diagnostics when draft %s storage fails", async operation => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new AuthStorageUnavailableError("Database failed", {
      cause: { code: "ER_NO_SUCH_TABLE", errno: 1146, sql: "private draft content", sqlMessage: "private database details" }
    });
    listDraftsByUserIdMock.mockRejectedValue(error);
    saveDraftForUserMock.mockRejectedValue(error);

    const response = operation === "list" ? await GET() : await POST(new Request("http://localhost/api/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputMode: "text", sourceText: "private draft content", sourceUrl: "", selectedPlatform: "twitter", tone: "neutral", customInstruction: "", results: [], activePlatform: null })
    }));

    expect(response.status).toBe(503);
    expect(log).toHaveBeenCalledExactlyOnceWith("draft storage unavailable", {
      operation, name: "AuthStorageUnavailableError", code: "ER_NO_SUCH_TABLE", errno: 1146
    });
    const exposed = JSON.stringify([log.mock.calls, await response.json()]);
    expect(exposed).not.toContain("private draft content");
    expect(exposed).not.toContain("private database details");
  });

  it("lists drafts for the authenticated user", async () => {
    listDraftsByUserIdMock.mockResolvedValue([
      { id: "draft-1", name: "Draft", updatedAt: "2026-08-16T08:00:00.000Z" }
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(listDraftsByUserIdMock).toHaveBeenCalledWith("user-1", 0);
    expect(data.drafts).toHaveLength(1);
    expect(data.nextOffset).toBeNull();
  });

  it("paginates personal history without accepting a client-supplied user id", async () => {
    listDraftsByUserIdMock.mockResolvedValue(Array.from({ length: 21 }, (_, i) => ({ id: `draft-${i}` })));
    const response = await GET(new Request("http://localhost/api/drafts?offset=20&userId=someone-else"));
    const data = await response.json();
    expect(listDraftsByUserIdMock).toHaveBeenCalledWith("user-1", 20);
    expect(data.drafts).toHaveLength(20);
    expect(data.nextOffset).toBe(40);
  });

  it.each(["-1", "1.5", "no", "Infinity", "9007199254740992"])("rejects invalid history offset %s", async offset => {
    const response = await GET(new Request(`http://localhost/api/drafts?offset=${offset}`));
    expect(response.status).toBe(400);
    expect(listDraftsByUserIdMock).not.toHaveBeenCalled();
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
          userId: "another-user",
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
    expect(rememberDraftForUserMock).toHaveBeenCalledWith({
      userId: "user-1",
      draft: {
        id: "draft-1",
        name: "Draft"
      }
    });
  });

  it("still saves the draft response when knowledge indexing is skipped", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    saveDraftForUserMock.mockResolvedValue({
      id: "draft-1",
      name: "Draft"
    });
    rememberDraftForUserMock.mockResolvedValue(undefined);

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
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does not wait for knowledge indexing before returning the saved draft", async () => {
    saveDraftForUserMock.mockResolvedValue({
      id: "draft-1",
      name: "Draft"
    });
    rememberDraftForUserMock.mockImplementation(() => new Promise(() => {}));

    const responseOrTimeout = await Promise.race([
      POST(
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
      ),
      new Promise<"timeout">(resolve => setTimeout(() => resolve("timeout"), 50))
    ]);

    expect(responseOrTimeout).not.toBe("timeout");
    expect((responseOrTimeout as Response).status).toBe(200);
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
