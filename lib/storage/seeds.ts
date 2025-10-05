import {
  type ConversationRecord,
  type VectorStoreRecord,
} from "./schema";

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function buildSeedConversations(): ConversationRecord[] {
  const now = new Date().toISOString();
  return [
    {
      id: "conv-setup",
      title: "OpenAI 接続テスト",
      createdAt: daysAgo(5),
      updatedAt: now,
      tags: ["setup"],
      summary: "BYOK 初期セットアップと /v1/models 接続確認のメモ",
    },
    {
      id: "conv-rag-demo",
      title: "RAG デモ会話",
      createdAt: daysAgo(12),
      updatedAt: daysAgo(1),
      tags: ["demo", "rag"],
      summary: "Vector Store からの引用を含むデモトランスクリプト",
    },
  ];
}

export function buildSeedVectorStores(): VectorStoreRecord[] {
  const now = new Date().toISOString();
  return [
    {
      id: "vs-product-faq",
      name: "製品FAQ",
      fileCount: 12,
      updatedAt: now,
      description: "最新のFAQドキュメントを同期したストア",
    },
    {
      id: "vs-release-notes",
      name: "リリースノート",
      fileCount: 5,
      updatedAt: daysAgo(3),
      description: "過去リリースノートとブログ記事",
    },
  ];
}
