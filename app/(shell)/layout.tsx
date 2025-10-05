import { SidebarNav } from "@/components/layout/sidebar-nav";
import { LoadingIndicator } from "@/components/layout/loading-indicator";
import type { ReactNode } from "react";

export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <LoadingIndicator />
      <SidebarNav />
      <div className="app-shell-content">{children}</div>
    </div>
  );
}
