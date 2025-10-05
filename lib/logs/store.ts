import { useCallback, useEffect, useState } from "react";
import type { LogEntry, LogLevel } from "./types";

const LOG_KEY = "ai-sdk-chatui::logs";

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseLogs(raw: string | null): LogEntry[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as LogEntry[];
    if (!Array.isArray(data)) {
      return [];
    }
    return data;
  } catch {
    return [];
  }
}

function serializeLogs(entries: LogEntry[]): string {
  return JSON.stringify(entries.slice(-500));
}

export function appendLog(entry: Omit<LogEntry, "id" | "timestamp"> & { timestamp?: string }) {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(LOG_KEY);
  const existing = parseLogs(raw);
  const next: LogEntry = {
    id: createId(),
    timestamp: entry.timestamp ?? new Date().toISOString(),
    level: entry.level,
    scope: entry.scope,
    message: entry.message,
    detail: entry.detail,
  };
  const merged = [...existing, next];
  window.localStorage.setItem(LOG_KEY, serializeLogs(merged));
}

export function clearLogs() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LOG_KEY);
}

export function loadLogs(): LogEntry[] {
  if (typeof window === "undefined") return [];
  return parseLogs(window.localStorage.getItem(LOG_KEY));
}

export function useLogs() {
  const [entries, setEntries] = useState<LogEntry[]>([]);

  useEffect(() => {
    setEntries(loadLogs());
    const handler = () => {
      setEntries(loadLogs());
    };
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("storage", handler);
    };
  }, []);

  const addLog = useCallback(
    (level: LogLevel, scope: LogEntry["scope"], message: string, detail?: string) => {
      appendLog({ level, scope, message, detail });
      setEntries(loadLogs());
    },
    [],
  );

  const resetLogs = useCallback(() => {
    clearLogs();
    setEntries([]);
  }, []);

  return { entries, addLog, resetLogs };
}
