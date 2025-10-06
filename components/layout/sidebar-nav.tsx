"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  HandHeart,
  BookOpen,
  LayoutDashboard,
  Database,
  MessageSquare,
  Settings,
} from "lucide-react";

const NAV_ITEMS = [
  {
    href: "/welcome",
    label: "ウェルカム",
    description: "APIキーと接続設定",
    icon: HandHeart,
  },
  {
    href: "/guide",
    label: "利用ガイド",
    description: "使い方とよくある質問",
    icon: BookOpen,
  },
  {
    href: "/dashboard",
    label: "ダッシュボード",
    description: "会話とVector Storeの一覧",
    icon: LayoutDashboard,
  },
  {
    href: "/vector-stores",
    label: "Vector Store",
    description: "ストアの作成と管理",
    icon: Database,
  },
  {
    href: "/chat",
    label: "チャット",
    description: "RAG & Web検索・トークン表示",
    icon: MessageSquare,
  },
  {
    href: "/settings",
    label: "設定",
    description: "モデル・プロキシ・履歴",
    icon: Settings,
  },
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
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                className={clsx("sidebar-link", active && "sidebar-link-active")}
                href={item.href}
              >
                <div className="sidebar-link-content">
                  <Icon className="sidebar-link-icon" size={20} strokeWidth={2} />
                  <div className="sidebar-link-text">
                    <span className="sidebar-link-label">{item.label}</span>
                    <span className="sidebar-link-description">{item.description}</span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
