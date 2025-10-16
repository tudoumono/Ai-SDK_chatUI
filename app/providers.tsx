"use client";

import { Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <JotaiProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </JotaiProvider>
  );
}
