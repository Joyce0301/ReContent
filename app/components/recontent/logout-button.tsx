"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="poster-button-ghost min-h-11 rounded-[18px] px-3.5 py-2 text-xs font-bold uppercase tracking-[0.06em]"
      onClick={() => {
        startTransition(async () => {
          await fetch("/api/auth/logout", { method: "POST" });

          router.push("/auth");
          router.refresh();
        });
      }}
    >
      {isPending ? "退出中…" : "退出登录"}
    </button>
  );
}
