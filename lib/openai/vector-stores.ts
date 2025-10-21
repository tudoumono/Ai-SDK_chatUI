import type { VectorStoreRecord } from "@/lib/storage/schema";
import { loadConnection, type ConnectionSettings } from "@/lib/settings/connection-storage";
import { buildRequestHeaders } from "@/lib/settings/header-utils";
import { saveLog } from "@/lib/logging/error-logger";
import { normalizeBaseUrl } from "@/lib/security/base-url";
import { isFileUploadAllowed } from "@/lib/settings/feature-restrictions";
import { filterForbiddenHeaders } from "@/lib/security/headers";

function ensureConnection(connection?: ConnectionSettings | null) {
  if (!connection) {
    throw new Error("接続情報が保存されていません。まず G0 で接続テストを実施してください。");
  }
  if (!connection.apiKey) {
    throw new Error("API キーが見つかりません");
  }
  return connection;
}

type VectorStoreListResponse = {
  data: Array<{
    id: string;
    name: string | null;
    file_counts?: { completed?: number };
    created_at?: number;
    last_active_at?: number;
    expires_after?: {
      anchor?: "last_active_at" | "created_at" | null;
      days?: number | null;
    } | null;
    expires_at?: number | null;
    description?: string | null;
    metadata?: { description?: string | null } | null;
  }>;
};

type VectorStoreDetailResponse = {
  id: string;
  name?: string | null;
  description?: string | null;
  metadata?: { description?: string | null } | null;
  created_at?: string | null;
  updated_at?: string | null;
  expires_after?: {
    anchor?: "last_active_at" | "created_at" | null;
    days?: number | null;
  } | null;
  expires_at?: string | null;
  file_counts?: { completed?: number } | null;
};

export type VectorStoreDetail = {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  fileCount?: number;
  expiresAfter?: {
    anchor: "last_active_at" | "created_at";
    days: number | null;
  } | null;
  expiresAt?: string | null;
};

export async function fetchVectorStoresFromApi(
  connectionOverride?: ConnectionSettings,
): Promise<VectorStoreRecord[]> {
  const connection = ensureConnection(
    connectionOverride ?? (await loadConnection()),
  );
  const baseUrl = normalizeBaseUrl(connection.baseUrl);
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
  return json.data.map((item) => {
    const expiresAfter = item.expires_after
      ? {
          anchor: (item.expires_after.anchor ?? "last_active_at") as
            | "last_active_at"
            | "created_at",
          days:
            typeof item.expires_after.days === "number"
              ? item.expires_after.days
              : null,
        }
      : null;

    const createdAt = item.created_at
      ? new Date(item.created_at * 1000).toISOString()
      : new Date().toISOString();
    const lastActiveAt = item.last_active_at
      ? new Date(item.last_active_at * 1000).toISOString()
      : undefined;

    return {
      id: item.id,
      name: item.name ?? "(名称未設定)",
      fileCount: item.file_counts?.completed ?? 0,
      updatedAt: lastActiveAt ?? createdAt,
      createdAt,
      lastActiveAt,
      description:
        item.description ?? item.metadata?.description ?? undefined,
      expiresAfter,
      expiresAt: item.expires_at
        ? new Date(item.expires_at * 1000).toISOString()
        : null,
    };
  });
}

export async function fetchVectorStoreDetail(
  id: string,
  connectionOverride?: ConnectionSettings,
): Promise<VectorStoreDetail> {
  const connection = ensureConnection(
    connectionOverride ?? (await loadConnection()),
  );
  const baseUrl = normalizeBaseUrl(connection.baseUrl);
  const url = `${baseUrl}/vector_stores/${id}`;
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
  const json = (await response.json()) as VectorStoreDetailResponse;
  const expiresAfter = json.expires_after
    ? {
        anchor: (json.expires_after.anchor ?? "last_active_at") as
          | "last_active_at"
          | "created_at",
        days:
          typeof json.expires_after.days === "number"
            ? json.expires_after.days
            : null,
      }
    : null;

  return {
    id: json.id,
    name: json.name ?? "(名称未設定)",
    description:
      json.description ?? json.metadata?.description ?? undefined,
    createdAt: json.created_at ?? undefined,
    updatedAt: json.updated_at ?? undefined,
    fileCount: json.file_counts?.completed ?? undefined,
    expiresAfter,
    expiresAt: json.expires_at ?? null,
  };
}

export async function deleteVectorStoreFromApi(
  id: string,
  connectionOverride?: ConnectionSettings,
) {
  const connection = ensureConnection(
    connectionOverride ?? (await loadConnection()),
  );
  const baseUrl = normalizeBaseUrl(connection.baseUrl);
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
  const baseUrl = normalizeBaseUrl(connection.baseUrl);
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
  const baseUrl = normalizeBaseUrl(connection.baseUrl);
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
  const baseUrl = normalizeBaseUrl(connection.baseUrl);
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

type VectorStoreOptions = {
  expiresAfterDays?: number | null;
  connectionOverride?: ConnectionSettings;
};

export async function createVectorStore(
  name: string,
  description?: string,
  options?: VectorStoreOptions,
): Promise<string> {
  const connection = ensureConnection(
    options?.connectionOverride ?? (await loadConnection()),
  );
  const baseUrl = normalizeBaseUrl(connection.baseUrl);
  const url = `${baseUrl}/vector_stores`;

  const body: Record<string, unknown> = { name };

  if (description) {
    body.metadata = { description };
  }

  if (options) {
    if (options.expiresAfterDays === null) {
      body.expires_after = null;
    } else if (typeof options.expiresAfterDays === "number") {
      body.expires_after = {
        anchor: "last_active_at",
        days: options.expiresAfterDays,
      };
    }
  }

  const response = await fetch(url, {
    method: "POST",
    headers: buildRequestHeaders(
      {
        Authorization: `Bearer ${connection.apiKey}`,
        "Content-Type": "application/json",
      },
      connection.additionalHeaders,
    ),
    body: JSON.stringify(body),
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
  if (!isFileUploadAllowed()) {
    throw new Error("ファイルアップロード機能は管理者によって無効化されています。");
  }
  const connection = ensureConnection(
    connectionOverride ?? (await loadConnection()),
  );

  // Tauri環境かどうかを判定
  const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

  if (isTauri) {
    // Tauri環境: Tauri invoke経由でアップロード
    const { invoke } = await import("@tauri-apps/api/core");

    // ファイルをBase64に変換（大きなファイルに対応）
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // チャンクごとに変換してメモリーエラーを防ぐ
    let base64 = '';
    const chunkSize = 0x8000; // 32KB chunks
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      base64 += String.fromCharCode.apply(null, Array.from(chunk));
    }
    base64 = btoa(base64);

    // プログレスのシミュレーション（Tauri版は実際のプログレスを取得できないため）
    if (onProgress) {
      onProgress(50);
    }

    const baseUrl = normalizeBaseUrl(connection.baseUrl);
    const safeAdditionalHeaders = filterForbiddenHeaders(
      connection.additionalHeaders,
      (name) => console.warn(`[VectorStore] Forbidden header dropped: ${name}`),
    );

    // Tauri経由でファイルをアップロード
    try {
      const response = await invoke('proxy_file_upload', {
        request: {
          base_url: baseUrl,
          api_key: connection.apiKey,
          file_data: base64,
          file_name: file.name,
          purpose: "assistants",
          additional_headers: safeAdditionalHeaders,
          proxy_config: {
            http_proxy: connection.httpProxy,
            https_proxy: connection.httpsProxy,
          },
        },
      });

      if (onProgress) {
        onProgress(100);
      }

      const result = JSON.parse((response as any).body);
      if ((response as any).status >= 400) {
        const errorMsg = result.error?.message || "File upload failed";
        console.error('[Tauri] File upload failed:', errorMsg, result);
        await saveLog('error', 'api', `Tauri file upload failed: ${errorMsg}`, undefined, {
          status: (response as any).status,
          fileName: file.name,
          result,
        });
        throw new Error(errorMsg);
      }

      if (!result.id) {
        console.error('[Tauri] File upload response missing id:', result);
        await saveLog('error', 'api', 'Tauri file upload response missing id', undefined, {
          fileName: file.name,
          result,
        });
        throw new Error("ファイルアップロードのレスポンスにIDがありません");
      }

      return result.id;
    } catch (error) {
      console.error('[Tauri] File upload error:', error);
      await saveLog('error', 'api', 'Tauri file upload error', error instanceof Error ? error : undefined, {
        fileName: file.name,
        errorType: typeof error,
      });
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`ファイルアップロードに失敗しました: ${String(error)}`);
    }
  } else {
    // ブラウザ環境: XMLHttpRequestを使用
    const baseUrl = normalizeBaseUrl(connection.baseUrl);
    const url = `${baseUrl}/files`;
    const safeAdditionalHeaders = filterForbiddenHeaders(
      connection.additionalHeaders,
      (name) => console.warn(`[VectorStore] Forbidden header dropped: ${name}`),
    );

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

      if (safeAdditionalHeaders) {
        Object.entries(safeAdditionalHeaders).forEach(([key, value]) => {
          xhr.setRequestHeader(key, value);
        });
      }

      xhr.send(formData);
    });
  }
}

export async function attachFileToVectorStore(
  vectorStoreId: string,
  fileId: string,
  connectionOverride?: ConnectionSettings,
): Promise<void> {
  const connection = ensureConnection(
    connectionOverride ?? (await loadConnection()),
  );
  const baseUrl = normalizeBaseUrl(connection.baseUrl);
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
  options?: VectorStoreOptions,
): Promise<void> {
  const connection = ensureConnection(
    options?.connectionOverride ?? (await loadConnection()),
  );
  const baseUrl = normalizeBaseUrl(connection.baseUrl);
  const url = `${baseUrl}/vector_stores/${vectorStoreId}`;

  const body: Record<string, unknown> = { name };

  if (typeof description !== "undefined") {
    if (description) {
      body.metadata = { description };
    } else {
      body.metadata = {};
    }
  }

  if (options) {
    if (options.expiresAfterDays === null) {
      body.expires_after = null;
    } else if (typeof options.expiresAfterDays === "number") {
      body.expires_after = {
        anchor: "last_active_at",
        days: options.expiresAfterDays,
      };
    }
  }

  const response = await fetch(url, {
    method: "POST",
    headers: buildRequestHeaders(
      {
        Authorization: `Bearer ${connection.apiKey}`,
        "Content-Type": "application/json",
      },
      connection.additionalHeaders,
    ),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`OpenAI API エラー: HTTP ${response.status} ${message}`.trim());
  }
}

/**
 * Vector Storeのファイルインデックス化が完了するまで待機
 * @param vectorStoreId Vector Store ID
 * @param connectionOverride 接続設定（オプション）
 * @param onProgress 進捗コールバック（オプション）
 * @param maxWaitSeconds 最大待機時間（秒、デフォルト: 300秒 = 5分）
 * @returns 完了したファイル数
 */
export async function waitForVectorStoreReady(
  vectorStoreId: string,
  connectionOverride?: ConnectionSettings,
  onProgress?: (status: { completed: number; inProgress: number; failed: number }) => void,
  maxWaitSeconds: number = 300,
): Promise<number> {
  const connection = ensureConnection(connectionOverride ?? (await loadConnection()));
  const startTime = Date.now();
  const pollIntervalMs = 2000; // 2秒ごとにポーリング

  while (true) {
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    if (elapsedSeconds > maxWaitSeconds) {
      throw new Error(`Vector Storeのインデックス化がタイムアウトしました（${maxWaitSeconds}秒）`);
    }

    const files = await fetchVectorStoreFiles(vectorStoreId, connection);
    const completed = files.filter(f => f.status === "completed").length;
    const inProgress = files.filter(f => f.status === "in_progress").length;
    const failed = files.filter(f => f.status === "failed").length;

    if (onProgress) {
      onProgress({ completed, inProgress, failed });
    }

    // すべてのファイルが完了または失敗した場合
    if (inProgress === 0) {
      if (failed > 0) {
        const failedFiles = files.filter(f => f.status === "failed");
        const errorMessages = failedFiles.map(f => f.error).filter(Boolean).join(", ");
        throw new Error(`${failed}件のファイルのインデックス化に失敗しました: ${errorMessages}`);
      }
      return completed;
    }

    // 次のポーリングまで待機
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
}
