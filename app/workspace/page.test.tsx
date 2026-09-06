import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthSessionMock, redirectMock, WorkspaceClientMock } = vi.hoisted(
  () => ({
    getAuthSessionMock: vi.fn(),
    redirectMock: vi.fn(),
    WorkspaceClientMock: vi.fn()
  })
);

vi.mock("../lib/auth/session", () => ({
  getAuthSession: getAuthSessionMock
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("./workspace-client", () => ({
  default: WorkspaceClientMock
}));

import WorkspacePage from "./page";

describe("WorkspacePage client boundary", () => {
  beforeEach(() => {
    getAuthSessionMock.mockReset();
    redirectMock.mockReset();
    WorkspaceClientMock.mockReset();
  });

  it("still requires authentication before rendering the redesigned workspace", async () => {
    getAuthSessionMock.mockResolvedValue(null);
    redirectMock.mockImplementation(() => { throw new Error("redirect"); });
    await expect(WorkspacePage()).rejects.toThrow("redirect");
    expect(redirectMock).toHaveBeenCalledWith("/auth");
    expect(WorkspaceClientMock).not.toHaveBeenCalled();
  });

  it("passes only presentation-safe user fields to WorkspaceClient", async () => {
    getAuthSessionMock.mockResolvedValue({
      user: {
        id: "INTERNAL-USER-ID-SENTINEL",
        email: "joyce@example.com",
        displayName: "Joyce",
        avatarKey: "PRIVATE-AVATAR-KEY-SENTINEL",
        avatarStatus: "ready",
        avatarUpdatedAt: "PRIVATE-AVATAR-UPDATED-AT-SENTINEL"
      },
      expiresAt: "2026-08-09T08:30:00.000Z"
    });

    const result = (await WorkspacePage()) as ReactElement<{
      user: Record<string, unknown>;
    }>;

    expect(result.type).toBe(WorkspaceClientMock);
    expect(result.props.user).toEqual({
      displayName: "Joyce",
      email: "joyce@example.com"
    });
    expect(result.props.user).not.toHaveProperty("id");
    expect(result.props.user).not.toHaveProperty("avatarKey");
    expect(result.props.user).not.toHaveProperty("avatarStatus");
    expect(result.props.user).not.toHaveProperty("avatarUpdatedAt");
    expect(JSON.stringify(result.props)).not.toContain(
      "PRIVATE-AVATAR-KEY-SENTINEL"
    );
    expect(JSON.stringify(result.props)).not.toContain(
      "PRIVATE-AVATAR-UPDATED-AT-SENTINEL"
    );
  });
});
