"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pruneConversationsOlderThan } from "@/lib/chat/session";
import { downloadBundle, parseBundle } from "@/lib/storage/export";
import {
  getAllConversations,
  getAllVectorStores,
  getMessages,
  upsertConversations,
  upsertMessages,
  upsertVectorStores,
} from "@/lib/storage/indexed-db";
import {
  buildSeedConversations,
  buildSeedMessages,
  buildSeedVectorStores,
} from "@/lib/storage/seeds";
import type { ConversationRecord } from "@/lib/storage/schema";

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
};

type SearchGroups = {
  title: ConversationRecord[];
  tags: ConversationRecord[];
  messages: ConversationRecord[];
};

const CONVERSATION_RETENTION_DAYS = 14;

export default function DashboardPage() {
  const [status, setStatus] = useState<DashboardStatus>(INITIAL_STATUS);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filter, setFilter] = useState("");
  const [data, setData] = useState<DataState>({
    conversations: [],
  });
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchGroups | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showSearchResults = filter.trim().length > 0;
  const totalMatches = searchResults
    ? searchResults.title.length + searchResults.tags.length + searchResults.messages.length
    : 0;

  const renderConversationList = useCallback((conversations: ConversationRecord[]) => {
    return (
      <ul className="conversation-list">
        {conversations.map((conversation) => (
          <li key={conversation.id} className="conversation-item">
            <div className="conversation-title">{conversation.title}</div>
            <div className="conversation-meta">
              {conversation.tags.length > 0 && (
                <div className="conversation-tags">
                  {conversation.tags.map((tag) => (
                    <span key={tag} className="conversation-tag">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="conversation-date">
                {new Date(conversation.updatedAt).toLocaleString()}
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }, []);

  const updateStatus = useCallback((next: DashboardStatus) => {
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
    setStatus(next);
    if (next.state === "success" || next.state === "error") {
      statusTimerRef.current = setTimeout(() => {
        setStatus({ state: "idle", message: "" });
        statusTimerRef.current = null;
      }, 3000);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      updateStatus({ state: "loading", message: "データを読み込み中です…" });

      await pruneConversationsOlderThan(CONVERSATION_RETENTION_DAYS);

      const conversations = await getAllConversations();

      const conversationsWithContent = conversations.filter((conversation) => conversation.hasContent);

      if (conversationsWithContent.length === 0) {
        const seedConversations = buildSeedConversations();
        const seedVectorStores = buildSeedVectorStores();
        const seedMessages = buildSeedMessages();
        await Promise.all([
          upsertConversations(seedConversations),
          upsertVectorStores(seedVectorStores),
          upsertMessages(seedMessages),
        ]);
        setData({ conversations: seedConversations });
        updateStatus({
          state: "success",
          message: "サンプルデータを登録しました。",
        });
        return;
      }

      // TODO: G0 で決定した保存ポリシー・暗号化設定を参照し、ここで復号や表示制御を行う。
      setData({ conversations: conversationsWithContent });
      setSearchResults(null);
      setSearching(false);
      updateStatus({
        state: "success",
        message: "IndexedDB からデータを読み込みました。",
      });
    } catch (error) {
      console.error(error);
      updateStatus({
        state: "error",
        message:
          error instanceof Error
            ? `読み込みに失敗しました: ${error.message}`
            : "読み込みに失敗しました",
      });
    }
  }, [updateStatus]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => () => {
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const doSearch = async () => {
      const keyword = filter.trim();
      if (!keyword) {
        setSearchResults(null);
        setSearching(false);
        return;
      }
      setSearching(true);
      setSearchResults({ title: [], tags: [], messages: [] });
      try {
        const normalized = keyword.toLowerCase();
        const titleMatches = data.conversations.filter((conversation) =>
          conversation.title.toLowerCase().includes(normalized),
        );
        const tagsMatches = data.conversations.filter((conversation) =>
          !titleMatches.some((item) => item.id === conversation.id) &&
          conversation.tags.some((tag) => tag.toLowerCase().includes(normalized)),
        );
        const seenIds = new Set([...titleMatches, ...tagsMatches].map((item) => item.id));

        const messageMatches: ConversationRecord[] = [];
        for (const conversation of data.conversations) {
          if (seenIds.has(conversation.id)) {
            continue;
          }
          const messages = await getMessages(conversation.id).catch(() => []);
          const hasMatch = messages.some((message) =>
            message.parts.some(
              (part) => part.type === "text" && part.text.toLowerCase().includes(normalized),
            ),
          );
          if (hasMatch) {
            messageMatches.push(conversation);
          }
          if (cancelled) {
            return;
          }
        }

        setSearchResults({ title: titleMatches, tags: tagsMatches, messages: messageMatches });
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    };

    void doSearch();
    return () => {
      cancelled = true;
    };
  }, [data.conversations, filter]);

  const handleExport = useCallback(async () => {
    if (data.conversations.length === 0) {
      updateStatus({ state: "error", message: "エクスポートするデータがありません。" });
      return;
    }
    const vectorStores = await getAllVectorStores().catch(() => []);
    await downloadBundle({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      conversations: data.conversations,
      vectorStores,
    });
    updateStatus({ state: "success", message: "JSON エクスポートを開始しました。" });
  }, [data.conversations, updateStatus]);

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
        upsertVectorStores(bundle.vectorStores ?? []),
      ]);
      setData({ conversations: bundle.conversations });
      updateStatus({
        state: "success",
        message: `${file.name} を取り込みました。`,
      });
    } catch (error) {
      console.error(error);
      updateStatus({
        state: "error",
        message:
          error instanceof Error
            ? `取り込みに失敗しました: ${error.message}`
            : "取り込みに失敗しました",
      });
    } finally {
      event.target.value = "";
    }
  }, [updateStatus]);

  return (
    <main className="page-grid">
      <div className="page-header">
        <h1 className="page-header-title">ダッシュボード</h1>
        <p className="page-header-description">
          ブラウザに保存された会話履歴を検索・インポート/エクスポートするための画面です。
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
        {status.message && (
          <div className={`status-banner status-${status.state}`} role="status">
            <div className="status-title">{status.message}</div>
          </div>
        )}

        <div className="section-card-title">会話一覧</div>
        {showSearchResults ? (
          <div className="conversation-subsections">
            {searching && (
              <div className="status-banner status-loading" role="status">
                <div className="status-title">メッセージを検索しています…</div>
              </div>
            )}
            {!searching && totalMatches === 0 ? (
              <p className="conversation-empty">入力したキーワードに一致する会話が見つかりませんでした。</p>
            ) : null}
            {searchResults?.title.length ? (
              <div className="conversation-subsection">
                <div className="conversation-subsection-title">タイトルに一致</div>
                {renderConversationList(searchResults.title)}
              </div>
            ) : null}
            {searchResults?.tags.length ? (
              <div className="conversation-subsection">
                <div className="conversation-subsection-title">タグに一致</div>
                {renderConversationList(searchResults.tags)}
              </div>
            ) : null}
            {searchResults?.messages.length ? (
              <div className="conversation-subsection">
                <div className="conversation-subsection-title">メッセージ本文に一致</div>
                {renderConversationList(searchResults.messages)}
              </div>
            ) : null}
          </div>
        ) : data.conversations.length === 0 ? (
          <p className="section-card-description">
            履歴がまだありません。チャット画面から会話を作成するか、JSON をインポートしてください。
          </p>
        ) : (
          renderConversationList(data.conversations)
        )}
      </section>
    </main>
  );
}
