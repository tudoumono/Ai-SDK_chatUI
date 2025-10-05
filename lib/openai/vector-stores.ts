import type { VectorStoreRecord } from "@/lib/storage/schema";
import {
  loadConnection,
  type ConnectionSettings,
} from "@/lib/settings/connection-storage";

function ensureConnection(connection?: ConnectionSettings | null) {
  if (!connection) {
    throw new Error("接続情報が保存されていません。まず G0 で接続テストを実施してください。");
  }
  if (!connection.apiKey) {
    throw new Error("API キーが見つかりません");
  }
  return connection;
}

function buildHeaders(connection: ConnectionSettings): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${connection.apiKey}`,
  };
  if (connection.organization) {
    headers["OpenAI-Organization"] = connection.organization;
  }
  if (connection.project) {
    headers["OpenAI-Project"] = connection.project;
  }
  if (connection.additionalHeaders) {
    for (const [key, value] of Object.entries(connection.additionalHeaders)) {
      headers[key] = value;
    }
  }
  return headers;
}

function buildBaseUrl(connection: ConnectionSettings) {
  const trimmed = connection.baseUrl.trim().replace(/\/$/, "");
  if (!trimmed) {
    return "https://api.openai.com/v1";
  }
  return trimmed;
}

type VectorStoreListResponse = {
  data: Array<{
    id: string;
    name: string | null;
    file_counts?: { completed?: number };
    updated_at?: string | null;
    created_at?: string | null;
    description?: string | null;
  }>;
};

export async function fetchVectorStoresFromApi(
  connectionOverride?: ConnectionSettings,
): Promise<VectorStoreRecord[]> {
  const connection = ensureConnection(
    connectionOverride ?? loadConnection(),
  );
  const baseUrl = buildBaseUrl(connection);
  const url = `${baseUrl}/vector_stores`;
  const response = await fetch(url, {
    method: "GET",
    headers: buildHeaders(connection),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`OpenAI API エラー: HTTP ${response.status} ${message}`.trim());
  }
  const json = (await response.json()) as VectorStoreListResponse;
  return json.data.map((item) => ({
    id: item.id,
    name: item.name ?? "(名称未設定)",
    fileCount: item.file_counts?.completed ?? 0,
    updatedAt: item.updated_at ?? item.created_at ?? new Date().toISOString(),
    description: item.description ?? undefined,
  }));
}
