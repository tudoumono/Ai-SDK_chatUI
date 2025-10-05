"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { VectorStoreRecord } from "@/lib/storage/schema";
import { getAllVectorStores } from "@/lib/storage/indexed-db";
import "./vector-stores.css";

export default function VectorStoresPage() {
  const [vectorStores, setVectorStores] = useState<VectorStoreRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "size">("date");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stores = await getAllVectorStores();
        if (!cancelled) {
          setVectorStores(stores);
        }
      } catch (error) {
        console.error("Failed to load vector stores:", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const filteredStores = vectorStores.filter((store) =>
    store.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedStores = [...filteredStores].sort((a, b) => {
    if (sortBy === "date") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return (b.fileCount || 0) - (a.fileCount || 0);
  });

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!confirm(`「${name}」を削除しますか？この操作は取り消せません。`)) {
      return;
    }
    // TODO: Implement delete functionality
    alert("削除機能は未実装です");
  }, []);

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
          </div>

          <div className="vs-filters">
            <button
              className={`vs-filter-button ${sortBy === "date" ? "active" : ""}`}
              onClick={() => setSortBy("date")}
            >
              作成日
              <span className="vs-filter-icon">▼</span>
            </button>
            <button
              className={`vs-filter-button ${sortBy === "size" ? "active" : ""}`}
              onClick={() => setSortBy("size")}
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
            <div className="vs-table-container">
              <table className="vs-table">
                <thead>
                  <tr>
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
                      <td colSpan={5} className="vs-empty">
                        Vector Store が見つかりません
                      </td>
                    </tr>
                  ) : (
                    sortedStores.map((store) => (
                      <tr key={store.id}>
                        <td className="vs-name">{store.name}</td>
                        <td className="vs-id">{store.id}</td>
                        <td className="vs-date">
                          {new Date(store.createdAt).toLocaleDateString("ja-JP")}
                        </td>
                        <td className="vs-size">
                          {store.fileCount ? `${store.fileCount} files` : "—"}
                        </td>
                        <td className="vs-actions-cell">
                          <Link
                            href={`/ingest?id=${store.id}`}
                            className="vs-action-button"
                          >
                            Edit
                          </Link>
                          <button
                            className="vs-action-button vs-action-delete"
                            onClick={() => void handleDelete(store.id, store.name)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
