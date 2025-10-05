import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  type ConversationRecord,
  type VectorStoreRecord,
  type MessageRecord,
  type AttachmentRecord,
} from "./schema";

type ChatUiSchema = DBSchema & {
  conversations: {
    key: string;
    value: ConversationRecord;
    indexes: { "by-updated": string };
  };
  vectorStores: {
    key: string;
    value: VectorStoreRecord;
    indexes: { "by-updated": string };
  };
  messages: {
    key: string;
    value: MessageRecord;
    indexes: { "by-conversation": string; "by-created": string };
  };
  attachments: {
    key: string;
    value: AttachmentRecord;
    indexes: { "by-conversation": string };
  };
};

const DB_NAME = "ai-sdk-chat-ui";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<ChatUiSchema>> | null = null;

function createDbPromise() {
  if (!dbPromise) {
    dbPromise = openDB<ChatUiSchema>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("conversations")) {
          const store = database.createObjectStore("conversations", {
            keyPath: "id",
          });
          store.createIndex("by-updated", "updatedAt");
        }
        if (!database.objectStoreNames.contains("vectorStores")) {
          const store = database.createObjectStore("vectorStores", {
            keyPath: "id",
          });
          store.createIndex("by-updated", "updatedAt");
        }
        if (!database.objectStoreNames.contains("messages")) {
          const store = database.createObjectStore("messages", {
            keyPath: "id",
          });
          store.createIndex("by-conversation", "conversationId");
          store.createIndex("by-created", "createdAt");
        }
        if (!database.objectStoreNames.contains("attachments")) {
          const store = database.createObjectStore("attachments", {
            keyPath: "id",
          });
          store.createIndex("by-conversation", "conversationId");
        }
      },
    });
  }
  return dbPromise;
}

export async function getDatabase() {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is only available in the browser");
  }
  return createDbPromise();
}

export async function getAllConversations() {
  const db = await getDatabase();
  const items = await db.getAllFromIndex("conversations", "by-updated");
  return items.sort((a, b) =>
    a.updatedAt > b.updatedAt ? -1 : a.updatedAt < b.updatedAt ? 1 : 0,
  );
}

export async function getAllVectorStores() {
  const db = await getDatabase();
  const items = await db.getAllFromIndex("vectorStores", "by-updated");
  return items.sort((a, b) =>
    a.updatedAt > b.updatedAt ? -1 : a.updatedAt < b.updatedAt ? 1 : 0,
  );
}

export async function getConversation(id: string) {
  const db = await getDatabase();
  return db.get("conversations", id);
}

export async function getMessages(conversationId: string) {
  const db = await getDatabase();
  const index = db.transaction("messages").store.index("by-conversation");
  const items = await index.getAll(IDBKeyRange.only(conversationId));
  return items.sort((a, b) => {
    // 時刻で比較
    if (a.createdAt > b.createdAt) return 1;
    if (a.createdAt < b.createdAt) return -1;
    // 同じ時刻の場合、userが先、assistantが後
    if (a.role === "user" && b.role === "assistant") return -1;
    if (a.role === "assistant" && b.role === "user") return 1;
    return 0;
  });
}

export async function upsertMessages(records: MessageRecord[]) {
  if (records.length === 0) {
    return;
  }
  const db = await getDatabase();
  const tx = db.transaction("messages", "readwrite");
  await Promise.all(records.map((record) => tx.store.put(record)));
  await tx.done;
}

export async function deleteMessages(messageIds: string[]) {
  if (messageIds.length === 0) {
    return;
  }
  const db = await getDatabase();
  const tx = db.transaction("messages", "readwrite");
  await Promise.all(messageIds.map((id) => tx.store.delete(id)));
  await tx.done;
}

export async function deleteConversation(conversationId: string) {
  const db = await getDatabase();

  // 会話に関連するメッセージを削除
  const messages = await getMessages(conversationId);
  if (messages.length > 0) {
    const tx = db.transaction("messages", "readwrite");
    await Promise.all(messages.map((msg) => tx.store.delete(msg.id)));
    await tx.done;
  }

  // 添付ファイルを削除
  const attachments = await getAttachments(conversationId);
  if (attachments.length > 0) {
    const tx = db.transaction("attachments", "readwrite");
    await Promise.all(attachments.map((item) => tx.store.delete(item.id)));
    await tx.done;
  }

  // 会話を削除
  const convTx = db.transaction("conversations", "readwrite");
  await convTx.store.delete(conversationId);
  await convTx.done;
}

export async function pruneExpiredConversations(maxAgeMilliseconds: number) {
  const conversations = await getAllConversations();
  if (conversations.length === 0) {
    return 0;
  }

  const cutoff = Date.now() - maxAgeMilliseconds;
  const expired = conversations.filter((conversation) => {
    if (conversation.isFavorite) {
      return false;
    }
    const updatedTime = new Date(conversation.updatedAt).getTime();
    return Number.isFinite(updatedTime) && updatedTime < cutoff;
  });

  if (expired.length === 0) {
    return 0;
  }

  await Promise.all(expired.map((conversation) => deleteConversation(conversation.id)));
  return expired.length;
}

export async function upsertAttachments(records: AttachmentRecord[]) {
  if (records.length === 0) {
    return;
  }
  const db = await getDatabase();
  const tx = db.transaction("attachments", "readwrite");
  await Promise.all(records.map((record) => tx.store.put(record)));
  await tx.done;
}

export async function getAttachments(conversationId: string) {
  const db = await getDatabase();
  const index = db.transaction("attachments").store.index("by-conversation");
  return index.getAll(IDBKeyRange.only(conversationId));
}

export async function upsertConversations(records: ConversationRecord[]) {
  const db = await getDatabase();
  const tx = db.transaction("conversations", "readwrite");
  await Promise.all(records.map((record) => tx.store.put(record)));
  await tx.done;
}

export async function upsertVectorStores(records: VectorStoreRecord[]) {
  const db = await getDatabase();
  const tx = db.transaction("vectorStores", "readwrite");
  await Promise.all(records.map((record) => tx.store.put(record)));
  await tx.done;
}

export async function updateVectorStore(id: string, updates: Partial<VectorStoreRecord>) {
  const db = await getDatabase();
  const existing = await db.get("vectorStores", id);
  if (!existing) {
    throw new Error(`Vector store with id ${id} not found`);
  }
  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  const tx = db.transaction("vectorStores", "readwrite");
  await tx.store.put(updated);
  await tx.done;
}

export async function deleteVectorStore(id: string) {
  const db = await getDatabase();
  const tx = db.transaction("vectorStores", "readwrite");
  await tx.store.delete(id);
  await tx.done;
}

export async function replaceVectorStores(records: VectorStoreRecord[]) {
  const db = await getDatabase();

  // 既存のベクトルストアを取得してお気に入り情報を保持
  const existing = await db.getAll("vectorStores");
  const existingMap = new Map(existing.map((store) => [store.id, store]));

  // マージ: リモートのデータを基本とし、ローカルのお気に入り情報を保持
  const merged = records.map((remoteStore) => {
    const localStore = existingMap.get(remoteStore.id);
    return {
      ...remoteStore,
      isFavorite: localStore?.isFavorite ?? remoteStore.isFavorite,
    };
  });

  const tx = db.transaction("vectorStores", "readwrite");
  await tx.store.clear();
  await Promise.all(merged.map((record) => tx.store.put(record)));
  await tx.done;
}

export async function clearAll() {
  const db = await getDatabase();
  await Promise.all([
    db.clear("conversations"),
    db.clear("vectorStores"),
    db.clear("messages"),
    db.clear("attachments"),
  ]);
}

export async function clearConversationHistory() {
  const db = await getDatabase();
  await Promise.all([
    db.clear("conversations"),
    db.clear("messages"),
    db.clear("attachments"),
  ]);
}
