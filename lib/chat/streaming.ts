import type { Response } from "openai/resources/responses/responses";
import type { ConnectionSettings } from "@/lib/settings/connection-storage";
import type { MessagePart, MessageRecord } from "@/lib/storage/schema";
import { createResponsesClient } from "./openai-client";
import { saveLog } from "@/lib/logging/error-logger";

export type StreamCallbacks = {
  onTextSnapshot?: (text: string) => void;
  onStatusChange?: (status: string) => void;
};

export type FileAttachment = {
  fileId: string;
  tools: Array<{ type: 'file_search' | 'code_interpreter' }>;
};

export type StreamRequest = {
  connection: ConnectionSettings;
  model: string;
  messages: MessageRecord[];
  vectorStoreIds?: string[];
  webSearchEnabled?: boolean;
  abortSignal?: AbortSignal;
  maxOutputTokens?: number;
  attachments?: FileAttachment[];
  systemRole?: string;
};

export type StreamResult = {
  responseId: string;
  text: string;
  sources: MessagePart[];
  rawResponse: Response;
  usedTools: string[];
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

function toInputMessages(
  messages: MessageRecord[],
  attachments?: FileAttachment[],
  systemRole?: string
) {
  // メッセージ履歴を制限（直近100件まで）
  const MAX_HISTORY_MESSAGES = 100;
  const recentMessages = messages.length > MAX_HISTORY_MESSAGES
    ? messages.slice(-MAX_HISTORY_MESSAGES)
    : messages;

  const result = recentMessages
    .map((message) => {
      if (message.role === "tool") {
        return null;
      }
      const textParts = message.parts.filter((part) => part.type === "text");
      if (textParts.length === 0) {
        return null;
      }
      const text = textParts.map((part) => part.text).join("\n\n");
      return {
        type: "message" as const,
        role: (message.role === "system" ? "system" : message.role) as
          | "user"
          | "assistant"
          | "system"
          | "developer",
        content: text,
      };
    })
    .filter((item): item is {
      type: "message";
      role: "user" | "assistant" | "system" | "developer";
      content: string;
    } => item !== null);

  // systemRoleが設定されている場合、先頭に追加
  if (systemRole && systemRole.trim()) {
    result.unshift({
      type: "message" as const,
      role: "system" as const,
      content: systemRole.trim(),
    });
  }

  // 最後のユーザーメッセージにファイルを添付
  if (attachments && attachments.length > 0 && result.length > 0) {
    const lastUserIndex = result.map(m => m.role).lastIndexOf("user");
    if (lastUserIndex !== -1) {
      const lastMessage = result[lastUserIndex];
      const contentParts: any[] = [
        { type: "input_text", text: lastMessage.content }
      ];

      // ファイルIDを追加（画像とドキュメントで異なるtypeを使用）
      for (const att of attachments) {
        if (att.tools.length === 0) {
          // Vision用（画像ファイル）- ツールなし
          contentParts.push({
            type: "input_image",
            file_id: att.fileId,
          });
        } else {
          // file_search/code_interpreter用（ドキュメントファイル）
          contentParts.push({
            type: "input_file",
            file_id: att.fileId,
          });
        }
      }

      result[lastUserIndex] = {
        ...lastMessage,
        content: contentParts,
      } as any;
    }
  }

  return result;
}

function buildTools(vectorStoreIds?: string[], webSearchEnabled?: boolean): any {
  const tools: any[] = [];
  if (vectorStoreIds && vectorStoreIds.length > 0) {
    console.log('[buildTools] Adding file_search with vector_store_ids:', vectorStoreIds);
    tools.push({
      type: "file_search",
      vector_store_ids: vectorStoreIds.slice(0, 3)
    });
  }
  if (webSearchEnabled) {
    console.log('[buildTools] Adding web_search');
    tools.push({ type: "web_search" });
  }
  const result = tools.length > 0 ? tools : undefined;
  console.log('[buildTools] Final tools:', result);
  return result;
}

function extractSources(response: Response): MessagePart[] {
  const parts: MessagePart[] = [];
  for (const item of response.output ?? []) {
    if (item.type === "file_search_call" && item.results) {
      for (const result of item.results ?? []) {
        if (!result) continue;
        parts.push({
          type: "source",
          sourceType: "vector",
          title: result.filename ?? result.file_id ?? "Vector Store Result",
          snippet: typeof result.text === "string" ? result.text : undefined,
          fileId: result.file_id ?? undefined,
        });
      }
    }
    if (item.type === "web_search_call") {
      parts.push({
        type: "source",
        sourceType: "web",
        title: "Web Search",
        url: undefined,
      });
    }
  }
  return parts;
}

export async function streamAssistantResponse(
  request: StreamRequest,
  callbacks: StreamCallbacks = {},
): Promise<StreamResult> {
  try {
    const client = createResponsesClient(request.connection);
    const input = toInputMessages(request.messages, request.attachments, request.systemRole);
    if (input.length === 0) {
      throw new Error("送信するメッセージがありません。");
    }

  // 初期状態
  if (request.vectorStoreIds && request.vectorStoreIds.length > 0 && request.webSearchEnabled) {
    callbacks.onStatusChange?.("Vector検索とWeb検索を準備中…");
  } else if (request.vectorStoreIds && request.vectorStoreIds.length > 0) {
    callbacks.onStatusChange?.("Vector検索中…");
  } else if (request.webSearchEnabled) {
    callbacks.onStatusChange?.("Web検索中…");
  } else if (request.attachments && request.attachments.length > 0) {
    callbacks.onStatusChange?.("添付ファイルを処理中…");
  } else {
    callbacks.onStatusChange?.("応答を生成中…");
  }

  console.log('[streaming] Creating stream with params:', {
    model: request.model,
    inputLength: input.length,
    tools: buildTools(request.vectorStoreIds, request.webSearchEnabled),
    maxOutputTokens: request.maxOutputTokens
  });

  const stream = await client.responses.stream(
    {
      model: request.model,
      input,
      tools: buildTools(request.vectorStoreIds, request.webSearchEnabled),
      max_output_tokens: request.maxOutputTokens,
    } as any,
    { signal: request.abortSignal },
  );

  console.log('[streaming] Stream created, starting iteration');

  // 文字列結合の最適化：配列を使用
  const chunks: string[] = [];
  let hasSeenFileSearch = false;
  let hasSeenWebSearch = false;
  let eventCount = 0;

  for await (const event of stream) {
    eventCount++;
    console.log(`[streaming] Event #${eventCount}:`, event.type);
    // ツール実行の検出
    if (event.type === "response.output_item.added" && event.item) {
      if (event.item.type === "file_search_call") {
        hasSeenFileSearch = true;
        callbacks.onStatusChange?.("Vector Store検索中…");
      } else if (event.item.type === "web_search_call") {
        hasSeenWebSearch = true;
        callbacks.onStatusChange?.("Web検索中…");
      }
    }

    // ツール完了の検出
    if (event.type === "response.output_item.done" && event.item) {
      if (event.item.type === "file_search_call" && hasSeenFileSearch) {
        callbacks.onStatusChange?.("Vector Store検索完了、応答を生成中…");
      } else if (event.item.type === "web_search_call" && hasSeenWebSearch) {
        callbacks.onStatusChange?.("Web検索完了、応答を生成中…");
      }
    }

    // テキスト生成開始
    if (event.type === "response.output_text.delta") {
      if (chunks.length === 0) {
        callbacks.onStatusChange?.("応答を生成中…");
      }
      const delta = event.delta ?? "";
      console.log(`[streaming] Received delta (${delta.length} chars):`, delta);
      chunks.push(delta);
      // 配列を結合して現在のスナップショットを作成
      const currentText = chunks.join("");
      console.log(`[streaming] Total text so far: ${currentText.length} chars`);
      callbacks.onTextSnapshot?.(currentText);
    }

    if (event.type === "error") {
      const errorMessage = "error" in event && event.error && typeof event.error === "object" && "message" in event.error
        ? (event.error as any).message
        : "Responses API error";
      throw new Error(errorMessage);
    }
  }

  console.log(`[streaming] Loop completed. Total events: ${eventCount}, chunks collected: ${chunks.length}`);
  console.log('[streaming] Getting final response...');

  const finalResponse = await stream.finalResponse();
  console.log('[streaming] Final response received:', finalResponse);

  const rawResponse = finalResponse as Response;

  // テキストを抽出（chunksから、または finalResponse から）
  let text = chunks.join("");

  // chunksが空の場合、finalResponseから抽出を試みる
  if (!text && rawResponse.output_text) {
    text = rawResponse.output_text;
  }

  // 新しいAPI構造からも抽出を試みる
  if (!text && (rawResponse as any).output && Array.isArray((rawResponse as any).output)) {
    const output = (rawResponse as any).output;
    if (output.length > 0 && output[0].type === "message" && output[0].content) {
      for (const content of output[0].content) {
        if (content.type === "output_text" && content.text) {
          text += content.text;
        }
      }
    }
  }

  console.log(`[streaming] Final text length: ${text.length}`);
  console.log(`[streaming] Final text preview:`, text.substring(0, 100));

  const sources = extractSources(rawResponse);
  console.log(`[streaming] Extracted ${sources.length} sources`);

  // 使用したツールを抽出
  const usedTools: string[] = [];
  for (const item of rawResponse.output ?? []) {
    if (item.type === "file_search_call") {
      if (!usedTools.includes("Vector Store")) {
        usedTools.push("Vector Store");
      }
    }
    if (item.type === "web_search_call") {
      if (!usedTools.includes("Web Search")) {
        usedTools.push("Web Search");
      }
    }
  }

  // トークン使用量を抽出
  let tokenUsage: StreamResult["tokenUsage"];
  if (rawResponse.usage) {
    tokenUsage = {
      promptTokens: rawResponse.usage.input_tokens || 0,
      completionTokens: rawResponse.usage.output_tokens || 0,
      totalTokens: rawResponse.usage.total_tokens || 0,
    };
  }

    return {
      responseId: rawResponse.id,
      text,
      sources,
      rawResponse,
      usedTools,
      tokenUsage,
    };
  } catch (error) {
    // Responses API呼び出しエラーをログに記録
    console.error('[streaming] Error in streamAssistantResponse:', error);

    // エラーの詳細情報を収集
    const errorDetails: Record<string, unknown> = {
      model: request.model,
      hasAttachments: !!request.attachments && request.attachments.length > 0,
      attachmentCount: request.attachments?.length || 0,
      vectorStoreIds: request.vectorStoreIds,
      vectorStoreCount: request.vectorStoreIds?.length || 0,
      webSearchEnabled: request.webSearchEnabled,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorType: typeof error,
    };

    await saveLog(
      'error',
      'api',
      'Responses API call failed',
      error instanceof Error ? error : undefined,
      errorDetails
    );

    // エラーを再スロー
    throw error;
  }
}
