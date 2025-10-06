/**
 * ログサニタイザー
 *
 * エクスポート前にログから機密情報を削除します。
 * - APIキー
 * - パスワード
 * - トークン
 * - 個人情報
 */

import type { LogEntry } from "./error-logger";

// サニタイズするパターン
const SENSITIVE_PATTERNS = [
  // OpenAI APIキー
  /sk-[a-zA-Z0-9]{48}/gi,
  /sk-proj-[a-zA-Z0-9_-]{48,}/gi,

  // 一般的なAPIキーパターン
  /api[_-]?key[:\s=]+[a-zA-Z0-9_-]+/gi,
  /apikey[:\s=]+[a-zA-Z0-9_-]+/gi,

  // トークン
  /bearer\s+[a-zA-Z0-9_-]+/gi,
  /token[:\s=]+[a-zA-Z0-9_-]+/gi,

  // パスワード
  /password[:\s=]+[^\s]+/gi,
  /passwd[:\s=]+[^\s]+/gi,

  // Authorization ヘッダー
  /authorization[:\s=]+[^\s]+/gi,

  // 暗号化されたパスフレーズ（base64っぽい長い文字列）
  /passphrase[:\s=]+[a-zA-Z0-9+/=]{20,}/gi,
];

// 機密情報を含む可能性のあるキー
const SENSITIVE_KEYS = [
  "apiKey",
  "api_key",
  "apikey",
  "password",
  "passwd",
  "token",
  "secret",
  "passphrase",
  "authorization",
  "auth",
  "credentials",
  "privateKey",
  "private_key",
];

/**
 * 文字列から機密情報を削除
 */
function sanitizeString(str: string): string {
  let sanitized = str;

  SENSITIVE_PATTERNS.forEach((pattern) => {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  });

  return sanitized;
}

/**
 * オブジェクトから機密情報を削除（再帰的）
 */
function sanitizeObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    return sanitizeString(obj);
  }

  if (typeof obj === "number" || typeof obj === "boolean") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }

  if (typeof obj === "object") {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      // キー名が機密情報を示す場合
      if (SENSITIVE_KEYS.some((sensitiveKey) =>
        key.toLowerCase().includes(sensitiveKey.toLowerCase())
      )) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitizeObject(value);
      }
    }

    return sanitized;
  }

  return obj;
}

/**
 * スタックトレースから機密情報を削除
 */
function sanitizeStack(stack: string | undefined): string | undefined {
  if (!stack) return stack;

  // ファイルパスから個人情報を削除（ユーザー名など）
  let sanitized = stack;

  // Windows/Linux/Mac のユーザーディレクトリパターン
  sanitized = sanitized.replace(/\/Users\/[^/]+\//g, "/Users/[USER]/");
  sanitized = sanitized.replace(/\/home\/[^/]+\//g, "/home/[USER]/");
  sanitized = sanitized.replace(/C:\\Users\\[^\\]+\\/g, "C:\\Users\\[USER]\\");

  // 機密情報パターンを削除
  return sanitizeString(sanitized);
}

/**
 * ログエントリをサニタイズ
 */
export function sanitizeLogEntry(entry: LogEntry): LogEntry {
  return {
    ...entry,
    message: sanitizeString(entry.message),
    stack: sanitizeStack(entry.stack),
    context: entry.context ? (sanitizeObject(entry.context) as Record<string, unknown>) : undefined,
    // userAgentはそのまま保持（デバッグに有用）
  };
}

/**
 * ログ配列をサニタイズ
 */
export function sanitizeLogs(logs: LogEntry[]): LogEntry[] {
  return logs.map(sanitizeLogEntry);
}

/**
 * エクスポート用のログバンドルを作成
 */
export interface LogExportBundle {
  exportedAt: string;
  appVersion: string;
  totalLogs: number;
  logs: LogEntry[];
  summary: {
    byLevel: Record<string, number>;
    byCategory: Record<string, number>;
  };
}

export function createLogExportBundle(logs: LogEntry[]): LogExportBundle {
  const sanitizedLogs = sanitizeLogs(logs);

  const byLevel: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  sanitizedLogs.forEach((log) => {
    byLevel[log.level] = (byLevel[log.level] || 0) + 1;
    byCategory[log.category] = (byCategory[log.category] || 0) + 1;
  });

  return {
    exportedAt: new Date().toISOString(),
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0",
    totalLogs: sanitizedLogs.length,
    logs: sanitizedLogs,
    summary: {
      byLevel,
      byCategory,
    },
  };
}

/**
 * ログバンドルをJSONファイルとしてダウンロード
 */
export function downloadLogBundle(bundle: LogExportBundle): void {
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `error-logs-${timestamp}.json`;

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
