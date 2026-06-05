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
        <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-5 py-6 sm:px-8 sm:py-8 lg:px-12">
          {children}
        </div>
      </body>
    </html>
  );
}
