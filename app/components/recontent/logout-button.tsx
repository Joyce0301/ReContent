"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="inline-flex items-center justify-center rounded-full border border-slate-200/90 bg-white/80 px-3.5 py-2 text-xs font-medium text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] transition hover:border-slate-300 hover:text-slate-950"
      onClick={() => {
        startTransition(async () => {
          const response = await fetch("/api/auth/logout", { method: "POST" });

          if (!response.ok) {
            return;
          }

          router.push("/auth");
          router.refresh();
        });
      }}
    >
      {isPending ? "退出中…" : "退出登录"}
    </button>
  );
}
