"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  initializeTheme,
  saveTheme,
  applyTheme,
  getCurrentTheme,
  type Theme,
} from "@/lib/settings/theme-storage";

type ThemeContextType = {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // クライアント側でのみテーマを初期化
    setMounted(true);
    const initialTheme = initializeTheme();
    setThemeState(initialTheme);
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
    saveTheme(newTheme);
  };

  const toggleTheme = () => {
    const newTheme = getCurrentTheme() === "light" ? "dark" : "light";
    setTheme(newTheme);
  };

  // 常にコンテキストを提供してuseThemeエラーを回避
  // マウント前は初期値（dark）を使用し、マウント後に実際のテーマを適用
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    // During SSR or static generation, return a default theme context
    // to avoid throwing errors during build
    if (typeof window === "undefined") {
      return {
        theme: "dark" as Theme,
        toggleTheme: () => {},
        setTheme: () => {},
      };
    }
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
