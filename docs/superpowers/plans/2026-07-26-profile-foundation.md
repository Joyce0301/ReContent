# Profile Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a protected `/profile` page that displays the signed-in user's existing account information and make the workspace account identity navigate to it without changing authentication storage or adding avatar infrastructure.

**Architecture:** Keep authentication in the server-only `app/profile/page.tsx` route by reusing `getAuthSession()` and the workspace route's existing error handling. Put account presentation and deterministic session-expiry formatting in a focused `ProfileView` component, while the workspace header exposes only its avatar/name/email subgroup as a profile link and keeps logout as a sibling action.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Vitest, Testing Library

---

## File Map

- Create `app/components/recontent/header.test.tsx`: locks the profile-link and logout DOM boundary.
- Modify `app/components/recontent/header.tsx`: adds the accessible `/profile` identity link.
- Modify `app/components/recontent/logout-button.tsx`: preserves logout behavior while meeting the mobile touch-target requirement.
- Create `app/profile/profile-view.tsx`: renders account information, static avatar placeholder, workspace navigation, and logout.
- Create `app/profile/profile-view.test.tsx`: covers account rendering, expiry fallback, privacy, and the absence of upload controls.
- Create `app/profile/page.tsx`: protects the route with the existing server session flow.
- Create `app/profile/page.test.tsx`: covers valid session, redirect, unavailable storage, and unexpected errors.
- Verify `app/page.test.tsx`: preserves the existing workspace generation behavior.

### Task 1: Make The Workspace Identity A Safe Profile Link

**Files:**
- Create: `app/components/recontent/header.test.tsx`
- Modify: `app/components/recontent/header.tsx`
- Modify: `app/components/recontent/logout-button.tsx`

- [ ] **Step 1: Write the failing header boundary tests**

Create `app/components/recontent/header.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./logout-button", () => ({
  LogoutButton: () => <button type="button">退出登录</button>
}));

import { RecontentHeader } from "./header";

describe("RecontentHeader account navigation", () => {
  const user = {
    id: "internal-user-id",
    email: "joyce@example.com",
    displayName: "Joyce"
  };

  afterEach(cleanup);

  it("links the account identity to the protected profile page", () => {
    render(<RecontentHeader user={user} />);

    const profileLink = screen.getByRole("link", {
      name: "查看 Joyce 的个人资料"
    });

    expect(profileLink.getAttribute("href")).toBe("/profile");
    expect(profileLink.textContent).toContain("Joyce");
    expect(profileLink.textContent).toContain("joyce@example.com");
  });

  it("keeps logout outside the profile link", () => {
    render(<RecontentHeader user={user} />);

    const profileLink = screen.getByRole("link", {
      name: "查看 Joyce 的个人资料"
    });
    const logoutButton = screen.getByRole("button", { name: "退出登录" });

    expect(profileLink.contains(logoutButton)).toBe(false);
    expect(logoutButton.closest("a")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the header test and verify that it fails**

Run:

```bash
npx vitest run app/components/recontent/header.test.tsx
```

Expected: FAIL because the current header does not render a link named
`查看 Joyce 的个人资料`.

- [ ] **Step 3: Implement the identity-only profile link**

Replace `app/components/recontent/header.tsx` with:

```tsx
import Link from "next/link";
import type { AuthSessionUser } from "../../lib/auth/types";
import { LogoutButton } from "./logout-button";

type RecontentHeaderProps = {
  user: AuthSessionUser;
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

      <div className="flex max-w-full items-center gap-2 self-start rounded-full border border-slate-200/85 bg-white/72 p-1.5 pr-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]">
        <Link
          href="/profile"
          aria-label={`查看 ${user.displayName} 的个人资料`}
          className="flex min-w-0 items-center gap-3 rounded-full px-1.5 py-1 transition hover:bg-slate-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(125,211,252,0.95)_0%,rgba(37,99,235,0.86)_58%,rgba(15,23,42,0.92)_100%)] text-sm font-semibold text-white shadow-[0_12px_28px_rgba(37,99,235,0.2)]">
            {user.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 max-w-48">
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
```

- [ ] **Step 4: Give the existing logout action a 44-pixel touch target**

In `app/components/recontent/logout-button.tsx`, change the button class from:

```tsx
className="inline-flex items-center justify-center rounded-full border border-slate-200/90 bg-white/80 px-3.5 py-2 text-xs font-medium text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] transition hover:border-slate-300 hover:text-slate-950"
```

to:

```tsx
className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-200/90 bg-white/80 px-3.5 py-2 text-xs font-medium text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] transition hover:border-slate-300 hover:text-slate-950"
```

Do not change the click handler, pending state, API request, or router behavior.

- [ ] **Step 5: Run the focused header test**

Run:

```bash
npx vitest run app/components/recontent/header.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 6: Run the existing workspace regression test**

Run:

```bash
npx vitest run app/page.test.tsx
```

Expected: all existing workspace tests pass.

- [ ] **Step 7: Record the header checkpoint without committing**

```bash
git status --short
```

Expected: only `app/components/recontent/header.tsx`,
`app/components/recontent/header.test.tsx`, and
`app/components/recontent/logout-button.tsx` are changed. Do not commit yet;
the repository requires independent review and adversarial review before the
first implementation commit.

### Task 2: Build The Account Profile Presentation

**Files:**
- Create: `app/profile/profile-view.test.tsx`
- Create: `app/profile/profile-view.tsx`

- [ ] **Step 1: Write the failing profile presentation tests**

Create `app/profile/profile-view.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "../lib/auth/types";

vi.mock("../components/recontent/logout-button", () => ({
  LogoutButton: () => <button type="button">退出登录</button>
}));

import { ProfileView } from "./profile-view";

const baseSession: AuthSession = {
  user: {
    id: "INTERNAL-USER-ID-SENTINEL",
    email: "joyce@example.com",
    displayName: "Joyce"
  },
  expiresAt: "2026-08-09T08:30:00.000Z"
};

describe("ProfileView", () => {
  afterEach(cleanup);

  it("renders account details and workspace navigation", () => {
    render(<ProfileView session={baseSession} />);

    expect(screen.getByRole("heading", { name: "个人资料" })).toBeTruthy();
    expect(screen.getAllByText("Joyce")).toHaveLength(2);
    expect(screen.getAllByText("joyce@example.com")).toHaveLength(2);
    expect(screen.getByText("登录会话有效期")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "返回内容工作区" }).getAttribute("href")
    ).toBe("/workspace");
    expect(screen.getByRole("button", { name: "退出登录" })).toBeTruthy();
  });

  it("uses stable fallback text when the expiry cannot be formatted", () => {
    render(
      <ProfileView
        session={{
          ...baseSession,
          expiresAt: "not-a-date"
        }}
      />
    );

    expect(screen.getByText("暂时无法读取")).toBeTruthy();
  });

  it("does not render internal session values or avatar upload controls", () => {
    const sessionWithSecrets = {
      ...baseSession,
      sessionId: "SESSION-ID-SENTINEL",
      token: "SIGNED-TOKEN-SENTINEL",
      cookie: "COOKIE-VALUE-SENTINEL"
    } as AuthSession & {
      sessionId: string;
      token: string;
      cookie: string;
    };

    render(<ProfileView session={sessionWithSecrets} />);

    const renderedText = document.body.textContent ?? "";

    expect(renderedText).not.toContain("INTERNAL-USER-ID-SENTINEL");
    expect(renderedText).not.toContain("SESSION-ID-SENTINEL");
    expect(renderedText).not.toContain("SIGNED-TOKEN-SENTINEL");
    expect(renderedText).not.toContain("COOKIE-VALUE-SENTINEL");
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(
      screen.queryByRole("button", { name: /上传|选择头像/ })
    ).toBeNull();
    expect(screen.getByText("头像上传将在下一阶段开放")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the profile presentation test and verify that it fails**

Run:

```bash
npx vitest run app/profile/profile-view.test.tsx
```

Expected: FAIL because `app/profile/profile-view.tsx` does not exist.

- [ ] **Step 3: Implement the profile view and deterministic expiry formatting**

Create `app/profile/profile-view.tsx`:

```tsx
import Link from "next/link";
import type { AuthSession } from "../lib/auth/types";
import { LogoutButton } from "../components/recontent/logout-button";

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
  const { user } = session;
  const avatarInitial = user.displayName.slice(0, 1).toUpperCase();

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
            <div
              aria-label={`${user.displayName} 的头像占位`}
              className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-[radial-gradient(circle_at_30%_30%,rgba(125,211,252,0.96)_0%,rgba(37,99,235,0.88)_58%,rgba(15,23,42,0.94)_100%)] text-3xl font-semibold text-white shadow-[0_18px_48px_rgba(37,99,235,0.24)]"
            >
              {avatarInitial}
            </div>
            <div className="min-w-0 max-w-full">
              <h2 className="break-words text-xl font-semibold text-slate-950">
                {user.displayName}
              </h2>
              <p className="mt-1 break-all text-sm text-slate-500">
                {user.email}
              </p>
            </div>
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-500">
              头像上传将在下一阶段开放
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
                {user.displayName}
              </dd>
            </div>
            <div className="grid gap-2 py-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <dt className="text-sm font-medium text-slate-500">登录邮箱</dt>
              <dd className="break-all text-sm font-medium text-slate-950">
                {user.email}
              </dd>
            </div>
            <div className="grid gap-2 py-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <dt className="text-sm font-medium text-slate-500">
                登录会话有效期
              </dt>
              <dd className="text-sm font-medium text-slate-950">
                {formatSessionExpiry(session.expiresAt)}
              </dd>
            </div>
          </dl>
        </article>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Run the profile presentation tests**

Run:

```bash
npx vitest run app/profile/profile-view.test.tsx
```

Expected: 3 tests pass.

- [ ] **Step 5: Record the profile presentation checkpoint without committing**

```bash
git status --short
```

Expected: the Task 1 files plus `app/profile/profile-view.tsx` and
`app/profile/profile-view.test.tsx` are changed. Do not commit yet.

### Task 3: Protect The Profile Route With The Existing Session Flow

**Files:**
- Create: `app/profile/page.test.tsx`
- Create: `app/profile/page.tsx`

- [ ] **Step 1: Write the failing protected-route tests**

Create `app/profile/page.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthStorageUnavailableError } from "../lib/auth/errors";
import { AuthServiceUnavailable } from "../components/auth/auth-service-unavailable";
import { ProfileView } from "./profile-view";

const { getAuthSessionMock, redirectMock } = vi.hoisted(() => ({
  getAuthSessionMock: vi.fn(),
  redirectMock: vi.fn()
}));

vi.mock("../lib/auth/session", () => ({
  getAuthSession: getAuthSessionMock
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("../components/recontent/logout-button", () => ({
  LogoutButton: () => null
}));

import ProfilePage from "./page";

describe("ProfilePage", () => {
  afterEach(() => {
    getAuthSessionMock.mockReset();
    redirectMock.mockReset();
  });

  it("passes a valid authenticated session to ProfileView", async () => {
    const session = {
      user: {
        id: "user-1",
        email: "joyce@example.com",
        displayName: "Joyce"
      },
      expiresAt: "2026-08-09T08:30:00.000Z"
    };
    getAuthSessionMock.mockResolvedValue(session);

    const result = await ProfilePage();

    expect(result.type).toBe(ProfileView);
    expect(result.props.session).toEqual(session);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects an unauthenticated visitor to auth", async () => {
    getAuthSessionMock.mockResolvedValue(null);
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT:/auth");
    });

    await expect(ProfilePage()).rejects.toThrow("NEXT_REDIRECT:/auth");
    expect(redirectMock).toHaveBeenCalledWith("/auth");
  });

  it("renders the existing unavailable state for auth storage failures", async () => {
    getAuthSessionMock.mockRejectedValue(new AuthStorageUnavailableError());

    const result = await ProfilePage();

    expect(result.type).toBe(AuthServiceUnavailable);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("rethrows unexpected session errors", async () => {
    getAuthSessionMock.mockRejectedValue(new Error("unexpected failure"));

    await expect(ProfilePage()).rejects.toThrow("unexpected failure");
  });
});
```

- [ ] **Step 2: Run the protected-route test and verify that it fails**

Run:

```bash
npx vitest run app/profile/page.test.tsx
```

Expected: FAIL because `app/profile/page.tsx` does not exist.

- [ ] **Step 3: Implement the protected server route**

Create `app/profile/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { AuthServiceUnavailable } from "../components/auth/auth-service-unavailable";
import {
  AuthConfigurationError,
  AuthStorageUnavailableError
} from "../lib/auth/errors";
import { getAuthSession } from "../lib/auth/session";
import { ProfileView } from "./profile-view";

export default async function ProfilePage() {
  let authUnavailable = false;
  let session = null;

  try {
    session = await getAuthSession();
  } catch (error) {
    if (
      error instanceof AuthConfigurationError ||
      error instanceof AuthStorageUnavailableError
    ) {
      authUnavailable = true;
    } else {
      throw error;
    }
  }

  if (authUnavailable) {
    return <AuthServiceUnavailable title="个人资料暂时不可用" />;
  }

  if (!session) {
    redirect("/auth");
  }

  return <ProfileView session={session} />;
}
```

- [ ] **Step 4: Run all new profile and header tests**

Run:

```bash
npx vitest run \
  app/components/recontent/header.test.tsx \
  app/profile/profile-view.test.tsx \
  app/profile/page.test.tsx
```

Expected: 9 tests pass.

- [ ] **Step 5: Record the protected-route checkpoint without committing**

```bash
git status --short
```

Expected: the Task 1 and Task 2 files plus `app/profile/page.tsx` and
`app/profile/page.test.tsx` are changed. Do not commit yet.

### Task 4: Run Full Regression And Production Verification

**Files:**
- Verify only; no planned source changes.

- [ ] **Step 1: Run focused authentication and workspace regression tests**

Run:

```bash
npx vitest run \
  app/components/recontent/header.test.tsx \
  app/profile/profile-view.test.tsx \
  app/profile/page.test.tsx \
  app/page.test.tsx \
  app/lib/auth/*.test.ts \
  app/api/auth/**/*.test.ts \
  app/api/repurpose/*.test.ts
```

Expected: all selected test files pass with zero failures.

- [ ] **Step 2: Run the repository lint check**

Run:

```bash
npm run lint
```

Expected: ESLint exits with code 0.

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected: Next.js compiles successfully and lists `/profile` as a dynamic route.

- [ ] **Step 4: Verify the mobile layout with long account values**

Run the app:

```bash
npm run dev
```

In a browser with a valid local login:

1. Open `/workspace`, set the viewport to 320px wide, and temporarily replace
   the rendered account name with
   `Joyce ReContent Product Operations International` and the rendered email
   with `joyce.product.operations.international@example-company.com` in
   DevTools.
2. Confirm the page has no horizontal scrollbar, the profile identity and
   logout action do not overlap, and both remain keyboard reachable.
3. Open `/profile` at 320px and 375px widths, apply the same temporary text
   replacements, and confirm the account cards, back link, and logout action
   stack without clipping or horizontal overflow.
4. Confirm the back link and logout action each retain a touch target at least
   44px tall.

Expected: no horizontal overflow, overlap, clipped account text, or unreachable
navigation at either viewport width. Stop the development server after the
check.

- [ ] **Step 5: Inspect the final task-only diff**

Run:

```bash
git status --short
git diff --check
git diff --stat
```

Expected:

```text
Exactly the seven planned implementation files are modified or untracked.
No whitespace errors.
The unstaged diff contains only the profile route/view/tests, the header link/test, and the logout touch-target class.
```

- [ ] **Step 6: Request both required independent reviews**

Request:

1. Request an independent code review.
2. Request an independent adversarial review.

Expected: each review separates blocking findings from optional improvements.
Do not commit while either review has unresolved blocking or high-risk findings.

- [ ] **Step 7: Fix findings and repeat the complete verification**

Apply only fixes required for this profile-foundation scope, then repeat:

```bash
npx vitest run \
  app/components/recontent/header.test.tsx \
  app/profile/profile-view.test.tsx \
  app/profile/page.test.tsx \
  app/page.test.tsx \
  app/lib/auth/*.test.ts \
  app/api/auth/**/*.test.ts \
  app/api/repurpose/*.test.ts
npm run lint
npm run build
git diff --check
```

Expected: both reviews accept the corrected change, every selected test passes,
lint exits with code 0, and the production build lists `/profile`.

- [ ] **Step 8: Create the implementation commit after all gates pass**

```bash
git add \
  app/components/recontent/header.tsx \
  app/components/recontent/header.test.tsx \
  app/components/recontent/logout-button.tsx \
  app/profile/profile-view.tsx \
  app/profile/profile-view.test.tsx \
  app/profile/page.tsx \
  app/profile/page.test.tsx
git commit -m "feat: add protected personal profile"
```

Expected: one implementation commit containing only the profile foundation
source and tests. The already committed design and implementation-plan
documents remain separate documentation commits.

- [ ] **Step 9: Push, create the PR, and observe CI/CD**

```bash
git push -u origin codex/profile-foundation
```

Create a PR describing:

- The protected profile route and account information shown.
- The identity-link/logout interaction boundary.
- The explicit absence of avatar upload, S3, Lambda, and schema changes.
- Tests, lint, build, and mobile layout checks completed.

Observe the GitHub and Cloudflare checks until they succeed or produce a
concrete failure. If a current change causes a failure, fix it and repeat the
review and verification gates before committing again.
