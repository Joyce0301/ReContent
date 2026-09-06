import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "ReContent — AI 内容重制平台",
  description: "将一篇长内容自动重制为适配多个平台的高质量短内容。"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
