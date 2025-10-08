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
  systemRoleEnabled?: boolean;
  systemRole?: string;
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

export type AttachedFileInfo = {
  fileName: string;
  fileSize: number;
  fileId?: string;
  purpose?: 'vision' | 'assistants';
};

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cumulativeTotal?: number; // その時点での会話全体の累計トークン数
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
  errorDetails?: string;
  usedTools?: string[];
  attachedFiles?: AttachedFileInfo[];
  tokenUsage?: TokenUsage;
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
  createdAt: string;
  lastActiveAt?: string;
  description?: string;
  isFavorite?: boolean;
  expiresAfter?: {
    anchor: "last_active_at" | "created_at";
    days: number | null;
  } | null;
  expiresAt?: string | null;
};

export type ExportBundle = {
  schemaVersion: 1;
  exportedAt: string;
  conversations: ConversationRecord[];
  vectorStores: VectorStoreRecord[];
  messages?: MessageRecord[];
  attachments?: AttachmentRecord[];
};
