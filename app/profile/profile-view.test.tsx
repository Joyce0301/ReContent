// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "../lib/auth/types";

const { AvatarUploadControlMock } = vi.hoisted(() => ({
  AvatarUploadControlMock: vi.fn(
    ({
      avatarInitial,
      initialStatus
    }: {
      avatarInitial: string;
      initialStatus: string;
    }) => (
      <div data-avatar-initial={avatarInitial} data-initial-status={initialStatus}>
        Avatar upload control
      </div>
    )
  )
}));

vi.mock("../components/recontent/logout-button", () => ({
  LogoutButton: () => <button type="button">退出登录</button>
}));

vi.mock("./avatar-upload-control", () => ({
  AvatarUploadControl: AvatarUploadControlMock
}));

import { ProfileView } from "./profile-view";

const baseSession: AuthSession = {
  user: {
    id: "INTERNAL-USER-ID-SENTINEL",
    email: "joyce@example.com",
    displayName: "Joyce",
    avatarKey: "PRIVATE-AVATAR-KEY-SENTINEL",
    avatarStatus: "not_uploaded",
    avatarUpdatedAt: "PRIVATE-AVATAR-UPDATED-AT-SENTINEL"
  },
  expiresAt: "2026-08-09T08:30:00.000Z"
};

describe("ProfileView", () => {
  beforeEach(() => {
    AvatarUploadControlMock.mockClear();
  });

  afterEach(cleanup);

  it("renders account details and workspace navigation", () => {
    render(<ProfileView session={baseSession} />);

    expect(screen.getByRole("heading", { name: "个人资料" })).toBeTruthy();
    expect(screen.getAllByText("Joyce")).toHaveLength(2);
    expect(screen.getAllByText("joyce@example.com")).toHaveLength(2);
    expect(screen.getByText("登录会话有效期")).toBeTruthy();
    expect(screen.getByText("2026年8月9日 16:30")).toBeTruthy();
    expect(screen.getByText("Avatar upload control")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "返回内容工作区" }).getAttribute("href")
    ).toBe("/workspace");
    expect(screen.getByRole("button", { name: "退出登录" })).toBeTruthy();
  });

  it("uses stable fallback text when the expiry cannot be formatted", () => {
    render(
      <ProfileView
        session={{
          ...baseSession,
          expiresAt: "not-a-date"
        }}
      />
    );

    expect(screen.getByText("暂时无法读取")).toBeTruthy();
  });

  it("passes only the avatar initial and status to the client control", () => {
    const sessionWithSecrets = {
      ...baseSession,
      sessionId: "SESSION-ID-SENTINEL",
      token: "SIGNED-TOKEN-SENTINEL",
      cookie: "COOKIE-VALUE-SENTINEL"
    } as AuthSession & {
      sessionId: string;
      token: string;
      cookie: string;
    };

    render(<ProfileView session={sessionWithSecrets} />);

    expect(AvatarUploadControlMock).toHaveBeenCalledTimes(1);
    expect(AvatarUploadControlMock.mock.calls[0]?.[0]).toEqual({
      avatarInitial: "J",
      initialStatus: "not_uploaded"
    });

    const renderedText = document.body.textContent ?? "";

    expect(renderedText).not.toContain("INTERNAL-USER-ID-SENTINEL");
    expect(renderedText).not.toContain("PRIVATE-AVATAR-KEY-SENTINEL");
    expect(renderedText).not.toContain("PRIVATE-AVATAR-UPDATED-AT-SENTINEL");
    expect(renderedText).not.toContain("SESSION-ID-SENTINEL");
    expect(renderedText).not.toContain("SIGNED-TOKEN-SENTINEL");
    expect(renderedText).not.toContain("COOKIE-VALUE-SENTINEL");
  });
});
