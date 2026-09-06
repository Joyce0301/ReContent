import Link from "next/link";
import type { ReactNode } from "react";

import { LogoutButton } from "./logout-button";

export type RecontentHeaderUser = {
  displayName: string;
  email: string;
};

type RecontentHeaderProps = {
  user: RecontentHeaderUser;
  children?: ReactNode;
};

export function RecontentHeader({ user, children }: RecontentHeaderProps) {
  return (
    <header className="site-header">
      <Link href="/" className="wordmark" aria-label="ReContent 首页">
        recontent.
      </Link>
      {children}
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
