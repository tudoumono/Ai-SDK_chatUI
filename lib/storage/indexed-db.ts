import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  type ConversationRecord,
  type VectorStoreRecord,
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
};

const DB_NAME = "ai-sdk-chat-ui";
const DB_VERSION = 1;

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

export async function clearAll() {
  const db = await getDatabase();
  await Promise.all([
    db.clear("conversations"),
    db.clear("vectorStores"),
  ]);
}
