import { beforeEach, expect, it, vi } from "vitest";
import { AuthStorageUnavailableError } from "../../lib/auth/errors";
const mocks = vi.hoisted(() => ({ session: vi.fn(), one: vi.fn(), all: vi.fn(), execute: vi.fn() }));
vi.mock("../../lib/auth/session", () => ({ getAuthSession: mocks.session, isAuthServiceError: (error: unknown) => error instanceof AuthStorageUnavailableError }));
vi.mock("../../lib/auth/db", () => ({ queryOne: mocks.one, queryAll: mocks.all, execute: mocks.execute }));
import { GET, PATCH, POST } from "./route";

const id = "11111111-1111-4111-8111-111111111111";
const brief = { name: "Launch", goal: "Trial signups", audience: "Creators", keyMessage: "Reuse source material", cta: "Try now", sourceText: "Product facts", sourceUrl: "" };
const row = { ...brief, id, createdAt: new Date(), updatedAt: new Date() };
const request = (method: string, body: unknown) => new Request("http://localhost/api/campaigns", { method, body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "owner" } });
  mocks.one.mockResolvedValue(row);
  mocks.all.mockResolvedValue([]);
});

it("scopes create, list, read and update to the signed-in user, ignoring client ownership", async () => {
  expect((await POST(request("POST", { ...brief, userId: "attacker" }))).status).toBe(201);
  expect(mocks.execute.mock.calls[0][1].at(-1)).toBe("owner");
  mocks.all.mockResolvedValue(Array.from({ length: 21 }, () => row));
  const listing = await GET(new Request("http://localhost/api/campaigns?offset=20&userId=attacker"));
  expect(await listing.json()).toMatchObject({ nextOffset: 40, campaigns: expect.any(Array) });
  expect(mocks.all).toHaveBeenCalledWith(expect.stringContaining("WHERE user_id = ?"), ["owner", 20]);
  expect((await GET(new Request("http://localhost/api/campaigns?id=" + id))).status).toBe(200);
  expect(mocks.one).toHaveBeenLastCalledWith(expect.stringContaining("WHERE id = ? AND user_id = ?"), [id, "owner"]);
  expect((await PATCH(request("PATCH", { ...brief, id, userId: "attacker" }))).status).toBe(200);
  expect(mocks.execute).toHaveBeenLastCalledWith(expect.stringContaining("WHERE id = ? AND user_id = ?"), [...Object.values(brief), id, "owner"]);
});

it("does not update or disclose another user's campaign", async () => {
  mocks.one.mockResolvedValue(null);
  expect((await PATCH(request("PATCH", { ...brief, id }))).status).toBe(404);
  expect((await GET(new Request("http://localhost/api/campaigns?id=" + id))).status).toBe(404);
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("requires authentication and rejects malformed requests before storage", async () => {
  for (const payload of [null, [], { ...brief, goal: " " }, { ...brief, name: "x".repeat(101) }, { ...brief, sourceUrl: "javascript:alert(1)" }, { ...brief, sourceUrl: "https://user:password@example.com" }]) {
    expect((await POST(request("POST", payload))).status).toBe(400);
  }
  expect((await PATCH(request("PATCH", { ...brief, id: "invalid" }))).status).toBe(400);
  expect((await GET(new Request("http://localhost/api/campaigns?offset=-1"))).status).toBe(400);
  mocks.session.mockResolvedValue(null);
  expect((await POST(request("POST", brief))).status).toBe(401);
  expect(mocks.execute).not.toHaveBeenCalled();
});
