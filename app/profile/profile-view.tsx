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
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-5 py-6 sm:px-8 sm:py-10 lg:px-12">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/90 pb-5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
            ReContent Account
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            个人资料
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/workspace"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-200 bg-white/80 px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          >
            返回内容工作区
          </Link>
          <LogoutButton />
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <article className="rounded-[32px] border border-slate-200/80 bg-white/88 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)] sm:p-8">
          <div className="flex flex-col items-start gap-5">
            <AvatarUploadControl
              avatarInitial={avatarInitial}
              initialStatus={avatarStatus}
            />
            <div className="min-w-0 max-w-full">
              <h2 className="break-words text-xl font-semibold text-slate-950">
                {displayName}
              </h2>
              <p className="mt-1 break-all text-sm text-slate-500">{email}</p>
            </div>
          </div>
        </article>

        <article className="rounded-[32px] border border-slate-200/80 bg-white/88 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)] sm:p-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-sky-600">
            Account Details
          </p>
          <dl className="mt-6 divide-y divide-slate-200/80">
            <div className="grid gap-2 py-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <dt className="text-sm font-medium text-slate-500">显示名称</dt>
              <dd className="break-words text-sm font-medium text-slate-950">
                {displayName}
              </dd>
            </div>
            <div className="grid gap-2 py-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <dt className="text-sm font-medium text-slate-500">登录邮箱</dt>
              <dd className="break-all text-sm font-medium text-slate-950">
                {email}
              </dd>
            </div>
            <div className="grid gap-2 py-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <dt className="text-sm font-medium text-slate-500">
                登录会话有效期
              </dt>
              <dd className="text-sm font-medium text-slate-950">
                {formatSessionExpiry(expiresAt)}
              </dd>
            </div>
          </dl>
        </article>
      </section>
    </main>
  );
}
