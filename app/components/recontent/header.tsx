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
    <header className="poster-frame rounded-[30px] px-5 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-3">
        <p className="poster-kicker text-[var(--accent-deep)]">
          Content Workspace
        </p>
        <h1 className="poster-display text-[3.4rem] text-[var(--ink)] sm:text-[4.4rem]">
          ReContent
        </h1>
        <p className="max-w-2xl text-sm leading-7 text-[var(--ink-soft)]">
          把长内容整理成适合不同平台发布的版本，在一块更张扬、更像创作现场的桌面上完成改写与收束。
        </p>
      </div>

      <div className="poster-pill flex max-w-full items-center gap-3 self-start rounded-[22px] px-3 py-2">
        <Link
          href="/profile"
          aria-label={`查看 ${user.displayName} 的个人资料`}
          className="flex min-h-11 min-w-0 max-w-48 items-center gap-3 rounded-[18px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-deep)] focus-visible:ring-offset-2"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border-2 border-[var(--line)] bg-[var(--accent)] text-sm font-semibold text-[var(--ink)] shadow-[4px_4px_0_rgba(23,18,15,0.86)]">
            {user.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--ink)]">
              {user.displayName}
            </p>
            <p className="truncate text-xs text-[var(--ink-soft)]">{user.email}</p>
          </div>
        </Link>
        <LogoutButton />
      </div>
      </div>
    </header>
  );
}
