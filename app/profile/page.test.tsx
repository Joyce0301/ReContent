import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "../lib/auth/types";

const { getAuthSessionMock, redirectMock } = vi.hoisted(() => ({
  getAuthSessionMock: vi.fn(),
  redirectMock: vi.fn()
}));

vi.mock("../lib/auth/session", () => ({
  getAuthSession: getAuthSessionMock
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("../components/recontent/logout-button", () => ({
  LogoutButton: () => null
}));

import { AuthServiceUnavailable } from "../components/auth/auth-service-unavailable";
import { AuthStorageUnavailableError } from "../lib/auth/errors";
import ProfilePage from "./page";
import { ProfileView } from "./profile-view";

const session: AuthSession = {
  user: {
    id: "user-1",
    email: "joyce@example.com",
    displayName: "Joyce",
    avatarKey: null,
    avatarStatus: "not_uploaded",
    avatarUpdatedAt: null
  },
  expiresAt: "2026-08-09T08:30:00.000Z"
};

describe("ProfilePage", () => {
  beforeEach(() => {
    getAuthSessionMock.mockReset();
    redirectMock.mockReset();
  });

  it("returns the profile view for an authenticated session", async () => {
    getAuthSessionMock.mockResolvedValue(session);

    const result = await ProfilePage();

    expect(result.type).toBe(ProfileView);
    expect(result.props.session).toEqual(session);
  });

  it("redirects unauthenticated visitors to the auth page", async () => {
    getAuthSessionMock.mockResolvedValue(null);
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT:/auth");
    });

    await expect(ProfilePage()).rejects.toThrow("NEXT_REDIRECT:/auth");
    expect(redirectMock).toHaveBeenCalledWith("/auth");
  });

  it("returns the unavailable state when auth storage cannot be reached", async () => {
    getAuthSessionMock.mockRejectedValue(new AuthStorageUnavailableError());

    const result = await ProfilePage();

    expect(result.type).toBe(AuthServiceUnavailable);
    expect(result.props.title).toBe("个人资料暂时不可用");
  });

  it("rethrows unexpected authentication errors", async () => {
    const error = new Error("unexpected auth failure");
    getAuthSessionMock.mockRejectedValue(error);

    await expect(ProfilePage()).rejects.toBe(error);
  });
});
