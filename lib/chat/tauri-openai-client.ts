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
        console.log('[Tauri] ===== responses.stream called =====');
        console.log('[Tauri] Request params:', JSON.stringify(params, null, 2));

        // 非ストリーミングAPIを呼び出し
        const response = await makeTauriOpenAIRequest(
          connection,
          "POST",
          "/responses",
          params
        );

        console.log('[Tauri] ===== Response received =====');
        console.log('[Tauri] Response keys:', Object.keys(response));
        console.log('[Tauri] Response:', JSON.stringify(response, null, 2));

        // レスポンスからテキストを抽出
        // 新しいAPI構造: response.output[0].content[0].text
        let outputText = "";

        if (response.output && Array.isArray(response.output) && response.output.length > 0) {
          const firstOutput = response.output[0];
          if (firstOutput.type === "message" && firstOutput.content && Array.isArray(firstOutput.content)) {
            for (const content of firstOutput.content) {
              if (content.type === "output_text" && content.text) {
                outputText += content.text;
              }
            }
          }
        }

        // 古い構造もサポート（後方互換性）
        if (!outputText && response.output_text) {
          outputText = response.output_text;
        }

        console.log('[Tauri] Extracted output text length:', outputText.length);
        console.log('[Tauri] Output text preview:', outputText.substring(0, 100));

        // AsyncIterableIteratorをエミュレート
        const events: any[] = [];

        // テキストをチャンクに分割してイベントを生成
        const chunkSize = 5; // 5文字ずつ送信

        if (outputText.length > 0) {
          for (let i = 0; i < outputText.length; i += chunkSize) {
            const delta = outputText.slice(i, i + chunkSize);
            events.push({
              type: "response.output_text.delta",
              delta: delta
            });
          }
        }

        console.log('[Tauri] Generated', events.length, 'delta events');

        // AsyncIterableIteratorを実装
        const iterator = {
          [Symbol.asyncIterator]() {
            let index = 0;
            console.log('[Tauri] AsyncIterator created');
            return {
              async next() {
                if (index < events.length) {
                  const event = events[index++];
                  console.log(`[Tauri] Yielding event ${index}/${events.length}:`, event.type);
                  return { value: event, done: false };
                }
                console.log('[Tauri] Iterator completed');
                return { value: undefined, done: true };
              }
            };
          },
          async finalResponse() {
            console.log('[Tauri] finalResponse() called');
            return response;
          }
        };

        console.log('[Tauri] Returning stream iterator');
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
      async create(params: any) {
        const { file, purpose } = params;

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

        // Tauri経由でファイルをアップロード
        const response = await invoke('proxy_file_upload', {
          request: {
            base_url: normalizeBaseUrl(connection.baseUrl),
            api_key: connection.apiKey,
            file_data: base64,
            file_name: file.name,
            purpose: purpose,
            additional_headers: connection.additionalHeaders,
            proxy_config: {
              http_proxy: connection.httpProxy,
              https_proxy: connection.httpsProxy,
            },
          },
        });

        const result = JSON.parse((response as OpenAIResponse).body);
        if ((response as OpenAIResponse).status >= 400) {
          throw new Error(result.error?.message || "File upload failed");
        }

        return result;
      },
      async delete(fileId: string) {
        return makeTauriOpenAIRequest(
          connection,
          "DELETE",
          `/files/${fileId}`
        );
      },
    },
  };
}
