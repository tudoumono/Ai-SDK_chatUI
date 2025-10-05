export type StoragePolicy = "none" | "session" | "persistent";

export type ConversationRecord = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  tags: string[];
  summary?: string;
  modelId?: string;
  webSearchEnabled?: boolean;
  vectorSearchEnabled?: boolean;
  vectorStoreIds?: string[];
  encrypted?: boolean;
  isFavorite?: boolean;
  hasContent?: boolean;
};

export type MessageRole = "system" | "user" | "assistant" | "tool";

export type MessagePart =
  | { type: "text"; text: string }
  | {
      type: "source";
      title: string;
      url?: string;
      snippet?: string;
      sourceType: "vector" | "web" | "attachment";
      vectorStoreId?: string;
      fileId?: string;
    };

export type MessageRecord = {
  id: string;
  conversationId: string;
  role: MessageRole;
  parts: MessagePart[];
  createdAt: string;
  updatedAt: string;
  status: "pending" | "complete" | "error";
  isSummary?: boolean;
  errorMessage?: string;
};

export type AttachmentRecord = {
  id: string;
  conversationId: string;
  kind: "file" | "image" | "audio";
  label: string;
  createdAt: string;
  updatedAt: string;
  vectorStoreId?: string;
  fileId?: string;
  url?: string;
  transient?: boolean;
};

export type VectorStoreRecord = {
  id: string;
  name: string;
  fileCount: number;
  updatedAt: string;
  description?: string;
};

export type ExportBundle = {
  schemaVersion: 1;
  exportedAt: string;
  conversations: ConversationRecord[];
  vectorStores: VectorStoreRecord[];
  messages?: MessageRecord[];
  attachments?: AttachmentRecord[];
};
