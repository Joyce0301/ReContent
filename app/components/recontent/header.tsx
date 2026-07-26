import Link from "next/link";

import { LogoutButton } from "./logout-button";

export type RecontentHeaderUser = {
  displayName: string;
  email: string;
};

type RecontentHeaderProps = {
  user: RecontentHeaderUser;
};

export function RecontentHeader({ user }: RecontentHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-slate-200/90 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
          Content Workspace
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
          ReContent
        </h1>
        <p className="max-w-2xl text-sm leading-7 text-slate-500">
          把长内容整理成适合不同平台发布的版本，在一块更安静、也更适合阅读的桌面上完成改写与收束。
        </p>
      </div>

      <div className="flex max-w-full items-center gap-3 self-start rounded-full border border-slate-200/85 bg-white/72 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]">
        <Link
          href="/profile"
          aria-label={`查看 ${user.displayName} 的个人资料`}
          className="flex min-h-11 min-w-0 max-w-48 items-center gap-3 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(125,211,252,0.95)_0%,rgba(37,99,235,0.86)_58%,rgba(15,23,42,0.92)_100%)] text-sm font-semibold text-white shadow-[0_12px_28px_rgba(37,99,235,0.2)]">
            {user.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              {user.displayName}
            </p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
        </Link>
        <LogoutButton />
      </div>
    </header>
  );
}
