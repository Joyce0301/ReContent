import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthConfigurationError } from "./errors";

const {
  cookiesMock,
  deleteExpiredSessionsMock,
  deleteSessionRecordByIdMock,
  findSessionRecordByIdMock,
  findUserByIdMock
} = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  deleteExpiredSessionsMock: vi.fn(),
  deleteSessionRecordByIdMock: vi.fn(),
  findSessionRecordByIdMock: vi.fn(),
  findUserByIdMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock
}));

vi.mock("./session-store", () => ({
  createSessionRecord: vi.fn(),
  deleteExpiredSessions: deleteExpiredSessionsMock,
  deleteSessionRecordById: deleteSessionRecordByIdMock,
  findSessionRecordById: findSessionRecordByIdMock
}));

vi.mock("./user-store", () => ({
  findUserById: findUserByIdMock
}));

import {
  buildAuthSession,
  createSessionToken,
  getAuthSession,
  verifySessionToken
} from "./session";

describe("session helpers", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
    deleteExpiredSessionsMock.mockReset();
    deleteSessionRecordByIdMock.mockReset();
    findSessionRecordByIdMock.mockReset();
    findUserByIdMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates and verifies a signed session token", () => {
    vi.stubEnv("AUTH_SESSION_SECRET", "test-session-secret");

    const token = createSessionToken(
      buildAuthSession("session-1")
    );
    expect(verifySessionToken(token)?.sessionId).toBe("session-1");
  });

  it("rejects a tampered token", () => {
    vi.stubEnv("AUTH_SESSION_SECRET", "test-session-secret");

    const token = createSessionToken(buildAuthSession("session-1"));
    const [payload] = token.split(".");
    const tampered = `${payload}.broken-signature`;

    expect(verifySessionToken(tampered)).toBeNull();
  });

  it("throws when production session secret is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SESSION_SECRET", "");

    expect(() => createSessionToken(buildAuthSession("session-1"))).toThrow(
      AuthConfigurationError
    );
  });

  it("passes mapped avatar metadata through to session.user", async () => {
    vi.stubEnv("AUTH_SESSION_SECRET", "test-session-secret");
    const payload = buildAuthSession("session-1");
    const token = createSessionToken(payload);

    cookiesMock.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: token })
    });
    deleteExpiredSessionsMock.mockResolvedValue(undefined);
    findSessionRecordByIdMock.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      expiresAt: payload.expiresAt,
      createdAt: "2026-07-26T08:00:00.000Z"
    });
    findUserByIdMock.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      passwordHash: "hashed-password",
      displayName: "Example User",
      avatarKey: "avatars/user-1/source.png",
      avatarStatus: "ready",
      avatarUpdatedAt: "2026-07-26T08:09:10.000Z",
      createdAt: "2026-07-20T01:02:03.000Z"
    });

    await expect(getAuthSession()).resolves.toEqual({
      user: {
        id: "user-1",
        email: "user@example.com",
        displayName: "Example User",
        avatarKey: "avatars/user-1/source.png",
        avatarStatus: "ready",
        avatarUpdatedAt: "2026-07-26T08:09:10.000Z"
      },
      expiresAt: payload.expiresAt
    });
  });
});
