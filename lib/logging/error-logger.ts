/**
 * エラーロギングシステム
 *
 * アプリケーション全体のエラーを収集・保存・エクスポートする機能を提供します。
 * 非エンジニアユーザーが予期せぬエラーに遭遇した際、
 * このログをエクスポートして送信できるようにします。
 */

import { openDB, DBSchema, IDBPDatabase } from "idb";

// ログエントリの型定義
export interface LogEntry {
  id?: number;
  timestamp: string;
  level: "error" | "warning" | "info" | "debug";
  category: "startup" | "runtime" | "api" | "storage" | "ui" | "unknown";
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  userAgent?: string;
}

// IndexedDBスキーマ定義
interface ErrorLogDB extends DBSchema {
  logs: {
    key: number;
    value: LogEntry;
    indexes: { "by-timestamp": string; "by-level": string; "by-category": string };
  };
}

const DB_NAME = "error-logs-db";
const DB_VERSION = 1;
const STORE_NAME = "logs";
const MAX_LOGS = 1000; // 最大保存ログ数

let dbInstance: IDBPDatabase<ErrorLogDB> | null = null;

/**
 * データベースを初期化
 */
async function getDB(): Promise<IDBPDatabase<ErrorLogDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<ErrorLogDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("by-timestamp", "timestamp");
        store.createIndex("by-level", "level");
        store.createIndex("by-category", "category");
      }
    },
  });

  return dbInstance;
}

/**
 * ログエントリを保存
 */
export async function saveLog(
  level: LogEntry["level"],
  category: LogEntry["category"],
  message: string,
  error?: Error,
  context?: Record<string, unknown>
): Promise<void> {
  try {
    const db = await getDB();

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      stack: error?.stack,
      context,
      userAgent: navigator.userAgent,
    };

    await db.add(STORE_NAME, entry);

    // ログ数を制限
    await cleanupOldLogs(db);

    // コンソールにも出力（デバッグ用）
    const emoji = {
      error: "❌",
      warning: "⚠️",
      info: "ℹ️",
      debug: "🔧",
    }[level];

    console[level === "error" ? "error" : level === "warning" ? "warn" : "log"](
      `${emoji} [${category}] ${message}`,
      error || context || ""
    );
  } catch (err) {
    // ロギング自体が失敗した場合はコンソールにのみ出力
    console.error("Failed to save log:", err);
  }
}

/**
 * 古いログを削除して最大数を維持
 */
async function cleanupOldLogs(db: IDBPDatabase<ErrorLogDB>): Promise<void> {
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const count = await store.count();

  if (count > MAX_LOGS) {
    const index = store.index("by-timestamp");
    const cursor = await index.openCursor();
    let deleted = 0;
    const toDelete = count - MAX_LOGS;

    if (cursor) {
      while (deleted < toDelete && cursor) {
        await cursor.delete();
        deleted++;
        await cursor.continue();
      }
    }
  }

  await tx.done;
}

/**
 * すべてのログを取得
 */
export async function getAllLogs(): Promise<LogEntry[]> {
  try {
    const db = await getDB();
    const logs = await db.getAllFromIndex(STORE_NAME, "by-timestamp");
    return logs.reverse(); // 新しい順に
  } catch (err) {
    console.error("Failed to get logs:", err);
    return [];
  }
}

/**
 * ログをフィルタリングして取得
 */
export async function getFilteredLogs(
  level?: LogEntry["level"],
  category?: LogEntry["category"],
  limit = 100
): Promise<LogEntry[]> {
  try {
    const db = await getDB();
    let logs: LogEntry[];

    if (level) {
      logs = await db.getAllFromIndex(STORE_NAME, "by-level", level);
    } else if (category) {
      logs = await db.getAllFromIndex(STORE_NAME, "by-category", category);
    } else {
      logs = await db.getAll(STORE_NAME);
    }

    return logs.reverse().slice(0, limit);
  } catch (err) {
    console.error("Failed to get filtered logs:", err);
    return [];
  }
}

/**
 * すべてのログを削除
 */
export async function clearAllLogs(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear(STORE_NAME);
    console.log("✅ All logs cleared");
  } catch (err) {
    console.error("Failed to clear logs:", err);
    throw err;
  }
}

/**
 * ログ統計を取得
 */
export async function getLogStats(): Promise<{
  total: number;
  byLevel: Record<string, number>;
  byCategory: Record<string, number>;
}> {
  try {
    const logs = await getAllLogs();
    const byLevel: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    logs.forEach((log) => {
      byLevel[log.level] = (byLevel[log.level] || 0) + 1;
      byCategory[log.category] = (byCategory[log.category] || 0) + 1;
    });

    return {
      total: logs.length,
      byLevel,
      byCategory,
    };
  } catch (err) {
    console.error("Failed to get log stats:", err);
    return { total: 0, byLevel: {}, byCategory: {} };
  }
}

// グローバルエラーハンドラーを設定
if (typeof window !== "undefined") {
  // 未処理のエラーをキャッチ
  window.addEventListener("error", (event) => {
    saveLog(
      "error",
      "runtime",
      event.message,
      event.error,
      {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      }
    );
  });

  // 未処理のPromise rejectをキャッチ
  window.addEventListener("unhandledrejection", (event) => {
    saveLog(
      "error",
      "runtime",
      `Unhandled Promise Rejection: ${event.reason}`,
      event.reason instanceof Error ? event.reason : undefined,
      { reason: String(event.reason) }
    );
  });

  // Next.js Error Overlayのエラーも記録
  // Next.jsは内部的にコンソールエラーを使用するため、console.errorをフック
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    // Next.jsの内部エラーやReactエラーをキャッチ
    const message = args.map(arg =>
      typeof arg === 'string' ? arg :
      arg instanceof Error ? arg.message :
      JSON.stringify(arg)
    ).join(' ');

    // Next.js特有のエラーパターンを検出
    const isNextError = message.includes('Warning:') ||
                       message.includes('Error:') ||
                       message.includes('Failed to') ||
                       message.includes('Unhandled');

    if (isNextError) {
      const error = args.find(arg => arg instanceof Error) as Error | undefined;
      saveLog(
        message.includes('Warning:') ? "warning" : "error",
        "ui",
        message,
        error,
        {
          source: "Next.js",
          args: args.map(arg => String(arg))
        }
      );
    }

    // 元のconsole.errorも呼び出す
    originalConsoleError.apply(console, args);
  };
}
