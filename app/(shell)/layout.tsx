"use client";

import { SidebarNav } from "@/components/layout/sidebar-nav";
import { LoadingIndicator } from "@/components/layout/loading-indicator";
import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function ShellLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="app-shell">
      <LoadingIndicator />
      {sidebarOpen && <SidebarNav />}
      <button
        className="app-shell-sidebar-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        title={sidebarOpen ? "サイドバーを隠す" : "サイドバーを表示"}
      >
        {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
      </button>
      <div className="app-shell-content">{children}</div>
    </div>
  );
}
