import {
  type ConversationRecord,
  type VectorStoreRecord,
  type MessageRecord,
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
      modelId: "gpt-4.1-mini",
      webSearchEnabled: false,
      vectorSearchEnabled: false,
      vectorStoreIds: [],
      isFavorite: false,
      hasContent: true,
    },
    {
      id: "conv-rag-demo",
      title: "RAG デモ会話",
      createdAt: daysAgo(12),
      updatedAt: daysAgo(1),
      tags: ["demo", "rag"],
      summary: "Vector Store からの引用を含むデモトランスクリプト",
      modelId: "gpt-4.1-mini",
      webSearchEnabled: true,
      vectorSearchEnabled: true,
      vectorStoreIds: ["vs-product-faq"],
      isFavorite: false,
      hasContent: true,
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
      createdAt: daysAgo(14),
      updatedAt: now,
      description: "最新のFAQドキュメントを同期したストア",
    },
    {
      id: "vs-release-notes",
      name: "リリースノート",
      fileCount: 5,
      createdAt: daysAgo(30),
      updatedAt: daysAgo(3),
      description: "過去リリースノートとブログ記事",
    },
  ];
}

export function buildSeedMessages(): MessageRecord[] {
  const created = daysAgo(1);
  return [
    {
      id: "msg-seed-1",
      conversationId: "conv-rag-demo",
      role: "user",
      parts: [{ type: "text", text: "製品FAQの更新点をまとめて" }],
      createdAt: created,
      updatedAt: created,
      status: "complete",
    },
    {
      id: "msg-seed-2",
      conversationId: "conv-rag-demo",
      role: "assistant",
      parts: [
        {
          type: "text",
          text:
            "最新版では検索フィルタの改善とWebhook通知が追加されました。デプロイ手順の変更も含まれています。",
        },
      ],
      createdAt: created,
      updatedAt: created,
      status: "complete",
    },
  ];
}
