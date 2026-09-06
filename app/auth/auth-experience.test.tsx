// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthExperience } from "./auth-experience";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("opens in login mode with labeled email and password fields", () => {
  render(<AuthExperience />);
  expect(screen.getByRole("heading", { name: "ReContent 账户", level: 1 })).toBeTruthy();
  expect(screen.queryByLabelText("显示名称")).toBeNull();
  expect(screen.getByLabelText("邮箱地址").getAttribute("type")).toBe("email");
  expect(screen.getByLabelText("密码").getAttribute("autocomplete")).toBe("current-password");
  expect((screen.getByRole("button", { name: "登录", exact: true }) as HTMLButtonElement).disabled).toBe(true);
});

it("logs in through the existing API and redirects to the protected workspace", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetchMock);
  render(<AuthExperience />);
  fireEvent.change(screen.getByLabelText("邮箱地址"), { target: { value: "alex@example.com" } });
  fireEvent.change(screen.getByLabelText("密码"), { target: { value: "correct-password" } });
  fireEvent.click(screen.getByRole("button", { name: "登录", exact: true }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/workspace"));
  expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({
    method: "POST", body: JSON.stringify({ displayName: "", email: "alex@example.com", password: "correct-password" })
  }));
  expect(refresh).toHaveBeenCalled();
});

it("switches to registration, resets the password and submits the display name", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetchMock);
  render(<AuthExperience />);
  fireEvent.change(screen.getByLabelText("密码"), { target: { value: "old-password" } });
  fireEvent.click(screen.getByRole("button", { name: "创建账户", exact: true }));
  expect((screen.getByLabelText("密码") as HTMLInputElement).value).toBe("");
  expect(screen.getByLabelText("密码").getAttribute("autocomplete")).toBe("new-password");
  fireEvent.change(screen.getByLabelText("显示名称"), { target: { value: "Alex" } });
  fireEvent.change(screen.getByLabelText("邮箱地址"), { target: { value: "alex@example.com" } });
  fireEvent.change(screen.getByLabelText("密码"), { target: { value: "new-password" } });
  fireEvent.click(screen.getByRole("button", { name: "创建 ReContent 账户" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/register", expect.objectContaining({
    body: JSON.stringify({ displayName: "Alex", email: "alex@example.com", password: "new-password" })
  })));
});

it("keeps errors visible and clears them when switching modes", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "邮箱或密码错误" }) }));
  render(<AuthExperience />);
  fireEvent.change(screen.getByLabelText("邮箱地址"), { target: { value: "alex@example.com" } });
  fireEvent.change(screen.getByLabelText("密码"), { target: { value: "bad-password" } });
  fireEvent.click(screen.getByRole("button", { name: "登录", exact: true }));
  expect((await screen.findByText("邮箱或密码错误", { selector: ".account-error" })).textContent).toBe("邮箱或密码错误");
  expect(push).not.toHaveBeenCalled();
  await waitFor(() => expect((screen.getByRole("button", { name: "创建账户", exact: true }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "创建账户", exact: true }));
  expect(document.querySelector(".account-error")).toBeNull();
});

it("supports password visibility and blocks duplicate submissions while pending", async () => {
  let finish!: (response: unknown) => void;
  const fetchMock = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetchMock);
  render(<AuthExperience />);
  fireEvent.change(screen.getByLabelText("邮箱地址"), { target: { value: "alex@example.com" } });
  fireEvent.change(screen.getByLabelText("密码"), { target: { value: "test-password" } });
  fireEvent.click(screen.getByRole("button", { name: "显示密码" }));
  expect(screen.getByLabelText("密码").getAttribute("type")).toBe("text");
  fireEvent.click(screen.getByRole("button", { name: "登录", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "正在验证身份" }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect((screen.getByRole("button", { name: "创建账户", exact: true }) as HTMLButtonElement).disabled).toBe(true);
  finish({ ok: true, json: async () => ({}) });
  await waitFor(() => expect(push).toHaveBeenCalled());
});
