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
    <header className="site-header">
      <Link href="/" className="wordmark" aria-label="ReContent 首页">
        recontent.
      </Link>
      <nav className="workspace-nav" aria-label="工作台导航">
        <Link href="/workspace" aria-current="page">
          创作工作台
        </Link>
        <a href="#drafts">我的草稿</a>
        <Link href="/">探索 ReContent</Link>
      </nav>
      <div className="workspace-account">
        <Link
          href="/profile"
          aria-label={`查看 ${user.displayName} 的个人资料`}
          className="flex min-h-11 min-w-0 max-w-48 items-center gap-3"
        >
          <div className="profile-avatar" aria-hidden="true">
            {user.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="profile-identity">
            <strong className="truncate">{user.displayName}</strong>
            <small className="truncate">{user.email}</small>
          </div>
        </Link>
        <LogoutButton />
      </div>
    </header>
  );
}
