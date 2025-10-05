"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { clearConversationHistory } from "@/lib/chat/session";

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
  const [savedFlags, setSavedFlags] = useState({ session: false, persistent: false });
  const [loading, setLoading] = useState(true);
  const { entries: logs, addLog, resetLogs } = useLogs();
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);

  const handleCopyLog = useCallback(async (log: LogEntry) => {
    const text = JSON.stringify(log, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLogId(log.id);
      setTimeout(() => setCopiedLogId(null), 2000);
    } catch (error) {
      console.error("ログのコピーに失敗しました", error);
      addLog(
        "error",
        "setup",
        "ログのコピーに失敗しました",
        error instanceof Error ? error.message : String(error),
      );
    }
  }, [addLog]);

  const requestTarget = useMemo(() => {
    const trimmed = baseUrl.trim().replace(/\/$/, "");
    return `${trimmed}/models`;
  }, [baseUrl]);

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
          addLog(
            "info",
            "setup",
            "設定を読み込みました",
            `保存ポリシー: ${stored.storagePolicy}`,
          );
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
          addLog(
            "error",
            "setup",
            "設定の読み込みに失敗しました",
            error instanceof Error ? error.message : String(error),
          );
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
  }, [addLog]);

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
        addLog(
          "info",
          "setup",
          "設定を保存しました",
          `保存ポリシー: ${storagePolicy}`,
        );
      } catch (error) {
        console.error(error);
        setStatus({
          state: "error",
          message:
            error instanceof Error
              ? `設定の保存に失敗しました: ${error.message}`
              : "設定の保存に失敗しました",
        });
        addLog(
          "error",
          "setup",
          "設定の保存に失敗しました",
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    [
      addLog,
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

  const handleClear = useCallback(() => {
    clearConnection();
    setSavedFlags({ session: false, persistent: false });
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
    addLog("info", "setup", "G5 設定から保存済み接続を削除しました");
  }, [addLog]);

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
      addLog("info", "setup", "IndexedDB の会話履歴を削除しました");
    } catch (error) {
      console.error(error);
      setConversationStatus({
        state: "error",
        message:
          error instanceof Error
            ? `会話履歴の削除に失敗しました: ${error.message}`
            : "会話履歴の削除に失敗しました",
      });
      addLog(
        "error",
        "setup",
        "IndexedDB 会話履歴の削除に失敗しました",
        error instanceof Error ? error.message : String(error),
      );
    }
  }, [addLog]);

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
            保存状況: セッション {savedFlags.session ? "✅" : "❌"} / 永続 {savedFlags.persistent ? "✅" : "❌"}
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
        <div className="section-card-title">会話履歴</div>
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
        <div className="section-card-title">接続・API ログ</div>
        <p className="section-card-description">
          接続テストや設定保存で生成されたログです。問題調査時に活用してください。
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
    </main>
  );
}
