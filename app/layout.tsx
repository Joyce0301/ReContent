import type { ReactNode } from "react";
import {
  DM_Sans,
  Oswald,
  Space_Mono
} from "next/font/google";
import "./globals.css";

export const metadata = {
  title: "ReContent — AI 内容重制平台",
  description: "将一篇长内容自动重制为适配多个平台的高质量短内容。"
};

const displayFont = Oswald({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-display"
});

const bodyFont = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-body"
});

const monoFont = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-label"
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body
        className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable} min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
