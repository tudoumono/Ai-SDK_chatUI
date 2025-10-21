"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLogs } from "@/lib/logs/store";
import type { LogEntry } from "@/lib/logs/types";
import { parseAdditionalHeaders } from "@/lib/settings/header-utils";
import {
  clearConnection,
  hasStoredConnection,
  loadConnection,
  saveConnection,
  type StoragePolicy,
} from "@/lib/settings/connection-storage";
import { clearConversationHistory, listConversations } from "@/lib/chat/session";
import {
  getAllVectorStores,
  upsertVectorStores,
  upsertConversations,
  recreateDatabase
} from "@/lib/storage/indexed-db";
import { downloadBundle, parseBundle } from "@/lib/export/bundle";
import {
  getAllLogs,
  clearAllLogs,
  getLogStats,
  saveLog as saveErrorLog,
  recreateErrorLogDatabase,
} from "@/lib/logging/error-logger";
import { clearAllValidationData } from "@/lib/settings/org-validation-guard";
import { createLogExportBundle, downloadLogBundle } from "@/lib/logging/log-sanitizer";
import type { LogEntry as ErrorLogEntry } from "@/lib/logging/error-logger";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertCircle, Download, Trash2, Database, Info } from "lucide-react";
import { isTauriEnvironment, saveFile } from "@/lib/utils/tauri-helpers";

const STORAGE_POLICIES: Array<{
  value: StoragePolicy;
  title: string;
  description: string;
  note?: string;
}> = [
  {
    value: "none",
    title: "保存しない",
    description: "API キーはメモリ上で扱い、ページを閉じると破棄されます。",
  },
  {
    value: "session",
    title: "セッション保存",
    description: "ブラウザの sessionStorage に暗号化または平文で保存します。",
    note: "ブラウザを閉じると自動で削除されます。",
  },
  {
    value: "persistent",
    title: "永続保存",
    description: "localStorage に保存し、明示的に削除するまで保持します。",
    note: "共有端末での利用は推奨されません。",
  },
];

function headersToTextarea(headers?: Record<string, string>) {
  if (!headers) return "";
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

type Status =
  | { state: "idle"; message: string }
  | { state: "loading"; message: string }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

export default function SettingsPage() {
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [httpProxy, setHttpProxy] = useState("");
  const [httpsProxy, setHttpsProxy] = useState("");
  const [additionalHeaders, setAdditionalHeaders] = useState("");
  const [headersError, setHeadersError] = useState<string | null>(null);
  const [storagePolicy, setStoragePolicy] = useState<StoragePolicy>("none");
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({
    state: "idle",
    message: "設定を読み込んでいます…",
  });
  const [conversationStatus, setConversationStatus] = useState<Status>({
    state: "idle",
    message: "会話履歴の操作は未実行です。",
  });
  const [dataStatus, setDataStatus] = useState<Status>({
    state: "idle",
    message: "データのインポート/エクスポートが可能です。",
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [savedFlags, setSavedFlags] = useState({
    session: false,
    persistent: false,
    encrypted: false,
  });
  const [loading, setLoading] = useState(true);
  const { entries: logs, addLog, resetLogs } = useLogs();
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);

  // エラーログ管理用のState
  const [errorLogs, setErrorLogs] = useState<ErrorLogEntry[]>([]);
  const [logStats, setLogStats] = useState<{
    total: number;
    byLevel: Record<string, number>;
    byCategory: Record<string, number>;
  }>({ total: 0, byLevel: {}, byCategory: {} });
  const [errorLogStatus, setErrorLogStatus] = useState<Status>({
    state: "idle",
    message: "エラーログを管理できます。",
  });
  const [dbRecreateStatus, setDbRecreateStatus] = useState<Status>({
    state: "idle",
    message: "DBに問題がある場合のみ使用してください。",
  });
  // エラーログを読み込んだかどうかのフラグ（メモリーリーク対策）
  const [errorLogsLoaded, setErrorLogsLoaded] = useState(false);

  const handleCopyLog = useCallback(async (log: LogEntry) => {
    const text = JSON.stringify(log, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLogId(log.id);
      setTimeout(() => setCopiedLogId(null), 2000);
    } catch (error) {
      console.error("ログのコピーに失敗しました", error);
    }
  }, []);

  const requestTarget = useMemo(() => {
    const trimmed = baseUrl.trim().replace(/\/$/, "");
    return `${trimmed}/models`;
  }, [baseUrl]);

  // エラーログを読み込む（メモリーリーク対策：手動実行のみ、最新50件のみ取得）
  const loadErrorLogs = useCallback(async () => {
    // 重複実行を防ぐ
    if (errorLogStatus.state === "loading") {
      return;
    }

    setErrorLogStatus({ state: "loading", message: "エラーログを読み込み中..." });
    try {
      const [logsData, statsData] = await Promise.all([
        getAllLogs(50), // メモリー対策：最新50件のみ取得
        getLogStats(),
      ]);
      setErrorLogs(logsData);
      setLogStats(statsData);
      setErrorLogsLoaded(true);
      setErrorLogStatus({
        state: "success",
        message: `エラーログを読み込みました（表示: ${logsData.length}件 / 全体: ${statsData.total}件）`
      });
    } catch (error) {
      console.error("Failed to load error logs:", error);
      setErrorLogStatus({
        state: "error",
        message: error instanceof Error ? `読み込み失敗: ${error.message}` : "読み込みに失敗しました",
      });
      await saveErrorLog(
        "error",
        "storage",
        "エラーログの読み込みに失敗しました",
        error instanceof Error ? error : undefined
      );
    }
  }, [errorLogStatus.state]);

  // エラーログをエクスポート（メモリー対策：全ログを一度に取得）
  const handleExportErrorLogs = useCallback(async () => {
    setErrorLogStatus({ state: "loading", message: "エラーログをエクスポート中..." });
    try {
      // エクスポート用に全ログを取得（最大500件まで）
      const allLogs = await getAllLogs(500);

      if (allLogs.length === 0) {
        setErrorLogStatus({ state: "error", message: "エクスポートするログがありません。" });
        return;
      }

      const bundle = createLogExportBundle(allLogs);
      await downloadLogBundle(bundle);

      setErrorLogStatus({
        state: "success",
        message: `エラーログをエクスポートしました（${allLogs.length}件）`,
      });
      await saveErrorLog("info", "storage", "エラーログをエクスポートしました");
    } catch (error) {
      console.error("Failed to export error logs:", error);
      setErrorLogStatus({
        state: "error",
        message: error instanceof Error ? `エクスポート失敗: ${error.message}` : "エクスポートに失敗しました",
      });
      await saveErrorLog(
        "error",
        "storage",
        "エラーログのエクスポートに失敗しました",
        error instanceof Error ? error : undefined
      );
    }
  }, []);

  // エラーログをクリア
  const handleClearErrorLogs = useCallback(async () => {
    if (!confirm("すべてのエラーログを削除しますか？この操作は取り消せません。")) {
      return;
    }

    setErrorLogStatus({ state: "loading", message: "エラーログを削除中..." });
    try {
      await clearAllLogs();
      // stateをクリア（DBから再読み込みしない）
      setErrorLogs([]);
      setLogStats({ total: 0, byLevel: {}, byCategory: {} });
      setErrorLogStatus({ state: "success", message: "エラーログを削除しました。" });
    } catch (error) {
      console.error("Failed to clear error logs:", error);
      setErrorLogStatus({
        state: "error",
        message: error instanceof Error ? `削除失敗: ${error.message}` : "削除に失敗しました",
      });
    }
  }, []);

  // デバッグ用: テストエラーを生成
  const handleGenerateTestErrors = useCallback(async () => {
    // 様々な種類のテストエラーを生成
    await saveErrorLog(
      "error",
      "runtime",
      "テストエラー: ランタイムエラーが発生しました",
      new Error("This is a test runtime error"),
      { testData: "sample", apiKey: "sk-test1234567890", password: "secret123" }
    );

    await saveErrorLog(
      "error",
      "api",
      "テストエラー: API呼び出しに失敗しました",
      new Error("API connection failed"),
      { endpoint: "https://api.openai.com/v1/chat/completions", statusCode: 500 }
    );

    await saveErrorLog(
      "warning",
      "storage",
      "テストWarning: ストレージ容量が不足しています",
      undefined,
      { available: "10MB", required: "50MB" }
    );

    await saveErrorLog(
      "error",
      "startup",
      "テストエラー: アプリケーション起動時にエラーが発生しました",
      new Error("Initialization failed"),
      {
        config: { apiKey: "sk-proj-abcdefghijklmnopqrstuvwxyz", baseUrl: "https://api.openai.com/v1" },
        token: "bearer_token_12345",
        passphrase: "my-secret-passphrase-2024"
      }
    );

    await saveErrorLog(
      "info",
      "ui",
      "テストInfo: ユーザーがボタンをクリックしました",
      undefined,
      { buttonId: "test-button", timestamp: Date.now() }
    );

    setErrorLogStatus({
      state: "success",
      message: "5件のテストエラーを生成しました。「更新」ボタンをクリックして確認してください。",
    });
  }, []);

  // テスト用: ダウンロード機能をテスト
  const [downloadTestStatus, setDownloadTestStatus] = useState<Status>({ state: "idle", message: "" });
  const [showFallbackContent, setShowFallbackContent] = useState(false);
  const [fallbackContent, setFallbackContent] = useState("");
  const [fallbackFilename, setFallbackFilename] = useState("");

  const handleTestDownload = useCallback(async () => {
    const isTauri = isTauriEnvironment();
    console.log('[TEST] Environment check:', isTauri ? 'Tauri' : 'Browser');

    setDownloadTestStatus({
      state: "loading",
      message: isTauri
        ? "ファイル保存ダイアログを開いています..."
        : "テストファイルをダウンロード中..."
    });
    setShowFallbackContent(false);

    try {
      const testData = {
        test: true,
        timestamp: new Date().toISOString(),
        message: "これはテストファイルです",
        environment: isTauri ? "Tauri (exe/app)" : "Browser",
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
        tauriCheck: {
          windowHasTauri: typeof window !== 'undefined' && '__TAURI__' in window,
          isTauriResult: isTauri
        }
      };

      const json = JSON.stringify(testData, null, 2);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `download-test-${timestamp}.json`;

      console.log('[TEST] Saving file:', filename);
      console.log('[TEST] Content length:', json.length);

      // 代替表示用に保存
      setFallbackContent(json);
      setFallbackFilename(filename);

      // saveFile関数を直接呼び出し
      await saveFile(json, filename);

      // 成功メッセージ
      if (isTauri) {
        setDownloadTestStatus({
          state: "success",
          message: `✅ ファイル保存ダイアログを完了しました。\n\nファイルを保存した場合は、指定した場所に「${filename}」が保存されています。\n\n⚠️ ダイアログをキャンセルした場合は、下の「内容を表示」ボタンから確認できます。`
        });
      } else {
        setTimeout(() => {
          setDownloadTestStatus({
            state: "success",
            message: `✅ ダウンロードを試行しました。ファイル名: ${filename}\n\n⚠️ ダウンロードフォルダにファイルが見つからない場合は、下の「内容を表示」ボタンをクリックしてください。`
          });
        }, 500);
      }

    } catch (error) {
      console.error("[TEST] Failed:", error);
      setDownloadTestStatus({
        state: "error",
        message: error instanceof Error
          ? `❌ ファイル保存失敗: ${error.message}\n\n下の「内容を表示」ボタンから手動でコピーできます。`
          : "❌ ファイル保存に失敗しました\n\n下の「内容を表示」ボタンから手動でコピーできます。"
      });
    }
  }, []);

  const handleShowFallback = useCallback(() => {
    setShowFallbackContent(!showFallbackContent);
  }, [showFallbackContent]);

  const handleCopyContent = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fallbackContent);
      alert("内容をクリップボードにコピーしました！\n\nテキストエディタに貼り付けて、ファイルとして保存してください。");
    } catch (error) {
      console.error("Failed to copy:", error);
      alert("クリップボードへのコピーに失敗しました。\n\n内容を手動で選択してコピーしてください。");
    }
  }, [fallbackContent]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const stored = await loadConnection();
        if (cancelled) {
          return;
        }
        if (stored) {
          setBaseUrl(stored.baseUrl || "https://api.openai.com/v1");
          setApiKey(stored.apiKey ?? "");
          setHttpProxy(stored.httpProxy ?? "");
          setHttpsProxy(stored.httpsProxy ?? "");
          setAdditionalHeaders(headersToTextarea(stored.additionalHeaders));
          setStoragePolicy(stored.storagePolicy);
          setEncryptionEnabled(stored.encryptionEnabled);
        }
        setSavedFlags(hasStoredConnection());
        setStatus({
          state: "idle",
          message: stored ? "保存済み設定を読み込みました。" : "設定が保存されていません。",
        });
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setStatus({
            state: "error",
            message:
              error instanceof Error
                ? `設定の読み込みに失敗しました: ${error.message}`
                : "設定の読み込みに失敗しました",
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // 依存配列を空にしてメモリーリークを防止

  // エラーログは手動で読み込むように変更（メモリーエラー対策）
  // useEffect(() => {
  //   loadErrorLogs();
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, []); // 初回のみ実行

  const handleSave = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!apiKey.trim()) {
        setStatus({
          state: "error",
          message: "API キーを入力してください。",
        });
        return;
      }

      if (encryptionEnabled && !passphrase.trim()) {
        setPassphraseError("暗号化パスフレーズを入力してください。");
        setStatus({
          state: "error",
          message: "暗号化パスフレーズを入力してください。",
        });
        return;
      }

      const parsed = parseAdditionalHeaders(additionalHeaders);
      if ("error" in parsed) {
        setHeadersError(parsed.error);
        setStatus({
          state: "error",
          message: "追加ヘッダの形式エラーを修正してください。",
        });
        return;
      }
      setHeadersError(null);
      setPassphraseError(null);

      setStatus({ state: "loading", message: "設定を保存しています…" });
      try {
        await saveConnection({
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          additionalHeaders: parsed.headers,
          httpProxy: httpProxy.trim() || undefined,
          httpsProxy: httpsProxy.trim() || undefined,
          storagePolicy,
          encryptionEnabled,
          passphrase: passphrase.trim() || undefined,
        });
        setSavedFlags(hasStoredConnection());
        setStatus({
          state: "success",
          message: "設定を保存しました。/v1/models への接続で動作を確認してください。",
        });
      } catch (error) {
        console.error(error);
        setStatus({
          state: "error",
          message:
            error instanceof Error
              ? `設定の保存に失敗しました: ${error.message}`
              : "設定の保存に失敗しました",
        });
      }
    },
    [
      additionalHeaders,
      apiKey,
      baseUrl,
      encryptionEnabled,
      httpProxy,
      httpsProxy,
      passphrase,
      storagePolicy,
    ],
  );

  const handleClear = useCallback(async () => {
    await clearConnection();
    setSavedFlags({ session: false, persistent: false, encrypted: false });
    setApiKey("");
    setBaseUrl("https://api.openai.com/v1");
    setHttpProxy("");
    setHttpsProxy("");
    setAdditionalHeaders("");
    setStoragePolicy("none");
    setEncryptionEnabled(false);
    setPassphrase("");
    setPassphraseError(null);
    setStatus({
      state: "success",
      message: "保存済みの接続設定を削除しました。必要に応じて再設定してください。",
    });
  }, []);

  const handleClearConversationHistory = useCallback(async () => {
    if (
      !confirm(
        "このブラウザに保存されているすべての会話・メッセージを削除します。よろしいですか？",
      )
    ) {
      return;
    }
    setConversationStatus({ state: "loading", message: "会話履歴を削除しています…" });
    try {
      await clearConversationHistory();
      setConversationStatus({
        state: "success",
        message: "IndexedDB の会話履歴を削除しました。",
      });
    } catch (error) {
      console.error(error);
      setConversationStatus({
        state: "error",
        message:
          error instanceof Error
            ? `会話履歴の削除に失敗しました: ${error.message}`
            : "会話履歴の削除に失敗しました",
      });
    }
  }, []);

  const handleExportData = useCallback(async () => {
    setDataStatus({ state: "loading", message: "データをエクスポート中..." });
    try {
      const conversations = await listConversations();
      const vectorStores = await getAllVectorStores().catch(() => []);

      if (conversations.length === 0 && vectorStores.length === 0) {
        setDataStatus({ state: "error", message: "エクスポートするデータがありません。" });
        return;
      }

      await downloadBundle({
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        conversations,
        vectorStores,
      });

      setDataStatus({
        state: "success",
        message: `データをエクスポートしました（会話: ${conversations.length}件、ベクターストア: ${vectorStores.length}件）`
      });
    } catch (error) {
      console.error(error);
      setDataStatus({
        state: "error",
        message: error instanceof Error ? `エクスポートに失敗: ${error.message}` : "エクスポートに失敗しました",
      });
    }
  }, []);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportData = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setDataStatus({ state: "loading", message: "データをインポート中..." });
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const bundle = parseBundle(json);

      await Promise.all([
        upsertConversations(bundle.conversations),
        upsertVectorStores(bundle.vectorStores ?? []),
      ]);

      setDataStatus({
        state: "success",
        message: `${file.name} をインポートしました（会話: ${bundle.conversations.length}件、ベクターストア: ${bundle.vectorStores?.length ?? 0}件）`,
      });

      // ファイル入力をリセット
      if (event.target) {
        event.target.value = '';
      }
    } catch (error) {
      console.error(error);
      setDataStatus({
        state: "error",
        message: error instanceof Error ? `インポートに失敗: ${error.message}` : "インポートに失敗しました",
      });
    }
  }, []);

  const handleRecreateDatabase = useCallback(async () => {
    if (!confirm(
      "⚠️ 警告: すべてのデータベースを完全に削除して再作成します。\n\n" +
      "削除されるデータ:\n" +
      "- 会話履歴とメッセージ\n" +
      "- ベクトルストア設定\n" +
      "- 添付ファイル\n" +
      "- 設定情報\n" +
      "- エラーログ\n" +
      "- APIキー検証キャッシュとロック\n\n" +
      "保持されるデータ:\n" +
      "- 組織IDホワイトリスト\n" +
      "- 管理者パスワード\n\n" +
      "この操作は取り消せません。本当に実行しますか？"
    )) {
      return;
    }

    // 二重確認
    if (!confirm("もう一度確認します。\n\nすべてのデータベースを削除して再作成しますか？")) {
      return;
    }

    setDbRecreateStatus({ state: "loading", message: "データベースを再作成中..." });
    try {
      // メインDBとエラーログDBを両方削除（組織設定は自動保持される）
      await recreateDatabase();
      await recreateErrorLogDatabase();

      // APIキー検証キャッシュとロックをクリア
      clearAllValidationData();

      setDbRecreateStatus({
        state: "success",
        message: "データベースを完全に再作成しました。APIキーロックも解除されました。ページをリロードしてください。",
      });

      // 3秒後に自動リロード
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (error) {
      console.error(error);
      setDbRecreateStatus({
        state: "error",
        message:
          error instanceof Error
            ? `DB再作成に失敗: ${error.message}`
            : "DB再作成に失敗しました",
      });
    }
  }, []);

  return (
    <main className="page-grid">
      <div className="page-header settings-header">
        <h1 className="page-header-title">設定</h1>
        <p className="page-header-description">
          モデル一覧、プロキシ設定、履歴保存ポリシーを集約し、Responses API との接続性をコントロールします。
        </p>
      </div>

      <section className="section-card">
        <div className="section-card-title">接続設定</div>
        <p className="section-card-description">
          API キーやプロキシなどの接続設定は Welcome 画面で行ってください。
        </p>
        <div className="form-navigation">
          <Link href="/welcome" className="primary-button">
            Welcome 画面へ
          </Link>
        </div>
      </section>

      <section className="section-card" style={{ display: 'none' }}>
        <div className="section-card-title">旧接続設定（非表示）</div>
        <form className="form-grid" onSubmit={handleSave}>
          <div className="field-group">
            <label className="field-label" htmlFor="settings-api-key">
              API キー <span className="field-required">*</span>
            </label>
            <input
              autoComplete="off"
              className="field-input"
              id="settings-api-key"
              placeholder="例: sk-..."
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="settings-base-url">
              Base URL
            </label>
            <input
              autoComplete="off"
              className="field-input"
              id="settings-base-url"
              placeholder="デフォルト: https://api.openai.com/v1"
              type="url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </div>

          <div className="field-grid-two">
            <div className="field-group">
              <label className="field-label" htmlFor="settings-http-proxy">
                HTTP プロキシ
              </label>
              <input
                autoComplete="off"
                className="field-input"
                id="settings-http-proxy"
                placeholder="例: http://proxy.example.com:8080"
                value={httpProxy}
                onChange={(event) => setHttpProxy(event.target.value)}
              />
              <p className="field-hint">HTTP 経由のリクエストで利用するゲートウェイ URL。</p>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="settings-https-proxy">
                HTTPS プロキシ
              </label>
              <input
                autoComplete="off"
                className="field-input"
                id="settings-https-proxy"
                placeholder="例: https://secure-proxy.example.com:8443"
                value={httpsProxy}
                onChange={(event) => setHttpsProxy(event.target.value)}
              />
              <p className="field-hint">HTTPS 通信で利用するゲートウェイ URL。</p>
            </div>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="settings-additional-headers">
              追加ヘッダ（1 行 = `Header-Name: value`）
            </label>
            <textarea
              className="field-textarea"
              id="settings-additional-headers"
              placeholder="例: X-Proxy-Token: example-token"
              rows={3}
              value={additionalHeaders}
              onChange={(event) => {
                setAdditionalHeaders(event.target.value);
                if (headersError) {
                  setHeadersError(null);
                }
              }}
            />
            {headersError ? (
              <p className="field-error">{headersError}</p>
            ) : (
              <p className="field-hint">
                ゲートウェイや追加認証用のカスタムヘッダを設定できます。複数行で複数指定可能です。
              </p>
            )}
          </div>

          <fieldset className="field-group">
            <legend className="field-label">保存ポリシー</legend>
            <div className="radio-card-group">
              {STORAGE_POLICIES.map((policy) => {
                const checked = storagePolicy === policy.value;
                return (
                  <label
                    key={policy.value}
                    className={`radio-card ${checked ? "radio-card-active" : ""}`}
                  >
                    <input
                      checked={checked}
                      className="radio-card-input"
                      name="storage-policy"
                      onChange={() => setStoragePolicy(policy.value)}
                      type="radio"
                      value={policy.value}
                    />
                    <div className="radio-card-body">
                      <span className="radio-card-title">{policy.title}</span>
                      <span className="radio-card-description">{policy.description}</span>
                      {policy.note ? (
                        <span className="radio-card-note">{policy.note}</span>
                      ) : null}
                    </div>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="field-group">
            <label className="toggle-row">
              <input
                checked={encryptionEnabled}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setEncryptionEnabled(enabled);
                  if (!enabled) {
                    setPassphrase("");
                    setPassphraseError(null);
                  }
                }}
                type="checkbox"
              />
              <span>API キーを AES-GCM で暗号化して保存する</span>
            </label>
            <p className="field-hint">
              暗号化を有効にすると保存時にパスフレーズが必要です。復号しない限り API キーは表示されません。
            </p>
          </div>

          {encryptionEnabled && (
            <div className="field-group">
              <label className="field-label" htmlFor="settings-passphrase">
                暗号化パスフレーズ <span className="field-required">*</span>
              </label>
              <input
                autoComplete="off"
                className="field-input"
                id="settings-passphrase"
                placeholder="8文字以上を推奨"
                type="password"
                value={passphrase}
                onChange={(event) => {
                  setPassphrase(event.target.value);
                  if (passphraseError) {
                    setPassphraseError(null);
                  }
                }}
              />
              {passphraseError ? (
                <p className="field-error">{passphraseError}</p>
              ) : (
                <p className="field-hint">
                  暗号化された設定を復号する際に必要です。忘れると API キーを復元できません。
                </p>
              )}
            </div>
          )}

          <div className="form-actions">
            <button className="primary-button" disabled={status.state === "loading"} type="submit">
              {status.state === "loading" ? "保存中…" : "設定を保存"}
            </button>
          </div>
        </form>

        <div className={`status-banner status-${status.state}`} role="status">
          <div className="status-title">{status.message}</div>
          <p className="status-message">
            保存状況: セッション {savedFlags.session ? "✅" : "❌"} / 永続 {savedFlags.persistent ? "✅" : "❌"} /
            暗号化 {" "}
            {savedFlags.encrypted ? "🔒" : "🔓"}
          </p>
        </div>

        <div className="form-navigation">
          <button
            className="outline-button"
            disabled={loading}
            onClick={handleClear}
            type="button"
          >
            保存済み接続を削除
          </button>
        </div>
      </section>

      <section className="section-card">
        <div className="section-card-title">データのインポート/エクスポート</div>
        <p className="section-card-description">
          会話履歴とベクターストア設定をJSON形式でエクスポート/インポートできます。
          ブラウザ版とTauri版（デスクトップアプリ）間でのデータ移行や、バックアップ・復元に利用できます。
        </p>
        <div className="form-navigation">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportData}
            style={{ display: 'none' }}
          />
          <button
            className="primary-button"
            onClick={handleExportData}
            disabled={dataStatus.state === "loading"}
            type="button"
          >
            {dataStatus.state === "loading" ? "エクスポート中..." : "📦 データをエクスポート"}
          </button>
          <button
            className="outline-button"
            onClick={handleImportClick}
            disabled={dataStatus.state === "loading"}
            type="button"
          >
            {dataStatus.state === "loading" ? "インポート中..." : "📥 データをインポート"}
          </button>
        </div>
        <div className={`status-banner status-${dataStatus.state}`} role="status">
          <div className="status-title">{dataStatus.message}</div>
          <p className="status-message">
            エクスポートしたJSONファイルには会話履歴、メッセージ、ベクターストアIDが含まれます。APIキーは含まれません。
          </p>
        </div>
      </section>

      <section className="section-card">
        <div className="section-card-title">会話履歴の削除</div>
        <p className="section-card-description">
          このブラウザの IndexedDB に保存されているチャット履歴を一括削除できます。Vector Store など他のデータは影響を受けません。
        </p>
        <div className="form-navigation">
          <button
            className="outline-button"
            onClick={handleClearConversationHistory}
            type="button"
          >
            会話履歴をすべて削除
          </button>
        </div>
        <div className={`status-banner status-${conversationStatus.state}`} role="status">
          <div className="status-title">{conversationStatus.message}</div>
          <p className="status-message">
            削除後はブラウザをリロードすると初期状態（サンプル会話のみ）で表示されます。
          </p>
        </div>
      </section>

      <section className="section-card" style={{ borderColor: "var(--error)", borderWidth: "2px" }}>
        <div className="section-card-title" style={{ color: "var(--error)" }}>
          ⚠️ データベースの完全再作成（緊急用）
        </div>
        <p className="section-card-description">
          IndexedDBに深刻な問題が発生した場合のみ使用してください。
          すべてのデータベース（会話、ベクトルストア、設定、エラーログ）を完全に削除して再作成します。
        </p>
        <p className="section-card-description" style={{ color: "var(--error)", fontWeight: "bold" }}>
          ⚠️ この操作はすべてのデータを削除します。必要に応じて先にエクスポートしてください。
        </p>
        <div style={{ marginTop: "1rem", padding: "1rem", background: "var(--background-secondary)", borderRadius: "var(--radius-md)" }}>
          <p style={{ color: "var(--accent)", fontWeight: "600", marginBottom: "0.5rem" }}>
            ✅ 保持されるデータ:
          </p>
          <ul style={{ marginLeft: "1.5rem", marginBottom: "1rem", color: "var(--accent)" }}>
            <li>組織IDホワイトリスト</li>
            <li>管理者パスワード</li>
          </ul>
          <p style={{ color: "var(--error)", fontWeight: "600", marginBottom: "0.5rem" }}>
            🗑️ 削除されるデータ:
          </p>
          <ul style={{ marginLeft: "1.5rem", color: "var(--foreground-secondary)" }}>
            <li>会話履歴とメッセージ</li>
            <li>ベクトルストア設定</li>
            <li>添付ファイル</li>
            <li>設定情報</li>
            <li>エラーログ</li>
            <li>APIキーロック・検証キャッシュ</li>
          </ul>
        </div>
        <div className="form-navigation">
          <button
            className="outline-button"
            onClick={handleRecreateDatabase}
            disabled={dbRecreateStatus.state === "loading"}
            type="button"
            style={{ borderColor: "var(--error)", color: "var(--error)" }}
          >
            {dbRecreateStatus.state === "loading" ? "再作成中..." : "🗑️ データベースを完全に再作成"}
          </button>
        </div>
        <div className={`status-banner status-${dbRecreateStatus.state}`} role="status">
          <div className="status-title">{dbRecreateStatus.message}</div>
          <p className="status-message">
            実行前に2回の確認ダイアログが表示されます。成功後は自動的にページがリロードされます。
          </p>
        </div>
      </section>

      <section className="section-card">
        <div className="section-card-title">暗号化と復号について</div>
        <p className="section-card-description">
          パスフレーズ付きの暗号化を有効にすると、API キーは AES-GCM(PBKDF2) で暗号化され、パスフレーズを再入力するまで復号されません。
        </p>
        <p className="section-card-description">
          G4/G5 の画面でパスフレーズ入力を促すことで、暗号化済みデータを安全に扱えます。共有端末では「保存しない」または「セッション保存」を推奨します。
        </p>
      </section>

      <section className="section-card">
        <div className="section-card-title">接続状況ログ</div>
        <p className="section-card-description">
          接続テストや設定保存で生成されたログです。APIキーが正しく設定されているか、接続できない場合はこちらを確認してください。
        </p>
        <div className="log-toolbar">
          <button className="outline-button" onClick={resetLogs} type="button">
            ログをクリア
          </button>
        </div>
        {logs.length === 0 ? (
          <p className="section-card-description">現在表示できるログはありません。</p>
        ) : (
          <ul className="log-list">
            {logs
              .slice()
              .reverse()
              .map((log) => (
                <li key={log.id} className={`log-entry log-${log.level}`}>
                  <div className="log-entry-header">
                    <span className="log-entry-level">[{log.level.toUpperCase()}]</span>
                    <span className="log-entry-scope">{log.scope}</span>
                    <span className="log-entry-time">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                    <div className="log-entry-actions">
                      <button
                        className="outline-button log-copy-button"
                        onClick={() => handleCopyLog(log)}
                        type="button"
                      >
                        {copiedLogId === log.id ? "コピー済み" : "コピー"}
                      </button>
                    </div>
                  </div>
                  <div className="log-entry-message">{log.message}</div>
                  {log.detail ? (
                    <pre className="log-entry-detail">{log.detail}</pre>
                  ) : null}
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="section-card">
        <div className="section-card-title">🚨 詳細エラーログ（開発者向け）</div>
        <p className="section-card-description">
          アプリケーション全体で発生したエラーの詳細情報を記録します。
          予期せぬエラーやトラブルが発生した際は、このログをエクスポートして開発者に送信してください。
        </p>

        {/* 統計情報 */}
        <div className="error-log-stats">
          <div className="stat-card">
            <Database size={20} color="var(--accent)" />
            <div className="stat-content">
              <div className="stat-value">{logStats.total}</div>
              <div className="stat-label">総ログ数</div>
            </div>
          </div>
          <div className="stat-card">
            <AlertCircle size={20} color="var(--error)" />
            <div className="stat-content">
              <div className="stat-value">{logStats.byLevel.error || 0}</div>
              <div className="stat-label">エラー</div>
            </div>
          </div>
        </div>

        {/* アクションボタン */}
        <div className="form-navigation">
          <button
            className="primary-button"
            onClick={loadErrorLogs}
            disabled={errorLogStatus.state === "loading"}
            type="button"
          >
            <Database size={16} />
            更新
          </button>
          <button
            className="outline-button"
            onClick={handleExportErrorLogs}
            disabled={errorLogStatus.state === "loading" || errorLogs.length === 0}
            type="button"
          >
            <Download size={16} />
            {errorLogStatus.state === "loading" ? "エクスポート中..." : "ログをエクスポート"}
          </button>
          <button
            className="outline-button"
            onClick={handleClearErrorLogs}
            disabled={errorLogStatus.state === "loading" || errorLogs.length === 0}
            type="button"
          >
            <Trash2 size={16} />
            ログを削除
          </button>
          <button
            className="outline-button"
            onClick={handleGenerateTestErrors}
            disabled={errorLogStatus.state === "loading"}
            type="button"
            style={{ borderColor: "var(--warning)", color: "var(--warning)" }}
          >
            🧪 テストエラーを生成
          </button>
        </div>

        {/* ステータス表示 */}
        <div className={`status-banner status-${errorLogStatus.state}`} role="status">
          <div className="status-title">{errorLogStatus.message}</div>
          <p className="status-message">
            エクスポートされたJSONファイルにはAPIキーなどの機密情報は含まれません（自動的にサニタイズされます）。
          </p>
        </div>

        {/* ログ一覧 */}
        {!errorLogsLoaded ? (
          <EmptyState
            icon={Info}
            title="エラーログを読み込んでいません"
            description="メモリーリーク対策のため、エラーログは自動的に読み込まれません。上の「更新」ボタンをクリックして読み込んでください。"
          />
        ) : errorLogs.length === 0 ? (
          <EmptyState
            icon={AlertCircle}
            title="エラーログはありません"
            description="アプリケーションでエラーが発生すると、ここに記録されます。"
          />
        ) : (
          <div className="error-log-list">
            <div className="error-log-header">
              <span>レベル</span>
              <span>カテゴリ</span>
              <span>メッセージ</span>
              <span>日時</span>
            </div>
            {errorLogs.map((log, index) => (
              <div key={log.id || index} className="error-log-item">
                <div className="error-log-level">
                  <StatusBadge
                    status={
                      log.level === "error"
                        ? "error"
                        : log.level === "warning"
                        ? "warning"
                        : log.level === "info"
                        ? "idle"
                        : "idle"
                    }
                    text={log.level}
                  />
                </div>
                <div className="error-log-category">{log.category}</div>
                <div className="error-log-message">{log.message}</div>
                <div className="error-log-time">
                  {new Date(log.timestamp).toLocaleString("ja-JP", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            ))}
            {logStats.total > errorLogs.length && (
              <p className="error-log-footer">
                最新{errorLogs.length}件を表示しています（全{logStats.total}件）
              </p>
            )}
          </div>
        )}
      </section>

      <section className="section-card" style={{ borderColor: "var(--accent)", borderWidth: "1px" }}>
        <div className="section-card-title">
          <Info size={20} style={{ display: "inline", marginRight: "8px", verticalAlign: "middle" }} />
          診断情報（exe版トラブルシューティング用）
        </div>
        <p className="section-card-description">
          ファイル保存機能が動作しない場合、以下の情報を確認してください。
        </p>

        <div style={{
          marginTop: "1rem",
          padding: "1rem",
          background: "var(--background-secondary)",
          borderRadius: "var(--radius-md)",
          fontFamily: "monospace",
          fontSize: "14px"
        }}>
          <div style={{ marginBottom: "0.5rem" }}>
            <strong>実行環境:</strong>{" "}
            <span style={{ color: isTauriEnvironment() ? "var(--success, #10b981)" : "var(--warning, #f59e0b)" }}>
              {isTauriEnvironment() ? "✅ Tauri (exe/app)" : "⚠️ ブラウザ"}
            </span>
          </div>
          <div style={{ marginBottom: "0.5rem" }}>
            <strong>__TAURI__ グローバル変数:</strong>{" "}
            {typeof window !== 'undefined' && '__TAURI__' in window ? "✅ 存在する" : "❌ 存在しない"}
          </div>
          <div style={{ marginBottom: "0.5rem" }}>
            <strong>ユーザーエージェント:</strong>{" "}
            <div style={{ wordBreak: "break-all", fontSize: "12px", marginTop: "4px" }}>
              {typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'}
            </div>
          </div>
          <div>
            <strong>ファイル保存方式:</strong>{" "}
            {isTauriEnvironment() ? "Tauri Dialog + FS Plugin" : "Browser Download (Blob + <a>)"}
          </div>
        </div>

        <div style={{
          marginTop: "1rem",
          padding: "1rem",
          background: "var(--background-tertiary, #f9fafb)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-color)"
        }}>
          <p style={{ margin: 0, fontSize: "14px", color: "var(--foreground-secondary)" }}>
            <strong>トラブルシューティング:</strong>
          </p>
          <ul style={{ marginTop: "8px", marginBottom: 0, paddingLeft: "20px", fontSize: "14px", color: "var(--foreground-secondary)" }}>
            <li>環境が「ブラウザ」と表示される場合 → Tauri版として正しくビルドされていません</li>
            <li>環境が「Tauri」だがダウンロードできない → Tauri権限設定を確認してください</li>
            <li>エラーメッセージが表示される → そのメッセージを開発者に報告してください</li>
          </ul>
        </div>

        {/* テストダウンロードボタン */}
        <div style={{ marginTop: "1rem" }}>
          <button
            onClick={handleTestDownload}
            disabled={downloadTestStatus.state === "loading"}
            className="button-primary"
            style={{ width: "100%" }}
          >
            {downloadTestStatus.state === "loading" ? "テスト中..." : "🧪 ダウンロード機能をテスト"}
          </button>

          {downloadTestStatus.state !== "idle" && downloadTestStatus.message && (
            <div
              className={`status-banner status-${downloadTestStatus.state}`}
              role="status"
              style={{ marginTop: "0.5rem", whiteSpace: "pre-line" }}
            >
              <div className="status-title">{downloadTestStatus.message}</div>
            </div>
          )}

          {/* 代替手段: 内容を表示/コピー */}
          {(downloadTestStatus.state === "success" || downloadTestStatus.state === "error") && fallbackContent && (
            <div style={{ marginTop: "0.5rem" }}>
              <button
                onClick={handleShowFallback}
                className="outline-button"
                style={{ width: "100%", marginBottom: "0.5rem" }}
              >
                {showFallbackContent ? "📁 内容を非表示" : "📄 内容を表示（手動コピー用）"}
              </button>

              {showFallbackContent && (
                <div style={{
                  marginTop: "0.5rem",
                  padding: "1rem",
                  background: "var(--background-secondary)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-color)"
                }}>
                  <div style={{ marginBottom: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ fontSize: "14px" }}>ファイル名: {fallbackFilename}</strong>
                    <button
                      onClick={handleCopyContent}
                      className="outline-button"
                      style={{ padding: "0.25rem 0.5rem", fontSize: "12px" }}
                    >
                      📋 クリップボードにコピー
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={fallbackContent}
                    style={{
                      width: "100%",
                      minHeight: "200px",
                      fontFamily: "monospace",
                      fontSize: "12px",
                      padding: "0.5rem",
                      border: "1px solid var(--border-color)",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--background)",
                      color: "var(--foreground)"
                    }}
                  />
                  <p style={{ marginTop: "0.5rem", fontSize: "12px", color: "var(--foreground-secondary)" }}>
                    💡 上の「クリップボードにコピー」ボタンをクリックするか、テキストを手動で選択してコピーし、
                    テキストエディタに貼り付けて「{fallbackFilename}」として保存してください。
                  </p>
                </div>
              )}
            </div>
          )}

          <p style={{ marginTop: "0.5rem", fontSize: "12px", color: "var(--foreground-secondary)" }}>
            このボタンをクリックすると、小さなテストファイルをダウンロードして、ダウンロード機能が正常に動作するかを確認できます。
            ダウンロードが機能しない場合は、手動でコピーする方法も提供されます。
          </p>
        </div>
      </section>
    </main>
  );
}
