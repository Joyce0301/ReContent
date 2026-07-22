import { NextResponse } from "next/server";
import { clearCurrentSession, clearSessionCookie } from "../../../lib/auth/session";

export async function POST() {
  let cleanupFailed = false;

  try {
    await clearCurrentSession();
  } catch (error) {
    cleanupFailed = true;
    console.error("logout session cleanup failed", error);
  }

  const response = cleanupFailed
    ? NextResponse.json(
        { error: "会话退出未完全完成，请稍后重试" },
        { status: 503 }
      )
    : NextResponse.json({ ok: true });

  clearSessionCookie(response);
  return response;
}
