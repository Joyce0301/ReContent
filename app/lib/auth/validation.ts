const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asOptionalString(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function normalizeEmail(email: unknown) {
  return asOptionalString(email).trim().toLowerCase();
}

export function normalizeDisplayName(displayName: unknown, email: string) {
  const trimmed = asOptionalString(displayName).trim();

  if (trimmed.length > 0) {
    return trimmed;
  }

  return email.split("@")[0] ?? "Creator";
}

export function validateRegistrationInput(input: {
  email?: unknown;
  password?: unknown;
  displayName?: unknown;
}) {
  const email = normalizeEmail(input.email ?? "");
  const password = asOptionalString(input.password);
  const displayName = asOptionalString(input.displayName).trim();

  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false as const, error: "请输入有效的邮箱地址" };
  }

  if (password.length < 8) {
    return { ok: false as const, error: "密码至少需要 8 位字符" };
  }

  if (password.length > 72) {
    return { ok: false as const, error: "密码过长，请控制在 72 位以内" };
  }

  if (displayName.length > 40) {
    return { ok: false as const, error: "显示名称请控制在 40 个字符以内" };
  }

  return {
    ok: true as const,
    value: {
      email,
      password,
      displayName: normalizeDisplayName(displayName, email)
    }
  };
}

export function validateLoginInput(input: {
  email?: unknown;
  password?: unknown;
}) {
  const email = normalizeEmail(input.email ?? "");
  const password = asOptionalString(input.password);

  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false as const, error: "请输入有效的邮箱地址" };
  }

  if (password.length === 0) {
    return { ok: false as const, error: "请输入密码" };
  }

  return {
    ok: true as const,
    value: {
      email,
      password
    }
  };
}
