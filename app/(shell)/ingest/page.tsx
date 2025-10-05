"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getAllVectorStores } from "@/lib/storage/indexed-db";
import type { VectorStoreRecord } from "@/lib/storage/schema";
import "./ingest.css";

type UploadedFile = {
  id: string;
  name: string;
  size: number;
};

export default function IngestPage() {
  const searchParams = useSearchParams();
  const vectorStoreId = searchParams.get("id");

  const [storeName, setStoreName] = useState("");
  const [description, setDescription] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(!!vectorStoreId);

  useEffect(() => {
    if (!vectorStoreId) return;

    let cancelled = false;
    (async () => {
      try {
        const stores = await getAllVectorStores();
        const store = stores.find((s) => s.id === vectorStoreId);

        if (!cancelled && store) {
          setStoreName(store.name);
          setDescription(store.metadata?.description || "");
          // TODO: Load associated files
        }
      } catch (error) {
        console.error("Failed to load vector store:", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [vectorStoreId]);

  const handleFiles = useCallback((files: File[]) => {
    const newFiles: UploadedFile[] = files.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      size: file.size,
    }));
    setUploadedFiles((prev) => [...prev, ...newFiles]);
    // TODO: Implement actual file upload
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }, [handleFiles]);

  const handleDeleteFile = useCallback((id: string) => {
    setUploadedFiles((prev) => prev.filter((file) => file.id !== id));
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const handleSave = useCallback(() => {
    // TODO: Implement save functionality
    alert("保存機能は未実装です");
  }, []);

  const handleCancel = useCallback(() => {
    if (confirm("変更を破棄して戻りますか？")) {
      window.history.back();
    }
  }, []);

  return (
    <div className="ingest-page">
      <header className="ingest-header">
        <div className="ingest-header-content">
          <Link href="/vector-stores" className="ingest-back-button">
            ←
          </Link>
          <h1 className="ingest-title">Vector Store Management</h1>
        </div>
      </header>

      <main className="ingest-main">
        {loading ? (
          <div className="loading-state">読み込み中...</div>
        ) : (
        <div className="ingest-form">
          <div className="ingest-form-field" style={{ maxWidth: '100%' }}>
            <label className="ingest-form-label">Vector Store Name</label>
            <input
              type="text"
              className="ingest-form-input"
              style={{ width: '1200px', maxWidth: '100%' }}
              placeholder="ベクトルストアの名前を入力してください"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
            />
          </div>

          <div className="ingest-form-field" style={{ maxWidth: '100%' }}>
            <label className="ingest-form-label">Description (Optional)</label>
            <textarea
              className="ingest-form-textarea"
              style={{ width: '1200px', maxWidth: '100%' }}
              placeholder="ベクトルストアの簡単な説明を入力してください（任意）"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          <div className="upload-section">
            <div className="upload-left">
              <div
                className={`dropzone ${isDragging ? "dragging" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="dropzone-content">
                  <h3 className="dropzone-title">Upload Files</h3>
                  <p className="dropzone-description">Drag and drop files here, or browse</p>
                  <label className="dropzone-button">
                    <input
                      type="file"
                      multiple
                      className="dropzone-input"
                      onChange={handleFileSelect}
                    />
                    Select Files
                  </label>
                </div>
              </div>
            </div>

            <div className="upload-right">
              <h2 className="section-title">Uploaded Files</h2>
              <div className="files-table-container">
                <table className="files-table">
                  <thead>
                    <tr>
                      <th>File Name</th>
                      <th>Size</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadedFiles.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="empty-state">
                          ファイルがアップロードされていません
                        </td>
                      </tr>
                    ) : (
                      uploadedFiles.map((file) => (
                        <tr key={file.id}>
                          <td className="file-name">{file.name}</td>
                          <td className="file-size">{formatFileSize(file.size)}</td>
                          <td className="file-actions">
                            <button
                              className="file-delete-button"
                              onClick={() => handleDeleteFile(file.id)}
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
            </div>
          </div>

          <div className="upload-progress-section">
            <div className="progress-header">
              <span className="progress-label">Upload Progress</span>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${uploadProgress}%` }}></div>
            </div>
            <span className="progress-percentage">{uploadProgress}%</span>
          </div>

          <h2 className="section-title">Registered Files in Vector Store</h2>
          <div className="files-table-container">
            <table className="files-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={3} className="empty-state">
                    登録済みファイルはありません
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="form-actions">
            <button className="button-primary" onClick={handleSave}>
              Save/Create
            </button>
            <button className="button-secondary" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
        )}
      </main>
    </div>
  );
}
