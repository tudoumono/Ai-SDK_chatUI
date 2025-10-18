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
  settings: {
    key: string;
    value: { key: string; value: string };
  };
};

const DB_NAME = "ai-sdk-chat-ui";
const DB_VERSION = 4;

let dbPromise: Promise<IDBPDatabase<ChatUiSchema>> | null = null;

function createDbPromise() {
  if (!dbPromise) {
    dbPromise = openDB<ChatUiSchema>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion, newVersion, transaction) {
        // Conversations store
        if (!database.objectStoreNames.contains("conversations")) {
          const store = database.createObjectStore("conversations", {
            keyPath: "id",
          });
          store.createIndex("by-updated", "updatedAt");
        }

        // Vector stores
        if (!database.objectStoreNames.contains("vectorStores")) {
          const store = database.createObjectStore("vectorStores", {
            keyPath: "id",
          });
          store.createIndex("by-updated", "updatedAt");
        }

        // Messages store with optimized indexes
        if (!database.objectStoreNames.contains("messages")) {
          const messagesStore = database.createObjectStore("messages", {
            keyPath: "id",
          });
          messagesStore.createIndex("by-conversation", "conversationId");
          messagesStore.createIndex("by-created", "createdAt");
        }

        // Attachments store
        if (!database.objectStoreNames.contains("attachments")) {
          const store = database.createObjectStore("attachments", {
            keyPath: "id",
          });
          store.createIndex("by-conversation", "conversationId");
        }

        // Settings store
        if (!database.objectStoreNames.contains("settings")) {
          database.createObjectStore("settings", {
            keyPath: "key",
          });
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
  // インデックスから取得したデータは既にソート済みなので、逆順にするだけ
  return items.reverse();
}

export async function getAllVectorStores() {
  const db = await getDatabase();
  const items = await db.getAllFromIndex("vectorStores", "by-updated");
  // インデックスから取得したデータは既にソート済みなので、逆順にするだけ
  return items.reverse();
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

// 検索用の軽量メッセージ取得（テキストのみ）
export async function searchMessagesText(
  conversationId: string,
  searchTerm: string,
  limit = 1
): Promise<Array<{ id: string; text: string; createdAt: string }>> {
  const db = await getDatabase();
  const index = db.transaction("messages").store.index("by-conversation");
  const items = await index.getAll(IDBKeyRange.only(conversationId));

  const normalizedSearch = searchTerm.toLowerCase();
  const matches: Array<{ id: string; text: string; createdAt: string }> = [];

  for (const item of items) {
    if (matches.length >= limit) break;

    for (const part of item.parts) {
      if (part.type === "text" && part.text.toLowerCase().includes(normalizedSearch)) {
        matches.push({
          id: item.id,
          text: part.text,
          createdAt: item.createdAt,
        });
        break;
      }
    }
  }

  return matches;
}

// ページネーション対応のメッセージ取得
export async function getMessagesPaginated(
  conversationId: string,
  options: {
    limit?: number;
    beforeMessageId?: string;
    afterMessageId?: string;
  } = {}
) {
  const db = await getDatabase();
  const index = db.transaction("messages").store.index("by-conversation");
  const allItems = await index.getAll(IDBKeyRange.only(conversationId));

  // 時刻でソート
  const sorted = allItems.sort((a, b) => {
    if (a.createdAt > b.createdAt) return 1;
    if (a.createdAt < b.createdAt) return -1;
    if (a.role === "user" && b.role === "assistant") return -1;
    if (a.role === "assistant" && b.role === "user") return 1;
    return 0;
  });

  // beforeMessageId が指定されている場合、そのメッセージより前を取得
  if (options.beforeMessageId) {
    const beforeIndex = sorted.findIndex(m => m.id === options.beforeMessageId);
    if (beforeIndex > 0) {
      const start = Math.max(0, beforeIndex - (options.limit || 30));
      return {
        messages: sorted.slice(start, beforeIndex),
        hasMore: start > 0,
        totalCount: sorted.length,
      };
    }
  }

  // afterMessageId が指定されている場合、そのメッセージより後を取得
  if (options.afterMessageId) {
    const afterIndex = sorted.findIndex(m => m.id === options.afterMessageId);
    if (afterIndex >= 0 && afterIndex < sorted.length - 1) {
      const end = Math.min(sorted.length, afterIndex + 1 + (options.limit || 30));
      return {
        messages: sorted.slice(afterIndex + 1, end),
        hasMore: end < sorted.length,
        totalCount: sorted.length,
      };
    }
  }

  // デフォルト: 最新のN件を取得
  const limit = options.limit || 30;
  const start = Math.max(0, sorted.length - limit);
  return {
    messages: sorted.slice(start),
    hasMore: start > 0,
    totalCount: sorted.length,
  };
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
    db.clear("settings"),
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

// Settings store functions
export async function saveSetting(key: string, value: string) {
  const db = await getDatabase();
  await db.put("settings", { key, value });
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  const record = await db.get("settings", key);
  return record?.value ?? null;
}

export async function deleteSetting(key: string) {
  const db = await getDatabase();
  await db.delete("settings", key);
}

/**
 * IndexedDBを完全に削除して再作成
 * 注意: 組織ホワイトリスト（localStorage）は保持されます
 */
export async function recreateDatabase(): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is only available in the browser");
  }

  try {
    // 組織ホワイトリストをバックアップ（localStorageから）
    const orgWhitelist = localStorage.getItem('org-whitelist');
    const adminPassword = localStorage.getItem('admin-password');

    console.log('📦 Backing up organization settings...');

    // 既存のDB接続をクローズ
    if (dbPromise) {
      const db = await dbPromise;
      db.close();
      dbPromise = null;
    }

    // データベースを削除
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        console.warn("Database deletion blocked. Please close all other tabs.");
        reject(new Error("データベース削除がブロックされました。他のタブを閉じてください。"));
      };
    });

    // 組織設定を復元
    if (orgWhitelist) {
      localStorage.setItem('org-whitelist', orgWhitelist);
      console.log('✅ Organization whitelist restored');
    }
    if (adminPassword) {
      localStorage.setItem('admin-password', adminPassword);
      console.log('✅ Admin password restored');
    }

    // 新しいDBを作成（次回のgetDatabase()呼び出しで自動的に作成される）
    console.log("✅ Database recreated successfully");
  } catch (error) {
    console.error("Failed to recreate database:", error);
    throw error;
  }
}
