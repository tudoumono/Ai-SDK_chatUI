import { createVectorStore, attachFileToVectorStore, uploadFileToOpenAI as uploadFileForVectorStore } from "@/lib/openai/vector-stores";
import { upsertVectorStores } from "@/lib/storage/indexed-db";
import type { VectorStoreRecord } from "@/lib/storage/schema";
import type { ConnectionSettings } from "@/lib/settings/connection-storage";

export type AutoVectorStoreOptions = {
  expiresAfterDays?: number;
  connection: ConnectionSettings;
};

const DEFAULT_EXPIRY_DAYS = 7; // デフォルトは7日間

/**
 * チャット添付ファイル用の一時的なVector Storeを自動作成
 */
export async function createTempVectorStoreForChat(
  files: File[],
  options: AutoVectorStoreOptions,
): Promise<{ vectorStoreId: string; vectorStoreRecord: VectorStoreRecord }> {
  const expiryDays = options.expiresAfterDays ?? DEFAULT_EXPIRY_DAYS;

  // 現在時刻をタイムスタンプとして使用
  const timestamp = new Date().toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const fileNames = files.map(f => f.name).join(', ');
  const shortFileNames = fileNames.length > 30
    ? fileNames.substring(0, 27) + '...'
    : fileNames;

  const vectorStoreName = `チャット添付 (${timestamp})`;
  const description = `添付ファイル: ${shortFileNames} | ${expiryDays}日後に自動削除`;

  // Vector Storeを作成
  const vectorStoreId = await createVectorStore(
    vectorStoreName,
    description,
    {
      expiresAfterDays: expiryDays,
      connectionOverride: options.connection,
    }
  );

  // ファイルをアップロードしてVector Storeに追加
  for (const file of files) {
    const fileId = await uploadFileForVectorStore(file, options.connection);
    await attachFileToVectorStore(vectorStoreId, fileId, options.connection);
  }

  // IndexedDBに保存するレコードを作成
  const now = new Date().toISOString();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiryDays);

  const vectorStoreRecord: VectorStoreRecord = {
    id: vectorStoreId,
    name: vectorStoreName,
    description,
    fileCount: files.length,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
    expiresAfter: {
      anchor: "last_active_at",
      days: expiryDays,
    },
    expiresAt: expiresAt.toISOString(),
  };

  // IndexedDBに保存
  await upsertVectorStores([vectorStoreRecord]);

  return { vectorStoreId, vectorStoreRecord };
}

/**
 * 有効期限が切れているか確認
 */
export function isVectorStoreExpired(store: VectorStoreRecord): boolean {
  if (!store.expiresAt) return false;

  const expiryDate = new Date(store.expiresAt);
  const now = new Date();

  return now > expiryDate;
}

/**
 * 有効期限までの残り日数を計算
 */
export function getDaysUntilExpiry(store: VectorStoreRecord): number | null {
  if (!store.expiresAt) return null;

  const expiryDate = new Date(store.expiresAt);
  const now = new Date();

  const diffMs = expiryDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * 有効期限のフォーマット済み文字列を取得
 */
export function formatExpiryInfo(store: VectorStoreRecord): string | null {
  const daysLeft = getDaysUntilExpiry(store);

  if (daysLeft === null) return null;

  if (daysLeft < 0) {
    return "期限切れ";
  } else if (daysLeft === 0) {
    return "今日期限切れ";
  } else if (daysLeft === 1) {
    return "明日期限切れ";
  } else if (daysLeft <= 7) {
    return `残り${daysLeft}日`;
  } else {
    const expiryDate = new Date(store.expiresAt!);
    return `${expiryDate.toLocaleDateString('ja-JP')}まで`;
  }
}
