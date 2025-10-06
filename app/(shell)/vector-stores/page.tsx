"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { VectorStoreRecord } from "@/lib/storage/schema";
import { deleteVectorStore, getAllVectorStores, replaceVectorStores, updateVectorStore } from "@/lib/storage/indexed-db";
import { loadConnection } from "@/lib/settings/connection-storage";
import { deleteVectorStoreFromApi, fetchVectorStoresFromApi } from "@/lib/openai/vector-stores";
import "./vector-stores.css";

type Status =
  | { state: "idle"; message: string }
  | { state: "loading"; message: string }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text: string, query: string) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return text;
  }
  const escaped = escapeRegExp(normalizedQuery);
  const segments = text.split(new RegExp(`(${escaped})`, "gi"));
  return segments.map((segment, index) =>
    segment.toLowerCase() === normalizedQuery.toLowerCase() ? (
      <mark className="vs-highlight" key={`${segment}-${index}`}>
        {segment}
      </mark>
    ) : (
      <span key={`${segment}-${index}`}>{segment}</span>
    ),
  );
}

function formatExpiration(store: VectorStoreRecord): string {
  // 無期限の場合
  if (!store.expiresAfter || store.expiresAfter.days === null) {
    return "無期限";
  }

  // expiresAt がある場合は具体的な期限日を表示
  if (store.expiresAt) {
    const expiresDate = new Date(store.expiresAt);
    const now = new Date();
    const diffMs = expiresDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return "期限切れ";
    } else if (diffDays === 0) {
      return "今日期限";
    } else if (diffDays === 1) {
      return "明日期限";
    } else if (diffDays <= 7) {
      return `${diffDays}日後`;
    }
  }

  // expiresAt がない、または7日以上先の場合は設定日数を表示
  const anchor = store.expiresAfter.anchor === "created_at" ? "作成" : "最終利用";
  return `${anchor}から${store.expiresAfter.days}日`;
}

type ColumnKey = "name" | "id" | "createdAt" | "lastActiveAt" | "fileCount" | "expiration" | "expiresAt";
type SortConfig = {
  column: ColumnKey | null;
  direction: "asc" | "desc";
};

export default function VectorStoresPage() {
  const [vectorStores, setVectorStores] = useState<VectorStoreRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    column: "createdAt",
    direction: "desc",
  });
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({
    state: "idle",
    message: "削除操作はまだ実行されていません。",
  });
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    new Set(["name", "id", "createdAt", "fileCount", "expiration"])
  );
  const [showColumnSelector, setShowColumnSelector] = useState(false);

  const showStatus = useCallback((next: Status) => {
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

  const loadStoresFromLocal = useCallback(async () => {
    setLoading(true);
    try {
      const stores = await getAllVectorStores();
      setVectorStores(stores);
    } catch (error) {
      console.error("Failed to load vector stores from local:", error);
      showStatus({
        state: "error",
        message: "ローカルデータの読み込みに失敗しました",
      });
    } finally {
      setLoading(false);
    }
  }, [showStatus]);

  const syncWithRemote = useCallback(async () => {
    setLoading(true);
    try {
      const connection = await loadConnection();
      if (!connection || !connection.apiKey) {
        showStatus({
          state: "error",
          message: "OpenAI 接続が未設定です。",
        });
        return;
      }

      const remoteStores = await fetchVectorStoresFromApi(connection);
      await replaceVectorStores(remoteStores);
      const stores = await getAllVectorStores();
      setVectorStores(stores);
      showStatus({ state: "success", message: "OpenAI と同期しました。" });
    } catch (error) {
      console.error("Failed to sync vector stores:", error);
      showStatus({
        state: "error",
        message:
          error instanceof Error ? `同期に失敗しました: ${error.message}` : "同期に失敗しました",
      });
    } finally {
      setLoading(false);
    }
  }, [showStatus]);

  useEffect(() => {
    void loadStoresFromLocal();
  }, [loadStoresFromLocal]);

  useEffect(() => {
    const table = document.querySelector(".vs-table");
    if (!table) return;

    const headers = table.querySelectorAll("th.resizable");

    headers.forEach((header) => {
      const handle = header.querySelector(".resize-handle");
      if (!handle) return;

      let startX = 0;
      let startWidth = 0;

      const onMouseDown = (e: Event) => {
        const mouseEvent = e as MouseEvent;
        startX = mouseEvent.pageX;
        startWidth = (header as HTMLElement).offsetWidth;

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        e.preventDefault();
      };

      const onMouseMove = (e: MouseEvent) => {
        const width = startWidth + (e.pageX - startX);
        if (width >= 100) {
          (header as HTMLElement).style.width = `${width}px`;
        }
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      handle.addEventListener("mousedown", onMouseDown);
    });
  }, [loading]);

  // カラム選択ドロップダウンの外側クリックで閉じる
  useEffect(() => {
    if (!showColumnSelector) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const wrapper = document.querySelector(".vs-column-selector-wrapper");
      if (wrapper && !wrapper.contains(target)) {
        setShowColumnSelector(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showColumnSelector]);

  const filteredStores = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return vectorStores;
    }
    return vectorStores.filter((store) => {
      const name = store.name.toLowerCase();
      const id = store.id.toLowerCase();
      return name.includes(query) || id.includes(query);
    });
  }, [vectorStores, searchQuery]);

  const handleSort = useCallback((column: ColumnKey) => {
    setSortConfig((prev) => {
      if (prev.column === column) {
        // 同じカラムをクリックした場合は昇順/降順を切り替え
        return {
          column,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      // 新しいカラムの場合はデフォルトで降順
      return { column, direction: "desc" };
    });
  }, []);

  const sortedStores = useMemo(() => {
    if (!sortConfig.column) return filteredStores;

    return [...filteredStores].sort((a, b) => {
      const { column, direction } = sortConfig;
      const multiplier = direction === "asc" ? 1 : -1;

      switch (column) {
        case "name":
          return multiplier * a.name.localeCompare(b.name, "ja");
        case "id":
          return multiplier * a.id.localeCompare(b.id);
        case "createdAt":
          return multiplier * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        case "lastActiveAt": {
          const aTime = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
          const bTime = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
          return multiplier * (aTime - bTime);
        }
        case "fileCount":
          return multiplier * ((a.fileCount || 0) - (b.fileCount || 0));
        case "expiresAt": {
          const aTime = a.expiresAt ? new Date(a.expiresAt).getTime() : 0;
          const bTime = b.expiresAt ? new Date(b.expiresAt).getTime() : 0;
          return multiplier * (aTime - bTime);
        }
        default:
          return 0;
      }
    });
  }, [filteredStores, sortConfig]);

  const columnDefinitions: Record<ColumnKey, string> = {
    name: "名前",
    id: "ID",
    createdAt: "作成日",
    lastActiveAt: "最終利用",
    fileCount: "ファイル数",
    expiration: "保管期限",
    expiresAt: "期限日時",
  };

  const toggleColumn = useCallback((column: ColumnKey) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(column)) {
        // 最低1列は表示する
        if (next.size > 1) {
          next.delete(column);
        }
      } else {
        next.add(column);
      }
      return next;
    });
  }, []);

  const handleToggleFavorite = useCallback(
    async (store: VectorStoreRecord) => {
      if (deletingId) {
        return; // 削除処理中は何もしない
      }
      try {
        await updateVectorStore(store.id, { isFavorite: !store.isFavorite });
        await loadStoresFromLocal();
      } catch (error) {
        console.error("Failed to toggle favorite", error);
        showStatus({
          state: "error",
          message: "お気に入りの更新に失敗しました",
        });
      }
    },
    [deletingId, loadStoresFromLocal, showStatus],
  );

  const handleDelete = useCallback(
    async (store: VectorStoreRecord) => {
      if (deletingId) {
        return; // 既に削除処理中の場合は何もしない
      }

      if (store.isFavorite) {
        alert(`「${store.name}」はお気に入りに登録されているため削除できません。\n先にお気に入りを解除してください。`);
        return;
      }
      if (!confirm(`「${store.name}」を削除しますか？この操作は取り消せません。`)) {
        return;
      }

      setDeletingId(store.id);
      setStatus({ state: "loading", message: "ベクトルストアを削除しています…" });
      try {
        const connection = await loadConnection();
        if (!connection || !connection.apiKey) {
          throw new Error("OpenAI API キーが設定されていません。G0 で接続設定を確認してください。");
        }

        await deleteVectorStoreFromApi(store.id, connection);
        await deleteVectorStore(store.id);
        await syncWithRemote();
        showStatus({ state: "success", message: `「${store.name}」を削除しました。` });
      } catch (error) {
        console.error("Failed to delete vector store", error);
        showStatus({
          state: "error",
          message:
            error instanceof Error
              ? `削除に失敗しました: ${error.message}`
              : "削除に失敗しました",
        });
      } finally {
        setDeletingId(null);
      }
    },
    [deletingId, syncWithRemote, showStatus],
  );

  useEffect(
    () => () => {
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
        statusTimerRef.current = null;
      }
    },
    [],
  );

  return (
    <div className="vector-stores-page">
      <header className="vs-header">
        <div className="vs-header-content">
          <Link href="/dashboard" className="vs-back-button">
            ←
          </Link>
          <h1 className="vs-title">Vector Stores</h1>
          <Link href="/ingest" className="vs-button-primary">
            New
          </Link>
        </div>
      </header>

      <main className="vs-main">
        {loading ? (
          <div className="vs-loading">読み込み中...</div>
        ) : (
          <>
            <div className="vs-table-shell">
              <div className="vs-toolbar">
                <div className="vs-toolbar-left">
                  <button
                    className="vs-refresh"
                    onClick={() => void syncWithRemote()}
                    type="button"
                    disabled={!!deletingId}
                  >
                    更新
                  </button>
                  <div className="vs-column-selector-wrapper">
                    <button
                      className="vs-refresh"
                      onClick={() => setShowColumnSelector(!showColumnSelector)}
                      type="button"
                      disabled={!!deletingId}
                    >
                      列選択 {showColumnSelector ? "▲" : "▼"}
                    </button>
                    {showColumnSelector && (
                      <div className="vs-column-selector">
                        {(Object.entries(columnDefinitions) as [ColumnKey, string][]).map(([key, label]) => (
                          <label key={key} className="vs-column-option">
                            <input
                              type="checkbox"
                              checked={visibleColumns.has(key)}
                              onChange={() => toggleColumn(key)}
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="vs-sync-note">
                    ※ OpenAIとの同期は「更新」ボタン押下時と削除時のみ実行されます
                  </span>
                </div>
                <div className="vs-toolbar-right">
                  {status.state !== "idle" && (
                    <div className={`vs-status vs-status-${status.state}`} role="status">
                      {status.message}
                    </div>
                  )}
                  <div className="vs-search-box-compact">
                    <span className="vs-search-icon">🔍</span>
                    <input
                      type="text"
                      className="vs-search-input-compact"
                      placeholder="検索"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button
                        className="vs-clear"
                        onClick={() => setSearchQuery("")}
                        type="button"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="vs-table-container">
                <table className="vs-table">
                  <thead>
                    <tr>
                    <th className="vs-favorite-col">
                      <div className="th-content">★</div>
                    </th>
                    {visibleColumns.has("name") && (
                      <th className="resizable sortable" onClick={() => handleSort("name")}>
                        <div className="th-content">
                          名前
                          {sortConfig.column === "name" && (
                            <span className="sort-indicator">{sortConfig.direction === "asc" ? "▲" : "▼"}</span>
                          )}
                        </div>
                        <div className="resize-handle"></div>
                      </th>
                    )}
                    {visibleColumns.has("id") && (
                      <th className="resizable sortable" onClick={() => handleSort("id")}>
                        <div className="th-content">
                          ID
                          {sortConfig.column === "id" && (
                            <span className="sort-indicator">{sortConfig.direction === "asc" ? "▲" : "▼"}</span>
                          )}
                        </div>
                        <div className="resize-handle"></div>
                      </th>
                    )}
                    {visibleColumns.has("createdAt") && (
                      <th className="resizable sortable" onClick={() => handleSort("createdAt")}>
                        <div className="th-content">
                          作成日
                          {sortConfig.column === "createdAt" && (
                            <span className="sort-indicator">{sortConfig.direction === "asc" ? "▲" : "▼"}</span>
                          )}
                        </div>
                        <div className="resize-handle"></div>
                      </th>
                    )}
                    {visibleColumns.has("lastActiveAt") && (
                      <th className="resizable sortable" onClick={() => handleSort("lastActiveAt")}>
                        <div className="th-content">
                          最終利用
                          {sortConfig.column === "lastActiveAt" && (
                            <span className="sort-indicator">{sortConfig.direction === "asc" ? "▲" : "▼"}</span>
                          )}
                        </div>
                        <div className="resize-handle"></div>
                      </th>
                    )}
                    {visibleColumns.has("fileCount") && (
                      <th className="resizable sortable" onClick={() => handleSort("fileCount")}>
                        <div className="th-content">
                          ファイル数
                          {sortConfig.column === "fileCount" && (
                            <span className="sort-indicator">{sortConfig.direction === "asc" ? "▲" : "▼"}</span>
                          )}
                        </div>
                        <div className="resize-handle"></div>
                      </th>
                    )}
                    {visibleColumns.has("expiration") && (
                      <th className="resizable">
                        <div className="th-content">保管期限</div>
                        <div className="resize-handle"></div>
                      </th>
                    )}
                    {visibleColumns.has("expiresAt") && (
                      <th className="resizable sortable" onClick={() => handleSort("expiresAt")}>
                        <div className="th-content">
                          期限日時
                          {sortConfig.column === "expiresAt" && (
                            <span className="sort-indicator">{sortConfig.direction === "asc" ? "▲" : "▼"}</span>
                          )}
                        </div>
                        <div className="resize-handle"></div>
                      </th>
                    )}
                    <th>
                      <div className="th-content">操作</div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStores.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColumns.size + 2} className="vs-empty">
                        Vector Store が見つかりません
                      </td>
                    </tr>
                  ) : (
                    sortedStores.map((store) => (
                      <tr key={store.id}>
                        <td className="vs-favorite-cell">
                          <button
                            className={`vs-favorite-button ${store.isFavorite ? "is-favorite" : ""}`}
                            onClick={() => void handleToggleFavorite(store)}
                            title={store.isFavorite ? "お気に入りを解除" : "お気に入りに追加"}
                            type="button"
                            disabled={!!deletingId}
                          >
                            ★
                          </button>
                        </td>
                        {visibleColumns.has("name") && (
                          <td className="vs-name">{highlightText(store.name, searchQuery)}</td>
                        )}
                        {visibleColumns.has("id") && (
                          <td className="vs-id">{highlightText(store.id, searchQuery)}</td>
                        )}
                        {visibleColumns.has("createdAt") && (
                          <td className="vs-date">
                            {new Date(store.createdAt).toLocaleDateString("ja-JP")}
                          </td>
                        )}
                        {visibleColumns.has("lastActiveAt") && (
                          <td className="vs-date">
                            {store.lastActiveAt
                              ? new Date(store.lastActiveAt).toLocaleDateString("ja-JP")
                              : "—"}
                          </td>
                        )}
                        {visibleColumns.has("fileCount") && (
                          <td className="vs-size">
                            {store.fileCount ? `${store.fileCount} files` : "—"}
                          </td>
                        )}
                        {visibleColumns.has("expiration") && (
                          <td className="vs-expiration">
                            <span className={`expiration-badge ${!store.expiresAfter || store.expiresAfter.days === null ? "unlimited" : ""}`}>
                              {formatExpiration(store)}
                            </span>
                          </td>
                        )}
                        {visibleColumns.has("expiresAt") && (
                          <td className="vs-date">
                            {store.expiresAt
                              ? new Date(store.expiresAt).toLocaleDateString("ja-JP", {
                                  year: "numeric",
                                  month: "2-digit",
                                  day: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </td>
                        )}
                        <td className="vs-actions-cell">
                          <Link
                            href={`/ingest?id=${store.id}`}
                            className={`vs-action-button ${deletingId ? "disabled" : ""}`}
                            onClick={(e) => {
                              if (deletingId) e.preventDefault();
                            }}
                          >
                            Edit
                          </Link>
                          <button
                            className="vs-action-button vs-action-delete"
                            onClick={() => void handleDelete(store)}
                            disabled={!!deletingId}
                          >
                            {deletingId === store.id ? "削除中..." : "Delete"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
