import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthConfigurationError,
  buildAuthSession,
  createSessionToken,
  verifySessionToken
} from "./session";

describe("session helpers", () => {
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
});
