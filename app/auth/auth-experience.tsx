"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type AuthMode = "login" | "register";

const AUTH_MODE_COPY: Record<
  AuthMode,
  {
    eyebrow: string;
    title: string;
    description: string;
    submitLabel: string;
    switchLabel: string;
    switchAction: string;
  }
> = {
  login: {
    eyebrow: "Login",
    title: "欢迎回来。",
    description: "继续进入你的 ReContent 工作台。",
    submitLabel: "登录并回到工作台",
    switchLabel: "第一次来？",
    switchAction: "去创建账号"
  },
  register: {
    eyebrow: "Register",
    title: "创建你的账号。",
    description: "注册后即可进入 ReContent。",
    submitLabel: "注册并开始使用",
    switchLabel: "已经有账号？",
    switchAction: "直接登录"
  }
};

export function AuthExperience() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("register");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const copy = AUTH_MODE_COPY[mode];

  const handleSubmit = () => {
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/auth/${mode}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            displayName,
            email,
            password
          })
        });

        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "认证失败，请稍后重试");
        }

        router.push("/workspace");
        router.refresh();
      } catch (submitError) {
        setError(
          submitError instanceof Error ? submitError.message : "认证失败，请稍后重试"
        );
      }
    });
  };

  return (
    <main className="poster-shell min-h-screen">
      <div className="poster-marquee" aria-hidden="true">
        <div className="poster-marquee-track">
          {Array.from({ length: 8 }).map((_, index) => (
            <span key={index}>
              ReContent Auth Show • Content In, Signal Out • Login / Register •
            </span>
          ))}
        </div>
      </div>

      <div className="mx-auto flex min-h-[calc(100vh-56px)] w-full max-w-[1500px] items-center px-5 py-8 sm:px-8 lg:px-12">
        <section className="grid w-full gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]">
          <div className="poster-frame-dark rounded-[34px] p-6 sm:p-8 lg:p-10">
            <div className="flex h-full flex-col justify-between gap-8">
              <div className="space-y-6">
                <div className="poster-pill inline-flex items-center gap-3 rounded-full px-4 py-2 text-[#fff2d0]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f7bf3b]" />
                  <span className="poster-kicker">ReContent</span>
                </div>

                <div className="space-y-4">
                  <p className="poster-kicker text-[#f6d48d]">Auth</p>
                  <h1 className="poster-display max-w-[10ch] text-[4.4rem] text-[#fff3d6] sm:text-[5.6rem] lg:text-[7.2rem]">
                    Enter.
                    <br />
                    Create.
                  </h1>
                  <p className="max-w-2xl text-base leading-8 text-[#f8e7c0]/88">
                    登录或注册后继续使用 ReContent。
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="poster-frame rounded-[34px] bg-[rgba(250,242,218,0.97)] p-5 sm:p-7">
            <div className="space-y-6">
              <div className="flex flex-col gap-5 border-b-2 border-[var(--line)] pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                  <p className="poster-kicker text-[var(--accent-deep)]">
                    {copy.eyebrow}
                  </p>
                  <div className="space-y-2">
                    <h2 className="poster-display max-w-[9ch] text-[3.1rem] text-[var(--ink)] sm:text-[3.8rem]">
                      {mode === "login" ? "Log back in" : "Start your desk"}
                    </h2>
                    <p className="max-w-xl text-sm leading-7 text-[var(--ink-soft)]">
                      {copy.description}
                    </p>
                  </div>
                </div>

                <div
                  className="poster-pill inline-flex rounded-full p-1"
                  role="tablist"
                  aria-label="认证模式切换"
                >
                  {(["login", "register"] as const).map(option => {
                    const isActive = option === mode;

                    return (
                      <button
                        key={option}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-pressed={isActive}
                        className={`rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-[0.08em] ${
                          isActive
                            ? "bg-[var(--ink)] text-[#fff2d0]"
                            : "text-[var(--ink-soft)]"
                        }`}
                        onClick={() => setMode(option)}
                      >
                        {option === "login" ? "登录" : "注册"}
                      </button>
                    );
                  })}
                </div>
              </div>

              <form
                className="grid gap-4"
                onSubmit={event => {
                  event.preventDefault();
                  handleSubmit();
                }}
              >
                {mode === "register" && (
                  <label className="space-y-2">
                    <span className="poster-kicker text-[var(--ink-soft)]">
                      Display name
                    </span>
                    <input
                      aria-label="显示名称"
                      autoComplete="nickname"
                      className="poster-field rounded-[20px]"
                      placeholder="例如 Joyce / Dylan / Team ReContent"
                      value={displayName}
                      onChange={event => setDisplayName(event.target.value)}
                    />
                  </label>
                )}

                <label className="space-y-2">
                  <span className="poster-kicker text-[var(--ink-soft)]">
                    Email
                  </span>
                  <input
                    aria-label="邮箱地址"
                    autoComplete="email"
                    className="poster-field rounded-[20px]"
                    placeholder="you@example.com"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                  />
                </label>

                <label className="space-y-2">
                  <span className="poster-kicker text-[var(--ink-soft)]">
                    Password
                  </span>
                  <input
                    aria-label="密码"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    className="poster-field rounded-[20px]"
                    placeholder={mode === "login" ? "输入你的密码" : "至少 8 位字符"}
                    type="password"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                  />
                </label>

                <button
                  className="poster-button mt-2 min-h-[3.5rem] rounded-[20px] px-5 text-sm font-bold uppercase tracking-[0.08em]"
                  disabled={isPending}
                  type="submit"
                >
                  {isPending ? "正在验证身份…" : copy.submitLabel}
                </button>

                {error ? (
                  <div
                    className="rounded-[20px] border-2 border-[var(--line)] bg-[rgba(142,35,24,0.1)] px-4 py-3 text-sm leading-6 text-[var(--accent-deep)] shadow-[4px_4px_0_rgba(23,18,15,0.92)]"
                    role="alert"
                  >
                    {error}
                  </div>
                ) : null}
              </form>

              <div className="grid gap-4">
                <article className="rounded-[24px] border-2 border-[var(--line)] bg-[var(--accent-deep)] p-4 text-[#fff2d0] shadow-[4px_4px_0_rgba(23,18,15,0.92)]">
                  <p className="poster-kicker text-[#f7d48b]">{copy.switchLabel}</p>
                  <h3 className="poster-display mt-3 text-[2.25rem]">
                    {mode === "login" ? "New here?" : "Welcome back?"}
                  </h3>
                  <button
                    type="button"
                    className="poster-button-ghost mt-5 rounded-[18px] px-4 py-3 text-sm font-bold uppercase tracking-[0.08em]"
                    onClick={() =>
                      setMode(currentMode =>
                        currentMode === "login" ? "register" : "login"
                      )
                    }
                  >
                    {copy.switchAction}
                  </button>
                </article>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
