import OpenAI from "openai";
import type { ConnectionSettings } from "@/lib/settings/connection-storage";

function normalizeBaseUrl(url: string | undefined) {
  const trimmed = (url ?? "").trim();
  if (!trimmed) {
    return "https://api.openai.com/v1";
  }
  return trimmed.replace(/\/$/, "");
}

// Tauri環境かどうかを判定
function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

export function createResponsesClient(connection: ConnectionSettings) {
  if (!connection.apiKey) {
    throw new Error("API キーが見つかりません。G0 で接続設定を保存してください。");
  }

  // Tauri環境の場合はTauriクライアントを使用
  if (isTauriEnvironment()) {
    // 動的インポートを使用してTauriクライアントを読み込む
    const { createTauriResponsesClient } = require("@/lib/chat/tauri-openai-client");
    return createTauriResponsesClient(connection);
  }

  // ブラウザ環境ではOpenAI SDKを使用（プロキシは使用できない）
  return new OpenAI({
    apiKey: connection.apiKey,
    baseURL: normalizeBaseUrl(connection.baseUrl),
    dangerouslyAllowBrowser: true,
    defaultHeaders: connection.additionalHeaders,
  });
}
