"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getAllVectorStores } from "@/lib/storage/indexed-db";
import type { VectorStoreRecord } from "@/lib/storage/schema";
import { loadConnection } from "@/lib/settings/connection-storage";
import {
  fetchVectorStoreFiles,
  fetchFileInfo,
  deleteVectorStoreFile,
  createVectorStore,
  uploadFileToOpenAI,
  attachFileToVectorStore,
  updateVectorStore as updateVectorStoreApi,
  type VectorStoreFileInfo
} from "@/lib/openai/vector-stores";
import "./ingest.css";

type UploadedFile = {
  id: string;
  file: File;
  name: string;
  size: number;
  progress: number;
  status: "pending" | "uploading" | "completed" | "error";
  error?: string;
};

type RegisteredFile = {
  id: string;
  filename: string;
  size: number;
  status: string;
  error?: string;
};

export default function IngestPage() {
  const searchParams = useSearchParams();
  const vectorStoreId = searchParams.get("id");

  const [storeName, setStoreName] = useState("");
  const [description, setDescription] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [registeredFiles, setRegisteredFiles] = useState<RegisteredFile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(!!vectorStoreId);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isUpdatingInfo, setIsUpdatingInfo] = useState(false);
  const [currentVectorStoreId, setCurrentVectorStoreId] = useState<string | null>(vectorStoreId);
  const [hasInfoChanged, setHasInfoChanged] = useState(false);
  const [originalName, setOriginalName] = useState("");
  const [originalDescription, setOriginalDescription] = useState("");

  const loadRegisteredFiles = useCallback(async (vsId?: string) => {
    const targetId = vsId || currentVectorStoreId;
    if (!targetId) return;

    setLoadingFiles(true);
    try {
      const connection = await loadConnection();
      if (!connection?.apiKey) {
        throw new Error("API接続が設定されていません");
      }

      const files = await fetchVectorStoreFiles(targetId, connection);

      // ファイル情報を並列取得
      const filesWithInfo = await Promise.all(
        files.map(async (file) => {
          try {
            const info = await fetchFileInfo(file.id, connection);
            return {
              id: file.id,
              filename: info.filename,
              size: info.size,
              status: file.status,
              error: file.error,
            };
          } catch (error) {
            console.error(`Failed to fetch file info for ${file.id}:`, error);
            return {
              id: file.id,
              filename: `(不明: ${file.id})`,
              size: 0,
              status: file.status,
              error: file.error,
            };
          }
        })
      );

      setRegisteredFiles(filesWithInfo);
    } catch (error) {
      console.error("Failed to load registered files:", error);
    } finally {
      setLoadingFiles(false);
    }
  }, [currentVectorStoreId]);

  useEffect(() => {
    if (!vectorStoreId) return;

    let cancelled = false;
    (async () => {
      try {
        const stores = await getAllVectorStores();
        const store = stores.find((s) => s.id === vectorStoreId);

        if (!cancelled && store) {
          setStoreName(store.name);
          setDescription(store.description || "");
          setOriginalName(store.name);
          setOriginalDescription(store.description || "");
          await loadRegisteredFiles();
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
  }, [vectorStoreId, loadRegisteredFiles]);

  // 名前または説明が変更されたかチェック
  useEffect(() => {
    if (vectorStoreId) {
      const nameChanged = storeName !== originalName;
      const descChanged = description !== originalDescription;
      setHasInfoChanged(nameChanged || descChanged);
    }
  }, [storeName, description, originalName, originalDescription, vectorStoreId]);

  const handleFiles = useCallback((files: File[]) => {
    // Vector Storeでサポートされているファイル形式
    const supportedExtensions = [
      '.c', '.cs', '.cpp', '.doc', '.docx', '.html', '.java', '.json', '.md',
      '.pdf', '.php', '.pptx', '.py', '.rb', '.tex', '.txt', '.css', '.js',
      '.sh', '.ts', '.csv', '.jpeg', '.jpg', '.gif', '.png', '.tar', '.xlsx',
      '.xml', '.zip'
    ];

    const validFiles: UploadedFile[] = [];
    const invalidFiles: string[] = [];

    for (const file of files) {
      const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
      if (ext && supportedExtensions.includes(ext)) {
        validFiles.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          name: file.name,
          size: file.size,
          progress: 0,
          status: "pending" as const,
        });
      } else {
        invalidFiles.push(file.name);
      }
    }

    if (invalidFiles.length > 0) {
      alert(`以下のファイルはサポートされていない形式のためスキップされました:\n${invalidFiles.join('\n')}\n\nサポート形式: ${supportedExtensions.join(', ')}`);
    }

    if (validFiles.length > 0) {
      setUploadedFiles((prev) => [...prev, ...validFiles]);
    }
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

  const handleDeleteRegisteredFile = useCallback(async (fileId: string, filename: string) => {
    const targetId = currentVectorStoreId || vectorStoreId;
    if (!targetId) return;

    if (!confirm(`「${filename}」を削除しますか？この操作は取り消せません。`)) {
      return;
    }

    try {
      const connection = await loadConnection();
      if (!connection?.apiKey) {
        throw new Error("API接続が設定されていません");
      }

      await deleteVectorStoreFile(targetId, fileId, connection);
      await loadRegisteredFiles();
      alert(`「${filename}」を削除しました`);
    } catch (error) {
      console.error("Failed to delete file:", error);
      alert(`削除に失敗しました: ${error instanceof Error ? error.message : "不明なエラー"}`);
    }
  }, [currentVectorStoreId, vectorStoreId, loadRegisteredFiles]);

  const handleUpdateInfo = useCallback(async () => {
    const targetId = currentVectorStoreId || vectorStoreId;
    if (!targetId) return;

    if (!storeName.trim()) {
      alert("Vector Store名を入力してください");
      return;
    }

    setIsUpdatingInfo(true);
    try {
      const connection = await loadConnection();
      if (!connection?.apiKey) {
        throw new Error("API接続が設定されていません");
      }

      await updateVectorStoreApi(
        targetId,
        storeName.trim(),
        description.trim() || undefined,
        connection
      );

      setOriginalName(storeName.trim());
      setOriginalDescription(description.trim());
      setHasInfoChanged(false);
      alert("Vector Storeの情報を更新しました");
    } catch (error) {
      console.error("Failed to update vector store info:", error);
      alert(`更新に失敗しました: ${error instanceof Error ? error.message : "不明なエラー"}`);
    } finally {
      setIsUpdatingInfo(false);
    }
  }, [currentVectorStoreId, vectorStoreId, storeName, description]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const handleSave = useCallback(async () => {
    if (!storeName.trim()) {
      alert("Vector Store名を入力してください");
      return;
    }

    if (uploadedFiles.length === 0 && !vectorStoreId) {
      alert("少なくとも1つのファイルをアップロードしてください");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const connection = await loadConnection();
      if (!connection?.apiKey) {
        throw new Error("API接続が設定されていません");
      }

      let targetVectorStoreId = currentVectorStoreId || vectorStoreId;

      // 新規作成の場合はVector Storeを作成
      if (!targetVectorStoreId) {
        targetVectorStoreId = await createVectorStore(
          storeName,
          description || undefined,
          connection
        );
        setCurrentVectorStoreId(targetVectorStoreId);
      }

      // ファイルをアップロード
      const totalFiles = uploadedFiles.length;
      let completedFiles = 0;

      for (const uploadFile of uploadedFiles) {
        try {
          // ステータスをuploadingに変更
          setUploadedFiles((prev) =>
            prev.map((f) =>
              f.id === uploadFile.id ? { ...f, status: "uploading" as const } : f
            )
          );

          // ファイルをOpenAI Filesにアップロード
          let fileId: string;
          try {
            fileId = await uploadFileToOpenAI(uploadFile.file, connection, (progress) => {
              setUploadedFiles((prev) =>
                prev.map((f) =>
                  f.id === uploadFile.id ? { ...f, progress } : f
                )
              );
            });
          } catch (uploadError) {
            throw new Error(`ファイルアップロードに失敗: ${uploadError instanceof Error ? uploadError.message : "不明なエラー"}`);
          }

          // Vector Storeに関連付け
          try {
            await attachFileToVectorStore(targetVectorStoreId, fileId, connection);
          } catch (attachError) {
            const errorMsg = attachError instanceof Error ? attachError.message : "不明なエラー";
            if (errorMsg.includes("File type not supported")) {
              throw new Error(`サポートされていないファイル形式です。Vector Storeでは特定のファイル形式のみサポートされています。`);
            }
            throw new Error(`Vector Storeへの追加に失敗: ${errorMsg}`);
          }

          // ステータスをcompletedに変更
          setUploadedFiles((prev) =>
            prev.map((f) =>
              f.id === uploadFile.id
                ? { ...f, status: "completed" as const, progress: 100 }
                : f
            )
          );

          completedFiles++;
          setUploadProgress(Math.round((completedFiles / totalFiles) * 100));
        } catch (error) {
          console.error(`Failed to upload file ${uploadFile.name}:`, error);
          const errorMessage = error instanceof Error ? error.message : "Upload failed";
          setUploadedFiles((prev) =>
            prev.map((f) =>
              f.id === uploadFile.id
                ? {
                    ...f,
                    status: "error" as const,
                    error: errorMessage,
                  }
                : f
            )
          );
        }
      }

      // 登録済みファイル一覧を再読み込み
      if (targetVectorStoreId) {
        await loadRegisteredFiles(targetVectorStoreId);
      }

      alert("アップロードが完了しました");

      // アップロード済みファイルリストをクリア（成功したもののみ）
      setUploadedFiles((prev) => prev.filter((f) => f.status === "error"));
    } catch (error) {
      console.error("Failed to save:", error);
      alert(`保存に失敗しました: ${error instanceof Error ? error.message : "不明なエラー"}`);
    } finally {
      setIsUploading(false);
    }
  }, [storeName, description, uploadedFiles, vectorStoreId, loadRegisteredFiles]);

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
            <div className="field-header">
              <label className="ingest-form-label">Vector Store Name</label>
              {vectorStoreId && hasInfoChanged && (
                <button
                  className="update-info-button"
                  onClick={handleUpdateInfo}
                  disabled={isUpdatingInfo}
                  type="button"
                >
                  {isUpdatingInfo ? "更新中..." : "名前・説明を更新"}
                </button>
              )}
            </div>
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
                      accept=".c,.cs,.cpp,.doc,.docx,.html,.java,.json,.md,.pdf,.php,.pptx,.py,.rb,.tex,.txt,.css,.js,.sh,.ts,.csv,.jpeg,.jpg,.gif,.png,.tar,.xlsx,.xml,.zip"
                      onChange={handleFileSelect}
                    />
                    Select Files
                  </label>
                  <p className="dropzone-hint">
                    サポート形式: .pdf, .txt, .md, .docx, .json, .csv, .py, .js, .ts, など
                  </p>
                </div>
              </div>
            </div>

            <div className="upload-right">
              <h2 className="section-title">Uploaded Files</h2>
              <div className="files-table-container">
                <table className="files-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>File Name</th>
                      <th>Size</th>
                      <th>Progress</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadedFiles.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="empty-state">
                          ファイルがアップロードされていません
                        </td>
                      </tr>
                    ) : (
                      uploadedFiles.map((file) => (
                        <tr key={file.id}>
                          <td className="file-status-icon">
                            {file.status === "completed" && (
                              <span className="checkmark">✓</span>
                            )}
                            {file.status === "uploading" && (
                              <span className="uploading-spinner">⟳</span>
                            )}
                            {file.status === "error" && (
                              <span className="error-icon" title={file.error}>✗</span>
                            )}
                            {file.status === "pending" && (
                              <span className="pending-icon">○</span>
                            )}
                          </td>
                          <td className="file-name">{file.name}</td>
                          <td className="file-size">{formatFileSize(file.size)}</td>
                          <td className="file-progress">
                            {file.status === "uploading" || file.status === "completed" ? (
                              <div className="file-progress-bar">
                                <div
                                  className="file-progress-fill"
                                  style={{ width: `${file.progress}%` }}
                                />
                                <span className="file-progress-text">{file.progress}%</span>
                              </div>
                            ) : (
                              <span>—</span>
                            )}
                          </td>
                          <td className="file-actions">
                            <button
                              className="file-delete-button"
                              onClick={() => handleDeleteFile(file.id)}
                              disabled={file.status === "uploading"}
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

          <div className="registered-files-section">
            <div className="registered-files-header">
              <h2 className="section-title">Registered Files in Vector Store</h2>
              <div className="registered-files-controls">
                {(currentVectorStoreId || vectorStoreId) && (
                  <>
                    <button
                      className="refresh-files-button"
                      onClick={() => void loadRegisteredFiles()}
                      disabled={loadingFiles}
                      type="button"
                      title="ファイル一覧を更新"
                    >
                      {loadingFiles ? "更新中..." : "更新"}
                    </button>
                    <div className="search-box">
                      <input
                        type="text"
                        className="search-input"
                        placeholder="ファイル名で検索..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      {searchQuery && (
                        <button
                          className="search-clear"
                          onClick={() => setSearchQuery("")}
                          type="button"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="files-table-container">
              {loadingFiles ? (
                <div className="loading-state">ファイル情報を読み込み中...</div>
              ) : (
                <table className="files-table">
                  <thead>
                    <tr>
                      <th>File Name</th>
                      <th>Size</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registeredFiles.filter(file =>
                      file.filename.toLowerCase().includes(searchQuery.toLowerCase())
                    ).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="empty-state">
                          {searchQuery ? "検索条件に一致するファイルがありません" : "登録済みファイルはありません"}
                        </td>
                      </tr>
                    ) : (
                      registeredFiles
                        .filter(file =>
                          file.filename.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((file) => (
                          <tr key={file.id}>
                            <td className="file-name">{file.filename}</td>
                            <td className="file-size">{formatFileSize(file.size)}</td>
                            <td className="file-status">
                              <span className={`status-badge status-${file.status}`}>
                                {file.status}
                              </span>
                              {file.error && (
                                <span className="file-error" title={file.error}>⚠️</span>
                              )}
                            </td>
                            <td className="file-actions">
                              <button
                                className="file-delete-button"
                                onClick={() => handleDeleteRegisteredFile(file.id, file.filename)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button
              className="button-primary"
              onClick={handleSave}
              disabled={isUploading}
            >
              {isUploading ? "Uploading..." : "Save/Create"}
            </button>
            <button
              className="button-secondary"
              onClick={handleCancel}
              disabled={isUploading}
            >
              Cancel
            </button>
          </div>
        </div>
        )}
      </main>
    </div>
  );
}
