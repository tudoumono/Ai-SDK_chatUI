import type { Response } from "openai/resources/responses/responses";
import type { ConnectionSettings } from "@/lib/settings/connection-storage";
import type { MessagePart, MessageRecord } from "@/lib/storage/schema";
import { createResponsesClient } from "./openai-client";

export type StreamCallbacks = {
  onTextSnapshot?: (text: string) => void;
};

export type StreamRequest = {
  connection: ConnectionSettings;
  model: string;
  messages: MessageRecord[];
  vectorStoreIds?: string[];
  webSearchEnabled?: boolean;
  abortSignal?: AbortSignal;
  maxOutputTokens?: number;
};

export type StreamResult = {
  responseId: string;
  text: string;
  sources: MessagePart[];
  rawResponse: Response;
};

function toInputMessages(messages: MessageRecord[]) {
  return messages
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
}

function buildTools(vectorStoreIds?: string[], webSearchEnabled?: boolean): any {
  const tools: any[] = [];
  if (vectorStoreIds && vectorStoreIds.length > 0) {
    tools.push({
      type: "file_search",
      vector_store_ids: vectorStoreIds.slice(0, 3)
    });
  }
  if (webSearchEnabled) {
    tools.push({ type: "web_search" });
  }
  return tools.length > 0 ? tools : undefined;
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
  const client = createResponsesClient(request.connection);
  const input = toInputMessages(request.messages);
  if (input.length === 0) {
    throw new Error("送信するメッセージがありません。");
  }
  const stream = await client.responses.stream(
    {
      model: request.model,
      input,
      tools: buildTools(request.vectorStoreIds, request.webSearchEnabled),
      max_output_tokens: request.maxOutputTokens,
    },
    { signal: request.abortSignal },
  );

  let snapshot = "";
  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      snapshot = snapshot + (event.delta ?? "");
      callbacks.onTextSnapshot?.(snapshot);
    }
    if (event.type === "error") {
      const errorMessage = "error" in event && event.error && typeof event.error === "object" && "message" in event.error
        ? (event.error as any).message
        : "Responses API error";
      throw new Error(errorMessage);
    }
  }

  const finalResponse = await stream.finalResponse();
  const rawResponse = finalResponse as Response;
  const text = rawResponse.output_text ?? snapshot;
  const sources = extractSources(rawResponse);

  return {
    responseId: rawResponse.id,
    text,
    sources,
    rawResponse,
  };
}
