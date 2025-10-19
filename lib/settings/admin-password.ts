/**
 * Admin Password Management
 * 管理者パスワードの管理
 */

const STORAGE_KEY = "admin-password-hash";
const DEFAULT_PASSWORD = "admin123"; // デフォルトパスワード

// デフォルトパスワードのハッシュキャッシュ（パフォーマンス最適化）
let defaultPasswordHashCache: string | null = null;

/**
 * Simple hash function (SHA-256 via Web Crypto API)
 * ブラウザのWeb Crypto APIを使用した簡易ハッシュ関数
 */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

/**
 * Get cached default password hash (performance optimization)
 * デフォルトパスワードのハッシュをキャッシュから取得
 */
async function getDefaultPasswordHash(): Promise<string> {
  if (!defaultPasswordHashCache) {
    defaultPasswordHashCache = await hashPassword(DEFAULT_PASSWORD);
  }
  return defaultPasswordHashCache;
}

/**
 * Initialize password hash if not exists
 * パスワードハッシュが存在しない場合は初期化
 */
export async function initializePasswordIfNeeded(): Promise<void> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      const defaultHash = await getDefaultPasswordHash();
      localStorage.setItem(STORAGE_KEY, defaultHash);
    }
  } catch (error) {
    console.error("Failed to initialize admin password:", error);
  }
}

/**
 * Verify if the provided password is correct
 * 提供されたパスワードが正しいか検証
 */
export async function verifyPassword(password: string): Promise<boolean> {
  try {
    await initializePasswordIfNeeded();

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return false;
    }

    const inputHash = await hashPassword(password);
    return inputHash === stored;
  } catch (error) {
    console.error("Failed to verify password:", error);
    return false;
  }
}

/**
 * Change the admin password
 * 管理者パスワードを変更
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify current password
    const isValid = await verifyPassword(currentPassword);
    if (!isValid) {
      return {
        success: false,
        error: "現在のパスワードが正しくありません",
      };
    }

    // Validate new password
    if (newPassword.length < 6) {
      return {
        success: false,
        error: "新しいパスワードは6文字以上である必要があります",
      };
    }

    // Hash and store new password
    const newHash = await hashPassword(newPassword);
    localStorage.setItem(STORAGE_KEY, newHash);

    return { success: true };
  } catch (error) {
    console.error("Failed to change password:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Reset password to default (for recovery)
 * パスワードをデフォルトにリセット（リカバリ用）
 */
export async function resetPasswordToDefault(): Promise<void> {
  try {
    const defaultHash = await getDefaultPasswordHash();
    localStorage.setItem(STORAGE_KEY, defaultHash);
  } catch (error) {
    console.error("Failed to reset password:", error);
    throw error;
  }
}


/**
 * Get the default password (for display in UI)
 * デフォルトパスワードを取得（UI表示用）
 */
export function getDefaultPassword(): string {
  return DEFAULT_PASSWORD;
}

/**
 * Check if password has been changed from default
 * パスワードがデフォルトから変更されているか確認
 */
export async function isPasswordChanged(): Promise<boolean> {
  try {
    await initializePasswordIfNeeded();

    const stored = localStorage.getItem(STORAGE_KEY);
    const defaultHash = await getDefaultPasswordHash();

    return stored !== defaultHash;
  } catch (error) {
    console.error("Failed to check if password is changed:", error);
    return false;
  }
}
