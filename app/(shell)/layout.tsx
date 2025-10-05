import { SidebarNav } from "@/components/layout/sidebar-nav";
import type { ReactNode } from "react";

export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <SidebarNav />
      <div className="app-shell-content">{children}</div>
    </div>
  );
}
