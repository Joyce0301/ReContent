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
    eyebrow: "Return to flow",
    title: "Welcome back to your content desk.",
    description:
      "登录后继续你的内容重制工作台，保留更稳定的生成节奏和个人化创作偏好。",
    submitLabel: "登录并进入工作台",
    switchLabel: "还没有账号？",
    switchAction: "创建一个新账号"
  },
  register: {
    eyebrow: "Create access",
    title: "Set up a calm, high-focus creative workspace.",
    description:
      "注册后即可进入你的专属工作台，用同一套创作桌面管理内容输入、风格和平台输出。",
    submitLabel: "注册并开始使用",
    switchLabel: "已经有账号了？",
    switchAction: "直接登录"
  }
};

const TRUST_POINTS = [
  "服务端签名会话，不把登录状态暴露在前端脚本里",
  "密码经过哈希处理后再存储，为后续接数据库预留结构",
  "登录后自动进入专属工作台，后面可平滑升级为 OAuth / 邮箱登录"
];

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
    <main className="auth-canvas relative isolate min-h-screen overflow-hidden">
      <div className="auth-grid absolute inset-0 opacity-70" />
      <div className="auth-orb auth-orb-one" />
      <div className="auth-orb auth-orb-two" />
      <div className="auth-orb auth-orb-three" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1440px] flex-col justify-center px-5 py-6 sm:px-8 sm:py-8 lg:px-12">
        <section className="grid items-stretch gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
          <div className="flex flex-col justify-between rounded-[36px] border border-white/12 bg-[linear-gradient(145deg,rgba(8,15,28,0.88)_0%,rgba(10,26,49,0.78)_52%,rgba(12,34,63,0.7)_100%)] p-7 text-white shadow-[0_40px_120px_rgba(2,6,23,0.38)] backdrop-blur-xl sm:p-9">
            <div className="space-y-7">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/6 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-100/80">
                <span className="inline-flex h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.8)]" />
                Luminous Current
              </div>

              <div className="space-y-4">
                <p className="max-w-xl text-[13px] uppercase tracking-[0.32em] text-sky-100/60">
                  ReContent Authentication
                </p>
                <h1 className="max-w-2xl font-['Avenir_Next','Segoe_UI',sans-serif] text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
                  A refined gateway for focused content work.
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-slate-200/76 sm:text-[15px]">
                  登录不是一个插曲，而是进入创作桌面的第一道节奏。让身份、输入和生成都在一块更安静、更可信的界面里发生。
                </p>
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                ["Signed session", "服务端签名 cookie，避免把敏感状态交给前端脚本。"],
                ["Fluid motion", "背景、按钮与表单切换都带有轻缓而明确的动态反馈。"],
                ["Upgrade path", "当前骨架可继续接数据库、OAuth 与正式邮件登录链路。"]
              ].map(([title, description]) => (
                <div
                  key={title}
                  className="rounded-[24px] border border-white/12 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                >
                  <p className="text-[11px] uppercase tracking-[0.18em] text-sky-100/58">
                    {title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-100/82">
                    {description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[36px] border border-white/55 bg-[linear-gradient(180deg,rgba(255,255,255,0.92)_0%,rgba(244,248,255,0.84)_46%,rgba(233,242,255,0.78)_100%)] p-5 shadow-[0_32px_96px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-xl sm:p-7">
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(56,189,248,0.65),transparent)]" />

            <div className="relative space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    {copy.eyebrow}
                  </p>
                  <div className="space-y-2">
                    <h2 className="font-['Iowan_Old_Style','Palatino',serif] text-3xl leading-tight tracking-[-0.03em] text-slate-950">
                      {copy.title}
                    </h2>
                    <p className="max-w-xl text-sm leading-7 text-slate-600">
                      {copy.description}
                    </p>
                  </div>
                </div>

                <div className="inline-flex rounded-full border border-slate-200/80 bg-white/80 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]">
                  {(["login", "register"] as const).map(option => {
                    const isActive = option === mode;

                    return (
                      <button
                        key={option}
                        type="button"
                        className={`rounded-full px-4 py-2 text-xs font-medium transition ${
                          isActive
                            ? "bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.22)]"
                            : "text-slate-500 hover:text-slate-900"
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
                className="grid gap-4 rounded-[28px] border border-white/80 bg-white/72 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                onSubmit={event => {
                  event.preventDefault();
                  handleSubmit();
                }}
              >
                {mode === "register" && (
                  <label className="space-y-2">
                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                      Display name
                    </span>
                    <input
                      aria-label="显示名称"
                      autoComplete="nickname"
                      className="auth-input"
                      placeholder="例如：Joyce / Dylan / Team ReContent"
                      value={displayName}
                      onChange={event => setDisplayName(event.target.value)}
                    />
                  </label>
                )}

                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    Email
                  </span>
                  <input
                    aria-label="邮箱地址"
                    autoComplete="email"
                    className="auth-input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    Password
                  </span>
                  <input
                    aria-label="密码"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    className="auth-input"
                    placeholder={mode === "login" ? "输入你的密码" : "至少 8 位字符"}
                    type="password"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                  />
                </label>

                <button
                  className="auth-cta mt-2"
                  disabled={isPending}
                  type="submit"
                >
                  <span className="auth-cta-core">
                    {isPending ? "正在验证身份…" : copy.submitLabel}
                  </span>
                </button>

                {error && (
                  <div
                    className="rounded-[20px] border border-rose-200/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,241,242,0.92)_100%)] px-4 py-3 text-sm text-rose-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                    role="alert"
                  >
                    {error}
                  </div>
                )}
              </form>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
                <div className="rounded-[24px] border border-slate-200/80 bg-white/66 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Why this flow
                  </p>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                    {TRUST_POINTS.map(point => (
                      <li key={point} className="flex gap-2">
                        <span className="mt-2 inline-flex h-1.5 w-1.5 rounded-full bg-sky-500" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-[24px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.96)_0%,rgba(236,246,255,0.86)_54%,rgba(220,234,254,0.82)_100%)] p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    {copy.switchLabel}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    当前这版会先用可运行的本地账号体系完成闭环，后面可以无缝升级到数据库和第三方登录。
                  </p>
                  <button
                    type="button"
                    className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-slate-900 transition hover:text-sky-600"
                    onClick={() =>
                      setMode(currentMode =>
                        currentMode === "login" ? "register" : "login"
                      )
                    }
                  >
                    {copy.switchAction}
                    <span aria-hidden="true">{"->"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
