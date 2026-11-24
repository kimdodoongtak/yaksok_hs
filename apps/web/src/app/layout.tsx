import localFont from "next/font/local";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const nanumRound = localFont({
  src: [
    { path: "./fonts/NanumSquareRoundR.woff2", weight: "400", style: "normal" },
    { path: "./fonts/NanumSquareRoundB.woff2", weight: "700", style: "normal" },
    { path: "./fonts/NanumSquareRoundEB.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-nanum-square-round",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "약속 잡기 도우미",
  description: "함께 만날 시간을 정하는 약속 잡기 도우미입니다.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className={nanumRound.variable}>{children}</body>
    </html>
  );
}
