/**
 * パスワードリセット用ファイル検出・処理
 * Tauri環境でのみ動作（ブラウザ版では無効）
 */

import { isTauriEnvironment } from "@/lib/utils/tauri-helpers";

const RESET_FILE_NAME = ".admin-password-reset";

/**
 * リセットファイルの存在確認と新しいパスワードの読み取り
 * Tauri環境でのみ動作
 */
export async function checkPasswordResetFile(): Promise<{
  exists: boolean;
  newPassword?: string;
  error?: string;
}> {
  if (!isTauriEnvironment()) {
    return { exists: false };
  }

  try {
    // Tauri v2のFSプラグインを動的にインポート
    const { BaseDirectory, exists, readTextFile } = await import("@tauri-apps/plugin-fs");

    // アプリケーション実行ディレクトリ（exe配置場所）のリセットファイルを確認
    const fileExists = await exists(RESET_FILE_NAME, {
      baseDir: BaseDirectory.AppConfig,
    });

    if (!fileExists) {
      return { exists: false };
    }

    // ファイル内容を読み取り（新しいパスワード）
    const content = await readTextFile(RESET_FILE_NAME, {
      baseDir: BaseDirectory.AppConfig,
    });

    const newPassword = content.trim();

    // パスワードのバリデーション
    if (!newPassword || newPassword.length < 6) {
      return {
        exists: true,
        error: "リセットファイルに有効なパスワードが記載されていません（6文字以上必要）",
      };
    }

    return {
      exists: true,
      newPassword,
    };
  } catch (error) {
    console.error("Failed to check password reset file:", error);
    return {
      exists: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * リセットファイルを削除
 * セキュリティのため、リセット処理完了後に必ず実行
 */
export async function deletePasswordResetFile(): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }

  try {
    const { BaseDirectory, remove } = await import("@tauri-apps/plugin-fs");

    await remove(RESET_FILE_NAME, {
      baseDir: BaseDirectory.AppConfig,
    });

    console.log("✅ Password reset file deleted successfully");
  } catch (error) {
    console.error("Failed to delete password reset file:", error);
    throw error;
  }
}

/**
 * リセットファイルの配置場所を取得（説明用）
 */
export async function getResetFileLocation(): Promise<string | null> {
  if (!isTauriEnvironment()) {
    return null;
  }

  try {
    const { appConfigDir } = await import("@tauri-apps/api/path");
    const configDir = await appConfigDir();
    return `${configDir}${RESET_FILE_NAME}`;
  } catch (error) {
    console.error("Failed to get reset file location:", error);
    return null;
  }
}
