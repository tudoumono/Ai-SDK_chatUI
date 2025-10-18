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
      // ストリーミングをエミュレート（非ストリーミングAPIを使用）
      async stream(params: any, options?: any) {
        console.log('[Tauri] responses.stream called - using non-streaming fallback');

        // 非ストリーミングAPIを呼び出し
        const response = await makeTauriOpenAIRequest(
          connection,
          "POST",
          "/responses",
          params
        );

        console.log('[Tauri] Response received, creating stream emulator');

        // AsyncIterableIteratorをエミュレート
        const events: any[] = [];

        // response.output_textをチャンクに分割してイベントを生成
        const outputText = response.output_text || "";
        const chunkSize = 5; // 5文字ずつ送信

        for (let i = 0; i < outputText.length; i += chunkSize) {
          const delta = outputText.slice(i, i + chunkSize);
          events.push({
            type: "response.output_text.delta",
            delta: delta
          });
        }

        // 最終イベント
        events.push({
          type: "response.done",
          response: response
        });

        // AsyncIterableIteratorを実装
        const iterator = {
          [Symbol.asyncIterator]() {
            let index = 0;
            return {
              async next() {
                if (index < events.length) {
                  return { value: events[index++], done: false };
                }
                return { value: undefined, done: true };
              }
            };
          },
          async finalResponse() {
            return response;
          }
        };

        return iterator;
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
