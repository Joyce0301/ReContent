"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import "./auth.css";

type AuthMode = "login" | "register";

export function AuthExperience() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const submitting = useRef(false);
  const isLogin = mode === "login";
  const canSubmit = email.trim().length > 0 && password.length > 0;

  function switchMode(nextMode: AuthMode) {
    if (submitting.current || mode === nextMode) return;
    setMode(nextMode);
    setError(null);
    setPassword("");
    setShowPassword(false);
  }

  function handleSubmit() {
    if (submitting.current || !canSubmit) return;
    submitting.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/auth/${mode}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName, email, password })
        });
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(data.error || "认证失败，请稍后重试");
        router.push("/workspace");
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "认证失败，请稍后重试");
      } finally {
        submitting.current = false;
      }
    });
  }

  return (
    <div className="account-page">
      <header className="account-header">
        <Link href="/" className="account-brand">ReContent 账户</Link>
        <nav aria-label="账户导航">
          <button type="button" aria-current={isLogin ? "page" : undefined} disabled={isPending} onClick={() => switchMode("login")}>登录账户</button>
          <button type="button" aria-current={!isLogin ? "page" : undefined} disabled={isPending} onClick={() => switchMode("register")}>创建账户</button>
        </nav>
      </header>
      <main className="account-main">
        <div className="account-intro">
          <Image src="/branding/recontent-symbol-512.png" alt="" width={104} height={104} priority />
          <h1>{isLogin ? "ReContent 账户" : "创建你的 ReContent 账户"}</h1>
          <p>{isLogin ? "登录你的 ReContent 账户" : "开始你的下一次创作"}</p>
        </div>
        <form className="account-form" aria-label={isLogin ? "账户登录" : "账户注册"} onSubmit={event => { event.preventDefault(); handleSubmit(); }}>
          <fieldset disabled={isPending}>
            <legend className="sr-only">{isLogin ? "登录信息" : "注册信息"}</legend>
            <div className="account-fields">
              {!isLogin && <label className="account-field">
                <span>显示名称 <small>（选填）</small></span>
                <input aria-label="显示名称" name="displayName" autoComplete="nickname" maxLength={40} value={displayName} onChange={event => setDisplayName(event.target.value)} />
              </label>}
              <label className="account-field">
                <span>电子邮件地址</span>
                <input aria-label="邮箱地址" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} />
              </label>
              <div className="account-field account-password">
                <label htmlFor="account-password">密码</label>
                <input
                  id="account-password" aria-label="密码" name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  required minLength={isLogin ? undefined : 8} maxLength={isLogin ? undefined : 72}
                  aria-describedby={!isLogin ? "password-requirements" : undefined}
                  value={password} onChange={event => setPassword(event.target.value)}
                />
                <button type="button" aria-label={showPassword ? "隐藏密码" : "显示密码"} title={showPassword ? "隐藏密码" : "显示密码"} onClick={() => setShowPassword(value => !value)}>
                  {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                </button>
              </div>
            </div>
            {!isLogin && <p className="account-password-hint" id="password-requirements">密码需为 8–72 位字符。</p>}
            {error && <p className="account-error" role="alert">{error}</p>}
            <button className="account-submit" disabled={isPending || !canSubmit} type="submit" aria-label={isPending ? "正在验证身份" : isLogin ? "登录" : "创建 ReContent 账户"}>
              {isPending ? <><LoaderCircle size={17} className="animate-spin" aria-hidden="true" />正在验证身份…</> : isLogin ? "登录" : "创建 ReContent 账户"}
            </button>
          </fieldset>
        </form>
        <p className="account-switch">
          {isLogin ? "还没有 ReContent 账户？" : "已经有 ReContent 账户？"}
          <button type="button" disabled={isPending} onClick={() => switchMode(isLogin ? "register" : "login")}>{isLogin ? "立即创建" : "前往登录"}</button>
        </p>
      </main>
      <footer className="account-footer"><span>ReContent</span><Link href="/">返回首页</Link></footer>
    </div>
  );
}
