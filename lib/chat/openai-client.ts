import OpenAI from "openai";
import type { ConnectionSettings } from "@/lib/settings/connection-storage";

function normalizeBaseUrl(url: string | undefined) {
  const trimmed = (url ?? "").trim();
  if (!trimmed) {
    return "https://api.openai.com/v1";
  }
  return trimmed.replace(/\/$/, "");
}

export function createResponsesClient(connection: ConnectionSettings) {
  if (!connection.apiKey) {
    throw new Error("API キーが見つかりません。G0 で接続設定を保存してください。");
  }

  return new OpenAI({
    apiKey: connection.apiKey,
    baseURL: normalizeBaseUrl(connection.baseUrl),
    dangerouslyAllowBrowser: true,
    defaultHeaders: connection.additionalHeaders,
  });
}
