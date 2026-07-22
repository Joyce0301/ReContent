import { describe, expect, it } from "vitest";
import {
  normalizeDisplayName,
  normalizeEmail,
  validateLoginInput,
  validateRegistrationInput
} from "./validation";

describe("auth validation helpers", () => {
  it("normalizes registration input and falls back displayName from email", () => {
    const result = validateRegistrationInput({
      email: "  Joyce@Example.com ",
      password: "password-123"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.email).toBe("joyce@example.com");
    expect(result.value.displayName).toBe("joyce");
  });

  it("rejects invalid registration input", () => {
    expect(
      validateRegistrationInput({
        email: "not-an-email",
        password: "short"
      })
    ).toEqual({
      ok: false,
      error: "请输入有效的邮箱地址"
    });
  });

  it("validates login input and exposes helpers", () => {
    expect(normalizeEmail("  Test@Example.com  ")).toBe("test@example.com");
    expect(normalizeDisplayName("", "test@example.com")).toBe("test");
    expect(
      validateLoginInput({
        email: "test@example.com",
        password: "password-123"
      })
    ).toEqual({
      ok: true,
      value: {
        email: "test@example.com",
        password: "password-123"
      }
    });
  });
});
