import { type MessagePart, type MessageRecord, type AttachedFileInfo } from "@/lib/storage/schema";

function nowIso() {
  return new Date().toISOString();
}

export function createMessageId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createUserMessage(
  conversationId: string,
  text: string,
  attachedFiles?: AttachedFileInfo[]
): MessageRecord {
  const timestamp = nowIso();
  return {
    id: createMessageId(),
    conversationId,
    role: "user",
    parts: [{ type: "text", text }],
    createdAt: timestamp,
    updatedAt: timestamp,
    status: "complete",
    attachedFiles,
  };
}

export function createAssistantDraft(conversationId: string): MessageRecord {
  const timestamp = nowIso();
  return {
    id: createMessageId(),
    conversationId,
    role: "assistant",
    parts: [{ type: "text", text: "" }],
    createdAt: timestamp,
    updatedAt: timestamp,
    status: "pending",
  };
}

export function withAssistantText(
  message: MessageRecord,
  text: string,
  status: MessageRecord["status"],
  errorMessage?: string,
  sources?: MessagePart[],
  usedTools?: string[],
  errorDetails?: string,
  tokenUsage?: MessageRecord["tokenUsage"],
): MessageRecord {
  const nextParts: MessagePart[] = [{ type: "text", text }];
  if (sources && sources.length > 0) {
    nextParts.push(...sources);
  }
  return {
    ...message,
    parts: nextParts,
    status,
    errorMessage,
    errorDetails,
    usedTools,
    tokenUsage,
    updatedAt: nowIso(),
  };
}
