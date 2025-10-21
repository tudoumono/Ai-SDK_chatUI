"use client";

import { Provider as JotaiProvider } from "jotai";
import { useEffect, type ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { bootstrapSecureConfig } from "@/lib/security/secure-config";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    bootstrapSecureConfig().catch((error) => {
      console.error("[Providers] Secure config bootstrap failed", error);
    });
  }, []);

  return (
    <JotaiProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </JotaiProvider>
  );
}
