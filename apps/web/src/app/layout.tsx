import localFont from "next/font/local";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const noto = localFont({ src: "./fonts/NotoSansKR.woff2", variable: "--font-noto-sans-kr", weight: "100 900", display: "swap", preload: false });

export const metadata: Metadata = {
  title: "약속 잡기 도우미",
  description: "함께 만날 시간을 정하는 약속 잡기 도우미입니다.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className={noto.variable}>{children}</body>
    </html>
  );
}
