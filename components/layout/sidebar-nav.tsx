"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  HandHeart,
  BookOpen,
  LayoutDashboard,
  Database,
  MessageSquare,
  Settings,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import {
  FEATURE_RESTRICTIONS_EVENT,
  FEATURE_RESTRICTIONS_STORAGE_KEY,
  loadFeatureRestrictions,
  type FeatureRestrictions,
} from "@/lib/settings/feature-restrictions";

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
  const { theme, toggleTheme } = useTheme();
  const [featureRestrictions, setFeatureRestrictions] = useState<FeatureRestrictions>(() => loadFeatureRestrictions());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleUpdate = () => {
      setFeatureRestrictions(loadFeatureRestrictions());
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === FEATURE_RESTRICTIONS_STORAGE_KEY || event.key === `${FEATURE_RESTRICTIONS_STORAGE_KEY}:managed-by-secure-config`) {
        handleUpdate();
      }
    };

    window.addEventListener(FEATURE_RESTRICTIONS_EVENT, handleUpdate);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(FEATURE_RESTRICTIONS_EVENT, handleUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const filteredNavItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => {
      if (item.href === "/vector-stores") {
        return featureRestrictions.allowVectorStore;
      }
      return true;
    });
  }, [featureRestrictions.allowVectorStore]);

  return (
    <nav className="sidebar-nav">
      <div className="sidebar-header">
        <span className="sidebar-title">AI SDK Chat UI</span>
        {/* <span className="sidebar-subtitle">G1〜G5 主要画面</span> */}
      </div>
      <ul className="sidebar-list">
        {filteredNavItems.map((item) => {
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
      <div className="sidebar-footer">
        <button
          className="sidebar-theme-toggle"
          onClick={toggleTheme}
          title="テーマを切り替え"
        >
          <div className="sidebar-theme-icons">
            <Sun
              className={clsx("sidebar-theme-icon", theme === "light" && "sidebar-theme-icon-active")}
              size={18}
              strokeWidth={2}
            />
            <Moon
              className={clsx("sidebar-theme-icon", theme === "dark" && "sidebar-theme-icon-active")}
              size={18}
              strokeWidth={2}
            />
          </div>
          <span className="sidebar-theme-label">
            {theme === "light" ? "ライト" : "ダーク"}
          </span>
        </button>
      </div>
    </nav>
  );
}
