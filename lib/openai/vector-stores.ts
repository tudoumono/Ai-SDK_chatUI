import type { VectorStoreRecord } from "@/lib/storage/schema";
import {
  loadConnection,
  type ConnectionSettings,
} from "@/lib/settings/connection-storage";
import { buildRequestHeaders } from "@/lib/settings/header-utils";

function ensureConnection(connection?: ConnectionSettings | null) {
  if (!connection) {
    throw new Error("接続情報が保存されていません。まず G0 で接続テストを実施してください。");
  }
  if (!connection.apiKey) {
    throw new Error("API キーが見つかりません");
  }
  return connection;
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
    connectionOverride ?? (await loadConnection()),
  );
  const baseUrl = buildBaseUrl(connection);
  const url = `${baseUrl}/vector_stores`;
  const response = await fetch(url, {
    method: "GET",
    headers: buildRequestHeaders(
      { Authorization: `Bearer ${connection.apiKey}` },
      connection.additionalHeaders,
    ),
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
    createdAt: item.created_at ?? new Date().toISOString(),
    description: item.description ?? undefined,
  }));
}

export async function deleteVectorStoreFromApi(
  id: string,
  connectionOverride?: ConnectionSettings,
) {
  const connection = ensureConnection(
    connectionOverride ?? (await loadConnection()),
  );
  const baseUrl = buildBaseUrl(connection);
  const url = `${baseUrl}/vector_stores/${id}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: buildRequestHeaders(
      { Authorization: `Bearer ${connection.apiKey}` },
      connection.additionalHeaders,
    ),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`OpenAI API エラー: HTTP ${response.status} ${message}`.trim());
  }
}

type VectorStoreFile = {
  id: string;
  object: string;
  created_at: number;
  vector_store_id: string;
  status: "in_progress" | "completed" | "cancelled" | "failed";
  last_error?: {
    code: string;
    message: string;
  } | null;
};

type VectorStoreFilesResponse = {
  object: string;
  data: VectorStoreFile[];
  first_id?: string;
  last_id?: string;
  has_more: boolean;
};

export type VectorStoreFileInfo = {
  id: string;
  status: string;
  createdAt: string;
  error?: string;
};

export async function fetchVectorStoreFiles(
  vectorStoreId: string,
  connectionOverride?: ConnectionSettings,
): Promise<VectorStoreFileInfo[]> {
  const connection = ensureConnection(
    connectionOverride ?? (await loadConnection()),
  );
  const baseUrl = buildBaseUrl(connection);
  const url = `${baseUrl}/vector_stores/${vectorStoreId}/files`;
  const response = await fetch(url, {
    method: "GET",
    headers: buildRequestHeaders(
      { Authorization: `Bearer ${connection.apiKey}` },
      connection.additionalHeaders,
    ),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`OpenAI API エラー: HTTP ${response.status} ${message}`.trim());
  }
  const json = (await response.json()) as VectorStoreFilesResponse;
  return json.data.map((file) => ({
    id: file.id,
    status: file.status,
    createdAt: new Date(file.created_at * 1000).toISOString(),
    error: file.last_error?.message,
  }));
}

type FileInfo = {
  id: string;
  filename: string;
  bytes: number;
  created_at: number;
  purpose: string;
};

export async function fetchFileInfo(
  fileId: string,
  connectionOverride?: ConnectionSettings,
): Promise<{ filename: string; size: number }> {
  const connection = ensureConnection(
    connectionOverride ?? (await loadConnection()),
  );
  const baseUrl = buildBaseUrl(connection);
  const url = `${baseUrl}/files/${fileId}`;
  const response = await fetch(url, {
    method: "GET",
    headers: buildRequestHeaders(
      { Authorization: `Bearer ${connection.apiKey}` },
      connection.additionalHeaders,
    ),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`OpenAI API エラー: HTTP ${response.status} ${message}`.trim());
  }
  const json = (await response.json()) as FileInfo;
  return {
    filename: json.filename,
    size: json.bytes,
  };
}

export async function deleteVectorStoreFile(
  vectorStoreId: string,
  fileId: string,
  connectionOverride?: ConnectionSettings,
) {
  const connection = ensureConnection(
    connectionOverride ?? (await loadConnection()),
  );
  const baseUrl = buildBaseUrl(connection);
  const url = `${baseUrl}/vector_stores/${vectorStoreId}/files/${fileId}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: buildRequestHeaders(
      { Authorization: `Bearer ${connection.apiKey}` },
      connection.additionalHeaders,
    ),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`OpenAI API エラー: HTTP ${response.status} ${message}`.trim());
  }
}

type CreateVectorStoreResponse = {
  id: string;
  object: string;
  created_at: number;
  name: string;
  file_counts: {
    in_progress: number;
    completed: number;
    failed: number;
    cancelled: number;
    total: number;
  };
};

export async function createVectorStore(
  name: string,
  description?: string,
  connectionOverride?: ConnectionSettings,
): Promise<string> {
  const connection = ensureConnection(
    connectionOverride ?? (await loadConnection()),
  );
  const baseUrl = buildBaseUrl(connection);
  const url = `${baseUrl}/vector_stores`;
  const response = await fetch(url, {
    method: "POST",
    headers: buildRequestHeaders(
      {
        Authorization: `Bearer ${connection.apiKey}`,
        "Content-Type": "application/json",
      },
      connection.additionalHeaders,
    ),
    body: JSON.stringify({
      name,
      ...(description ? { metadata: { description } } : {}),
    }),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`OpenAI API エラー: HTTP ${response.status} ${message}`.trim());
  }
  const json = (await response.json()) as CreateVectorStoreResponse;
  return json.id;
}

export async function uploadFileToOpenAI(
  file: File,
  connectionOverride?: ConnectionSettings,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const connection = ensureConnection(
    connectionOverride ?? (await loadConnection()),
  );
  const baseUrl = buildBaseUrl(connection);
  const url = `${baseUrl}/files`;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("purpose", "assistants");

  const xhr = new XMLHttpRequest();

  return new Promise((resolve, reject) => {
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        const progress = Math.round((e.loaded / e.total) * 100);
        onProgress(progress);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response.id);
        } catch (error) {
          reject(new Error("Failed to parse response"));
        }
      } else {
        reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText}`));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Network error"));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload aborted"));
    });

    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${connection.apiKey}`);

    if (connection.additionalHeaders) {
      Object.entries(connection.additionalHeaders).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });
    }

    xhr.send(formData);
  });
}

export async function attachFileToVectorStore(
  vectorStoreId: string,
  fileId: string,
  connectionOverride?: ConnectionSettings,
): Promise<void> {
  const connection = ensureConnection(
    connectionOverride ?? (await loadConnection()),
  );
  const baseUrl = buildBaseUrl(connection);
  const url = `${baseUrl}/vector_stores/${vectorStoreId}/files`;
  const response = await fetch(url, {
    method: "POST",
    headers: buildRequestHeaders(
      {
        Authorization: `Bearer ${connection.apiKey}`,
        "Content-Type": "application/json",
      },
      connection.additionalHeaders,
    ),
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`OpenAI API エラー: HTTP ${response.status} ${message}`.trim());
  }
}

export async function updateVectorStore(
  vectorStoreId: string,
  name: string,
  description?: string,
  connectionOverride?: ConnectionSettings,
): Promise<void> {
  const connection = ensureConnection(
    connectionOverride ?? (await loadConnection()),
  );
  const baseUrl = buildBaseUrl(connection);
  const url = `${baseUrl}/vector_stores/${vectorStoreId}`;
  const response = await fetch(url, {
    method: "POST",
    headers: buildRequestHeaders(
      {
        Authorization: `Bearer ${connection.apiKey}`,
        "Content-Type": "application/json",
      },
      connection.additionalHeaders,
    ),
    body: JSON.stringify({
      name,
      ...(description ? { metadata: { description } } : {}),
    }),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`OpenAI API エラー: HTTP ${response.status} ${message}`.trim());
  }
}
