// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { pushMock, refreshMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock
  })
}));

import { RecontentHeader } from "./header";

describe("RecontentHeader profile link", () => {
  const user = {
    id: "internal-user-id",
    email: "joyce@example.com",
    displayName: "Joyce",
    avatarKey: null,
    avatarStatus: "not_uploaded" as const,
    avatarUpdatedAt: null
  };

  afterEach(() => {
    cleanup();
    pushMock.mockReset();
    refreshMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("links the user identity to the profile page", () => {
    render(<RecontentHeader user={user} />);

    const profileLink = screen.getByRole("link", {
      name: "查看 Joyce 的个人资料"
    });

    expect(profileLink.getAttribute("href")).toBe("/profile");
    expect(profileLink.classList.contains("min-h-11")).toBe(true);
    expect(profileLink.textContent).toContain("Joyce");
    expect(profileLink.textContent).toContain("joyce@example.com");
  });

  it("keeps the logout button outside the profile link", () => {
    render(<RecontentHeader user={user} />);

    const profileLink = screen.getByRole("link", {
      name: "查看 Joyce 的个人资料"
    });
    const logoutButton = screen.getByRole("button", { name: "退出登录" });

    expect(profileLink.contains(logoutButton)).toBe(false);
    expect(logoutButton.closest("a")).toBeNull();
  });

  it("logs out and redirects to the auth page", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<RecontentHeader user={user} />);
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
        method: "POST"
      });
      expect(pushMock).toHaveBeenCalledWith("/auth");
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("redirects after logout when session cleanup returns a non-OK response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    render(<RecontentHeader user={user} />);
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
        method: "POST"
      });
      expect(pushMock).toHaveBeenCalledWith("/auth");
      expect(refreshMock).toHaveBeenCalled();
    });
  });
});
