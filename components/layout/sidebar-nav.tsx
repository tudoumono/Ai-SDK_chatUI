"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const NAV_ITEMS = [
  { href: "/welcome", label: "ウェルカム", description: "APIキーと接続設定" },
  { href: "/guide", label: "📖 利用ガイド", description: "使い方とよくある質問" },
  { href: "/dashboard", label: "ダッシュボード", description: "会話とVector Storeの一覧" },
  { href: "/vector-stores", label: "Vector Store", description: "ストアの作成と管理" },
  // { href: "/ingest", label: "Vector Store Management", description: "ファイル登録・編集・検索" },
  { href: "/chat", label: "チャット", description: "RAG & Web検索・トークン表示" },
  { href: "/settings", label: "設定", description: "モデル・プロキシ・履歴" },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="sidebar-nav">
      <div className="sidebar-header">
        <span className="sidebar-title">AI SDK Chat UI</span>
        {/* <span className="sidebar-subtitle">G1〜G5 主要画面</span> */}
      </div>
      <ul className="sidebar-list">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                className={clsx("sidebar-link", active && "sidebar-link-active")}
                href={item.href}
              >
                <span className="sidebar-link-label">{item.label}</span>
                <span className="sidebar-link-description">{item.description}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
