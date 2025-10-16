import { invoke } from "@tauri-apps/api/core";
import type { ConnectionSettings } from "@/lib/settings/connection-storage";

function normalizeBaseUrl(url: string | undefined) {
  const trimmed = (url ?? "").trim();
  if (!trimmed) {
    return "https://api.openai.com/v1";
  }
  return trimmed.replace(/\/$/, "");
}

interface ProxyConfig {
  http_proxy?: string;
  https_proxy?: string;
}

interface OpenAIRequest {
  base_url: string;
  api_key: string;
  method: string;
  path: string;
  body?: any;
  additional_headers?: Record<string, string>;
  proxy_config?: ProxyConfig;
}

interface OpenAIResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export async function makeTauriOpenAIRequest(
  connection: ConnectionSettings,
  method: string,
  path: string,
  body?: any
): Promise<any> {
  if (!connection.apiKey) {
    throw new Error("API キーが見つかりません。G0 で接続設定を保存してください。");
  }

  const request: OpenAIRequest = {
    base_url: normalizeBaseUrl(connection.baseUrl),
    api_key: connection.apiKey,
    method,
    path,
    body,
    additional_headers: connection.additionalHeaders,
    proxy_config: {
      http_proxy: connection.httpProxy,
      https_proxy: connection.httpsProxy,
    },
  };

  try {
    console.log(`[Tauri] Making ${method} request to ${path}`);
    if (request.proxy_config?.http_proxy || request.proxy_config?.https_proxy) {
      console.log(`[Tauri] Using proxy - HTTP: ${request.proxy_config.http_proxy || 'none'}, HTTPS: ${request.proxy_config.https_proxy || 'none'}`);
    } else {
      console.log(`[Tauri] Direct connection (no proxy)`);
    }

    const response = await invoke<OpenAIResponse>("proxy_openai_request", {
      request,
    });

    console.log(`[Tauri] Response status: ${response.status}`);

    if (response.status >= 400) {
      const errorMessage = `OpenAI API error (${response.status}): ${response.body}`;
      console.error(`[Tauri] ${errorMessage}`);
      throw new Error(errorMessage);
    }

    console.log(`[Tauri] Request completed successfully`);
    return JSON.parse(response.body);
  } catch (error) {
    console.error(`[Tauri] Request failed:`, error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to communicate with OpenAI: ${error}`);
  }
}

// OpenAI SDK互換のクライアントインターフェース
export function createTauriResponsesClient(connection: ConnectionSettings) {
  return {
    models: {
      async list() {
        const data = await makeTauriOpenAIRequest(connection, "GET", "/models");
        return { data: data.data || [] };
      },
    },
    chat: {
      completions: {
        async create(params: any) {
          return makeTauriOpenAIRequest(
            connection,
            "POST",
            "/chat/completions",
            params
          );
        },
      },
    },
    responses: {
      async create(params: any) {
        return makeTauriOpenAIRequest(
          connection,
          "POST",
          "/responses",
          params
        );
      },
    },
    vectorStores: {
      async list() {
        const data = await makeTauriOpenAIRequest(
          connection,
          "GET",
          "/vector_stores"
        );
        return { data: data.data || [] };
      },
      async create(params: any) {
        return makeTauriOpenAIRequest(
          connection,
          "POST",
          "/vector_stores",
          params
        );
      },
      async del(vectorStoreId: string) {
        return makeTauriOpenAIRequest(
          connection,
          "DELETE",
          `/vector_stores/${vectorStoreId}`
        );
      },
      fileBatches: {
        async create(vectorStoreId: string, params: any) {
          return makeTauriOpenAIRequest(
            connection,
            "POST",
            `/vector_stores/${vectorStoreId}/file_batches`,
            params
          );
        },
      },
    },
    files: {
      async create(params: FormData) {
        throw new Error(
          "File upload via Tauri is not yet implemented. Use browser mode for file uploads."
        );
      },
      async del(fileId: string) {
        return makeTauriOpenAIRequest(
          connection,
          "DELETE",
          `/files/${fileId}`
        );
      },
    },
  };
}
