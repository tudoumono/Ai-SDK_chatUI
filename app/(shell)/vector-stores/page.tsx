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

export default function VectorStoresPage() {
  const [vectorStores, setVectorStores] = useState<VectorStoreRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "size">("date");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({
    state: "idle",
    message: "削除操作はまだ実行されていません。",
  });
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const sortedStores = [...filteredStores].sort((a, b) => {
    if (sortBy === "date") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return (b.fileCount || 0) - (a.fileCount || 0);
  });

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
        <div className="vs-search-section">
          <div className="vs-search-box">
            <span className="vs-search-icon">🔍</span>
            <input
              type="text"
              className="vs-search-input"
              placeholder="ベクトルストアを検索"
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

          <div className="vs-filters">
            <button
              className={`vs-filter-button ${sortBy === "date" ? "active" : ""}`}
              onClick={() => setSortBy("date")}
              disabled={!!deletingId}
            >
              作成日
              <span className="vs-filter-icon">▼</span>
            </button>
            <button
              className={`vs-filter-button ${sortBy === "size" ? "active" : ""}`}
              onClick={() => setSortBy("size")}
              disabled={!!deletingId}
            >
              ファイル数
              <span className="vs-filter-icon">▼</span>
            </button>
          </div>
        </div>

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
                  <span className="vs-sync-note">
                    ※ OpenAIとの同期は「更新」ボタン押下時と削除時のみ実行されます
                  </span>
                </div>
                {status.state !== "idle" && (
                  <div className={`vs-status vs-status-${status.state}`} role="status">
                    {status.message}
                  </div>
                )}
              </div>
              <div className="vs-table-container">
                <table className="vs-table">
                  <thead>
                    <tr>
                    <th className="vs-favorite-col">
                      <div className="th-content">★</div>
                    </th>
                    <th className="resizable">
                      <div className="th-content">名前</div>
                      <div className="resize-handle"></div>
                    </th>
                    <th className="resizable">
                      <div className="th-content">ID</div>
                      <div className="resize-handle"></div>
                    </th>
                    <th className="resizable">
                      <div className="th-content">作成日</div>
                      <div className="resize-handle"></div>
                    </th>
                    <th className="resizable">
                      <div className="th-content">ファイル数</div>
                      <div className="resize-handle"></div>
                    </th>
                    <th>
                      <div className="th-content">操作</div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStores.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="vs-empty">
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
                        <td className="vs-name">{highlightText(store.name, searchQuery)}</td>
                        <td className="vs-id">{highlightText(store.id, searchQuery)}</td>
                        <td className="vs-date">
                          {new Date(store.createdAt).toLocaleDateString("ja-JP")}
                        </td>
                        <td className="vs-size">
                          {store.fileCount ? `${store.fileCount} files` : "—"}
                        </td>
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
