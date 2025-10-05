import {
  deleteConversation as deleteConversationFromDb,
  getAllConversations,
  getMessages,
  upsertConversations,
  upsertMessages,
  pruneExpiredConversations,
  clearConversationHistory as clearConversationHistoryFromDb,
} from "@/lib/storage/indexed-db";
import type {
  ConversationRecord,
  MessageRecord,
} from "@/lib/storage/schema";

function nowIso() {
  return new Date().toISOString();
}

function createConversationId() {
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createConversationDraft(title?: string): ConversationRecord {
  const timestamp = nowIso();
  return {
    id: createConversationId(),
    title: title?.trim() || "新規チャット",
    createdAt: timestamp,
    updatedAt: timestamp,
    tags: [],
    modelId: "gpt-4.1-mini",
    webSearchEnabled: false,
    vectorStoreIds: [],
    isFavorite: false,
    hasContent: false,
  };
}

export async function ensureConversation(conversation?: ConversationRecord | null) {
  if (conversation) {
    return conversation;
  }
  const existing = await getAllConversations();
  if (existing.length > 0) {
    return existing[0];
  }
  const draft = createConversationDraft();
  await upsertConversations([draft]);
  return draft;
}

export async function loadConversationMessages(conversationId: string) {
  if (!conversationId) {
    return [];
  }
  return getMessages(conversationId);
}

export async function saveMessages(records: MessageRecord[]) {
  await upsertMessages(records);
}

export async function touchConversation(
  record: ConversationRecord,
  updates: Partial<ConversationRecord>,
  preserveUpdatedAt = false,
): Promise<ConversationRecord> {
  const next: ConversationRecord = {
    ...record,
    ...updates,
    updatedAt: preserveUpdatedAt ? record.updatedAt : nowIso(),
  };
  await upsertConversations([next]);
  return next;
}

export async function listConversations() {
  return getAllConversations();
}

export async function pruneConversationsOlderThan(days: number) {
  if (Number.isNaN(days) || days <= 0) {
    return 0;
  }
  if (typeof window === "undefined") {
    return 0;
  }
  const milliseconds = Math.floor(days * 24 * 60 * 60 * 1000);
  return pruneExpiredConversations(milliseconds);
}

export async function saveConversation(record: ConversationRecord) {
  await upsertConversations([record]);
}

export async function deleteConversation(conversationId: string) {
  await deleteConversationFromDb(conversationId);
}

export async function clearConversationHistory() {
  await clearConversationHistoryFromDb();
}
