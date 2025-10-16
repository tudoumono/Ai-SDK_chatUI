/**
 * テーマ設定の管理
 */

export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "app-theme";

/**
 * テーマをLocalStorageに保存
 */
export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.error("Failed to save theme:", error);
  }
}

/**
 * LocalStorageからテーマを読み込み
 */
export function loadTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
    return null;
  } catch (error) {
    console.error("Failed to load theme:", error);
    return null;
  }
}

/**
 * テーマをDOMに適用
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
}

/**
 * 現在のテーマを取得
 */
export function getCurrentTheme(): Theme {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  return currentTheme === "light" ? "light" : "dark";
}

/**
 * テーマを初期化（アプリ起動時に呼び出す）
 */
export function initializeTheme(): Theme {
  const savedTheme = loadTheme();
  const theme = savedTheme || "dark"; // デフォルトはダークモード
  applyTheme(theme);
  return theme;
}
