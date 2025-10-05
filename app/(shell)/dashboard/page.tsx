"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchVectorStoresFromApi } from "@/lib/openai/vector-stores";
import { downloadBundle, parseBundle } from "@/lib/storage/export";
import {
  getAllConversations,
  getAllVectorStores,
  upsertConversations,
  upsertVectorStores,
} from "@/lib/storage/indexed-db";
import {
  buildSeedConversations,
  buildSeedVectorStores,
} from "@/lib/storage/seeds";
import type {
  ConversationRecord,
  VectorStoreRecord,
} from "@/lib/storage/schema";

const INITIAL_STATUS: DashboardStatus = {
  state: "idle",
  message: "IndexedDB からデータを読み込みます。",
};

type DashboardStatus =
  | { state: "idle"; message: string }
  | { state: "loading"; message: string }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

type DataState = {
  conversations: ConversationRecord[];
  vectorStores: VectorStoreRecord[];
};

export default function DashboardPage() {
  const [status, setStatus] = useState<DashboardStatus>(INITIAL_STATUS);
  const [filter, setFilter] = useState("");
  const [data, setData] = useState<DataState>({
    conversations: [],
    vectorStores: [],
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadData = useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      setStatus({ state: "loading", message: "データを読み込み中です…" });

      const [conversations, vectorStores] = await Promise.all([
        getAllConversations(),
        getAllVectorStores(),
      ]);

      if (conversations.length === 0 && vectorStores.length === 0) {
        const seedConversations = buildSeedConversations();
        const seedVectorStores = buildSeedVectorStores();
        await Promise.all([
          upsertConversations(seedConversations),
          upsertVectorStores(seedVectorStores),
        ]);
        setData({
          conversations: seedConversations,
          vectorStores: seedVectorStores,
        });
        setStatus({
          state: "success",
          message: "サンプルデータを登録しました。",
        });
        return;
      }

      // TODO: G0 で決定した保存ポリシー・暗号化設定を参照し、ここで復号や表示制御を行う。
      setData({ conversations, vectorStores });
      setStatus({
        state: "success",
        message: "IndexedDB からデータを読み込みました。",
      });
    } catch (error) {
      console.error(error);
      setStatus({
        state: "error",
        message:
          error instanceof Error
            ? `読み込みに失敗しました: ${error.message}`
            : "読み込みに失敗しました",
      });
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredConversations = useMemo(() => {
    if (!filter.trim()) {
      return data.conversations;
    }
    const normalized = filter.trim().toLowerCase();
    return data.conversations.filter((conversation) =>
      conversation.title.toLowerCase().includes(normalized) ||
      conversation.tags.some((tag) => tag.toLowerCase().includes(normalized)),
    );
  }, [data.conversations, filter]);

  const handleExport = useCallback(async () => {
    if (data.conversations.length === 0 && data.vectorStores.length === 0) {
      setStatus({ state: "error", message: "エクスポートするデータがありません。" });
      return;
    }
    await downloadBundle({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      conversations: data.conversations,
      vectorStores: data.vectorStores,
    });
    setStatus({ state: "success", message: "JSON エクスポートを開始しました。" });
  }, [data.conversations, data.vectorStores]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const bundle = parseBundle(json);
      await Promise.all([
        upsertConversations(bundle.conversations),
        upsertVectorStores(bundle.vectorStores),
      ]);
      setData({
        conversations: bundle.conversations,
        vectorStores: bundle.vectorStores,
      });
      setStatus({
        state: "success",
        message: `${file.name} を取り込みました。`,
      });
    } catch (error) {
      console.error(error);
      setStatus({
        state: "error",
        message:
          error instanceof Error
            ? `取り込みに失敗しました: ${error.message}`
            : "取り込みに失敗しました",
      });
    } finally {
      event.target.value = "";
    }
  }, []);

  const handleSyncFromOpenAi = useCallback(async () => {
    setStatus({
      state: "loading",
      message: "OpenAI API から Vector Store を同期中です…",
    });
    try {
      const remoteStores = await fetchVectorStoresFromApi();
      await upsertVectorStores(remoteStores);
      setData((current) => ({
        conversations: current.conversations,
        vectorStores: remoteStores,
      }));
      setStatus({
        state: "success",
        message: "OpenAI API との同期が完了しました。",
      });
    } catch (error) {
      console.error(error);
      setStatus({
        state: "error",
        message:
          error instanceof Error
            ? `同期に失敗しました: ${error.message}`
            : "同期に失敗しました",
      });
    }
  }, []);

  return (
    <main>
      <div className="page-header">
        <h1 className="page-header-title">G1: ダッシュボード</h1>
        <p className="page-header-description">
          ローカル履歴と OpenAI Vector Store 一覧を俯瞰し、チャット再開やストア管理へ遷移するための画面です。
        </p>
      </div>

      <section className="section-card">
        <div className="section-card-title">履歴データの管理</div>
        <div className="dashboard-actions">
          <div className="dashboard-search">
            <label className="field-label" htmlFor="conversation-filter">
              会話検索
            </label>
            <input
              className="field-input"
              id="conversation-filter"
              placeholder="キーワードまたはタグでフィルタ"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </div>
          <div className="dashboard-buttons">
            <button className="outline-button" onClick={loadData} type="button">
              再読み込み
            </button>
            <button
              className="outline-button"
              onClick={handleSyncFromOpenAi}
              type="button"
            >
              OpenAI 同期
            </button>
            <button className="outline-button" onClick={handleExport} type="button">
              JSON エクスポート
            </button>
            <button className="primary-button" onClick={handleImportClick} type="button">
              JSON インポート
            </button>
            <input
              accept="application/json"
              hidden
              ref={fileInputRef}
              type="file"
              onChange={handleImportFile}
            />
          </div>
        </div>
        <div className={`status-banner status-${status.state}`} role="status">
          <div className="status-title">{status.message}</div>
        </div>
      </section>

      <section className="section-card">
        <div className="section-card-title">会話一覧</div>
        {filteredConversations.length === 0 ? (
          <p className="section-card-description">
            条件に一致する会話がありません。インポートするか、今後チャット画面から会話を作成してください。
          </p>
        ) : (
          <ul className="conversation-list">
            {filteredConversations.map((conversation) => (
              <li key={conversation.id} className="conversation-item">
                <div className="conversation-header">
                  <span className="conversation-title">{conversation.title}</span>
                  <span className="conversation-updated">
                    更新日: {new Date(conversation.updatedAt).toLocaleString()}
                  </span>
                </div>
                <p className="conversation-summary">
                  {conversation.summary ?? "(要約なし)"}
                </p>
                {conversation.tags.length > 0 && (
                  <div className="conversation-tags">
                    {conversation.tags.map((tag) => (
                      <span key={tag} className="conversation-tag">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section-card">
        <div className="section-card-title">Vector Store 一覧</div>
        {data.vectorStores.length === 0 ? (
          <p className="section-card-description">
            Vector Store の登録がまだありません。取り込み画面 (G3) から作成してください。
          </p>
        ) : (
          <div className="vector-store-grid">
            {data.vectorStores.map((store) => (
              <article key={store.id} className="vector-store-card">
                <div className="vector-store-header">
                  <span className="vector-store-name">{store.name}</span>
                  <span className="vector-store-updated">
                    更新日: {new Date(store.updatedAt).toLocaleString()}
                  </span>
                </div>
                <p className="vector-store-description">
                  {store.description ?? "(説明なし)"}
                </p>
                <div className="vector-store-footer">
                  <span className="vector-store-files">ファイル数: {store.fileCount}</span>
                  <code className="inline-code">{store.id}</code>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
