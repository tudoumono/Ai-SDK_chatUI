import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";
// エラーロガーを初期化（グローバルハンドラーを設定）
import "@/lib/logging/error-logger";

export const metadata: Metadata = {
  title: "AI SDK Chat UI",
  description:
    "OpenAI Responses API と Vercel AI SDK を活用した RAG 対応チャット UI デモ",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <Providers>{children}</Providers>
        <div className="app-watermark">
          Created by tudo | github.com/tudoumono
        </div>
      </body>
    </html>
  );
}
