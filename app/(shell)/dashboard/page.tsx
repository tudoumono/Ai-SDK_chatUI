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
import { highlightText, highlightTags, extractMatchPreview } from "@/lib/utils/highlight";
import { Search, Calendar, SortAsc, Tag } from "lucide-react";

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

type ConversationWithPreview = ConversationRecord & {
  messagePreview?: string;
};

type SearchGroups = {
  title: ConversationWithPreview[];
  tags: ConversationWithPreview[];
  messages: ConversationWithPreview[];
};

type DateFilter = "all" | "today" | "week" | "month";
type SortOption = "updated-desc" | "updated-asc" | "title-asc" | "title-desc";

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

  // 新機能のState
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("updated-desc");
  const [allTags, setAllTags] = useState<string[]>([]);

  const showSearchResults = filter.trim().length > 0;
  const totalMatches = searchResults
    ? searchResults.title.length + searchResults.tags.length + searchResults.messages.length
    : 0;

  // 日付フィルター関数
  const filterByDate = useCallback((conversations: ConversationWithPreview[]): ConversationWithPreview[] => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    return conversations.filter((conv) => {
      const updatedAt = new Date(conv.updatedAt);
      switch (dateFilter) {
        case "today":
          return updatedAt >= today;
        case "week":
          return updatedAt >= weekAgo;
        case "month":
          return updatedAt >= monthAgo;
        default:
          return true;
      }
    });
  }, [dateFilter]);

  // ソート関数
  const sortConversations = useCallback((conversations: ConversationWithPreview[]): ConversationWithPreview[] => {
    const sorted = [...conversations];
    switch (sortOption) {
      case "updated-desc":
        return sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      case "updated-asc":
        return sorted.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
      case "title-asc":
        return sorted.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
      case "title-desc":
        return sorted.sort((a, b) => b.title.localeCompare(a.title, 'ja'));
      default:
        return sorted;
    }
  }, [sortOption]);

  // フィルター・ソート適用後の会話リスト
  const filteredAndSortedConversations = useMemo(() => {
    const filtered = filterByDate(data.conversations);
    return sortConversations(filtered);
  }, [data.conversations, filterByDate, sortConversations]);

  const renderConversationList = useCallback((conversations: ConversationWithPreview[], keyword = "") => {
    return (
      <ul className="conversation-list">
        {conversations.map((conversation) => (
          <li key={conversation.id} className="conversation-item">
            <div className="conversation-title">
              {keyword ? highlightText(conversation.title, keyword) : conversation.title}
            </div>
            {conversation.messagePreview && (
              <div className="conversation-preview">
                {keyword ? highlightText(conversation.messagePreview, keyword) : conversation.messagePreview}
              </div>
            )}
            <div className="conversation-meta">
              {conversation.tags.length > 0 && (
                <div className="conversation-tags">
                  {keyword ? highlightTags(conversation.tags, keyword) : conversation.tags.map((tag) => (
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

      // 全タグを抽出
      const tags = new Set<string>();
      conversationsWithContent.forEach((conv) => {
        conv.tags.forEach((tag) => tags.add(tag));
      });
      setAllTags(Array.from(tags).sort());

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

        const messageMatches: ConversationWithPreview[] = [];
        for (const conversation of data.conversations) {
          if (seenIds.has(conversation.id)) {
            continue;
          }
          const messages = await getMessages(conversation.id).catch(() => []);

          // メッセージ内でマッチを探し、プレビューを生成
          for (const message of messages) {
            const textPart = message.parts.find(
              (part) => part.type === "text" && part.text.toLowerCase().includes(normalized)
            );
            if (textPart && textPart.type === "text") {
              const preview = extractMatchPreview(textPart.text, keyword, 60);
              messageMatches.push({
                ...conversation,
                messagePreview: preview,
              });
              break; // 最初のマッチのみ
            }
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

        {/* 検索エリア */}
        <div className="dashboard-search-area">
          <div className="search-input-wrapper">
            <Search size={20} className="search-icon" />
            <input
              className="field-input search-input"
              id="conversation-filter"
              placeholder="キーワードまたはタグで検索..."
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </div>

          {/* タグサジェスト */}
          {allTags.length > 0 && !filter && (
            <div className="tag-suggestions">
              <Tag size={16} />
              <span className="tag-suggestions-label">よく使うタグ:</span>
              {allTags.slice(0, 8).map((tag) => (
                <button
                  key={tag}
                  className="tag-suggestion-button"
                  onClick={() => setFilter(tag)}
                  type="button"
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* フィルター・ソートバー */}
        <div className="filter-sort-bar">
          <div className="date-filter-group">
            <Calendar size={16} />
            <span className="filter-label">期間:</span>
            <button
              className={`filter-button ${dateFilter === "all" ? "active" : ""}`}
              onClick={() => setDateFilter("all")}
              type="button"
            >
              全期間
            </button>
            <button
              className={`filter-button ${dateFilter === "today" ? "active" : ""}`}
              onClick={() => setDateFilter("today")}
              type="button"
            >
              今日
            </button>
            <button
              className={`filter-button ${dateFilter === "week" ? "active" : ""}`}
              onClick={() => setDateFilter("week")}
              type="button"
            >
              今週
            </button>
            <button
              className={`filter-button ${dateFilter === "month" ? "active" : ""}`}
              onClick={() => setDateFilter("month")}
              type="button"
            >
              今月
            </button>
          </div>

          <div className="sort-group">
            <SortAsc size={16} />
            <span className="filter-label">並び替え:</span>
            <select
              className="sort-select"
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
            >
              <option value="updated-desc">更新日時（新しい順）</option>
              <option value="updated-asc">更新日時（古い順）</option>
              <option value="title-asc">タイトル（あ→ん）</option>
              <option value="title-desc">タイトル（ん→あ）</option>
            </select>
          </div>
        </div>

        {/* アクションボタン */}
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

        {status.message && (
          <div className={`status-banner status-${status.state}`} role="status">
            <div className="status-title">{status.message}</div>
          </div>
        )}

        <div className="section-card-title">
          会話一覧 ({showSearchResults ? `検索結果: ${totalMatches}件` : `全${filteredAndSortedConversations.length}件`})
        </div>
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
                <div className="conversation-subsection-title">📝 タイトルに一致 ({searchResults.title.length}件)</div>
                {renderConversationList(searchResults.title, filter)}
              </div>
            ) : null}
            {searchResults?.tags.length ? (
              <div className="conversation-subsection">
                <div className="conversation-subsection-title">🏷️ タグに一致 ({searchResults.tags.length}件)</div>
                {renderConversationList(searchResults.tags, filter)}
              </div>
            ) : null}
            {searchResults?.messages.length ? (
              <div className="conversation-subsection">
                <div className="conversation-subsection-title">💬 メッセージ本文に一致 ({searchResults.messages.length}件)</div>
                {renderConversationList(searchResults.messages, filter)}
              </div>
            ) : null}
          </div>
        ) : filteredAndSortedConversations.length === 0 ? (
          <p className="section-card-description">
            {dateFilter !== "all"
              ? "選択した期間に該当する会話がありません。"
              : "履歴がまだありません。チャット画面から会話を作成するか、JSON をインポートしてください。"}
          </p>
        ) : (
          renderConversationList(filteredAndSortedConversations)
        )}
      </section>
    </main>
  );
}
