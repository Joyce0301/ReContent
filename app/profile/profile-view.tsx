import Link from "next/link";

import { LogoutButton } from "../components/recontent/logout-button";
import type { AuthSession } from "../lib/auth/types";
import { AvatarUploadControl } from "./avatar-upload-control";

type ProfileViewProps = {
  session: AuthSession;
};

function formatSessionExpiry(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "暂时无法读取";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Shanghai"
  }).format(date);
}

export function ProfileView({ session }: ProfileViewProps) {
  const {
    user: { displayName, email, avatarStatus },
    expiresAt
  } = session;
  const avatarInitial = displayName.slice(0, 1).toUpperCase();

  return (
    <main className="poster-shell mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-5 py-6 sm:px-8 sm:py-10 lg:px-12">
      <header className="poster-frame flex flex-wrap items-center justify-between gap-4 rounded-[30px] px-5 py-5 sm:px-6">
        <div>
          <p className="poster-kicker text-[var(--accent-deep)]">
            ReContent Account
          </p>
          <h1 className="poster-display mt-2 text-[3rem] text-[var(--ink)] sm:text-[4rem]">
            个人资料
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/workspace"
            className="poster-button-ghost min-h-11 rounded-[18px] px-4 text-sm font-bold uppercase tracking-[0.06em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-deep)] focus-visible:ring-offset-2"
          >
            返回内容工作区
          </Link>
          <LogoutButton />
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <article className="poster-frame rounded-[32px] p-6 sm:p-8">
          <div className="flex flex-col items-start gap-5">
            <AvatarUploadControl
              avatarInitial={avatarInitial}
              initialStatus={avatarStatus}
            />
            <div className="min-w-0 max-w-full">
              <h2 className="break-words text-xl font-semibold text-[var(--ink)]">
                {displayName}
              </h2>
              <p className="mt-1 break-all text-sm text-[var(--ink-soft)]">{email}</p>
            </div>
          </div>
        </article>

        <article className="poster-frame rounded-[32px] p-6 sm:p-8">
          <p className="poster-kicker text-[var(--accent-deep)]">
            Account Details
          </p>
          <dl className="mt-6 divide-y-2 divide-[var(--line)]/20">
            <div className="grid gap-2 py-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <dt className="text-sm font-medium text-[var(--ink-soft)]">显示名称</dt>
              <dd className="break-words text-sm font-medium text-[var(--ink)]">
                {displayName}
              </dd>
            </div>
            <div className="grid gap-2 py-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <dt className="text-sm font-medium text-[var(--ink-soft)]">登录邮箱</dt>
              <dd className="break-all text-sm font-medium text-[var(--ink)]">
                {email}
              </dd>
            </div>
            <div className="grid gap-2 py-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <dt className="text-sm font-medium text-[var(--ink-soft)]">
                登录会话有效期
              </dt>
              <dd className="text-sm font-medium text-[var(--ink)]">
                {formatSessionExpiry(expiresAt)}
              </dd>
            </div>
          </dl>
        </article>
      </section>
    </main>
  );
}
