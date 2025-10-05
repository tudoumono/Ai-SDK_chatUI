export type StoragePolicy = "none" | "session" | "persistent";

export type ConversationRecord = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  tags: string[];
  summary?: string;
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
};
