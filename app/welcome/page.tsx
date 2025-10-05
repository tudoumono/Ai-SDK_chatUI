"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { appendLog } from "@/lib/logs/store";
import {
  hasStoredConnection,
  loadConnection,
  saveConnection,
  clearConnection,
  type StoragePolicy,
} from "@/lib/settings/connection-storage";
import {
  buildRequestHeaders,
  parseAdditionalHeaders,
} from "@/lib/settings/header-utils";

const STORAGE_POLICIES: Array<{
  value: StoragePolicy;
  title: string;
  description: string;
  note?: string;
}> = [
  {
    value: "none",
    title: "保存しない",
    description: "API キーはメモリ上で扱い、タブを閉じると破棄されます。",
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

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

function headersToTextarea(headers?: Record<string, string>) {
  if (!headers) return "";
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

type TestState = "idle" | "loading" | "success" | "error";

type ConnectionResult = {
  state: TestState;
  message: string;
  statusCode?: number;
};

export default function WelcomePage() {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [httpProxy, setHttpProxy] = useState("");
  const [httpsProxy, setHttpsProxy] = useState("");
  const [additionalHeaders, setAdditionalHeaders] = useState("");
  const [headersError, setHeadersError] = useState<string | null>(null);
  const [storagePolicy, setStoragePolicy] = useState<StoragePolicy>("none");
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [result, setResult] = useState<ConnectionResult>({
    state: "idle",
    message: "接続テストは未実行です。",
  });
  const [savedFlags, setSavedFlags] = useState({ session: false, persistent: false });
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const requestTarget = useMemo(() => {
    const trimmed = baseUrl.trim().replace(/\/$/, "");
    return `${trimmed}/models`;
  }, [baseUrl]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadConnection();
      if (cancelled || !stored) {
        setSavedFlags(hasStoredConnection());
        return;
      }
      setApiKey(stored.apiKey ?? "");
      setBaseUrl(stored.baseUrl || DEFAULT_BASE_URL);
      setHttpProxy(stored.httpProxy ?? "");
      setHttpsProxy(stored.httpsProxy ?? "");
      setAdditionalHeaders(headersToTextarea(stored.additionalHeaders));
      setStoragePolicy(stored.storagePolicy);
      setEncryptionEnabled(stored.encryptionEnabled);
      if (stored.httpProxy || stored.httpsProxy || stored.additionalHeaders) {
        setAdvancedOpen(true);
      }
      setSavedFlags(hasStoredConnection());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resetResult = useCallback(() => {
    setResult({ state: "idle", message: "接続テストは未実行です。" });
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!apiKey.trim()) {
        setResult({
          state: "error",
          message: "API キーを入力してください。",
        });
        return;
      }

      if (encryptionEnabled && !passphrase.trim()) {
        setPassphraseError("暗号化パスフレーズを入力してください。");
        setResult({
          state: "error",
          message: "暗号化パスフレーズを入力してください。",
        });
        return;
      }

      const parsed = parseAdditionalHeaders(additionalHeaders);
      if ("error" in parsed) {
        setHeadersError(parsed.error);
        setResult({
          state: "error",
          message: "追加ヘッダの形式エラーを修正してください。",
        });
        return;
      }
      setHeadersError(null);
      setPassphraseError(null);

      const headers = buildRequestHeaders(
        { Authorization: `Bearer ${apiKey.trim()}` },
        parsed.headers,
      );

      setResult({ state: "loading", message: "接続テストを実行中です…" });
      appendLog({
        level: "info",
        scope: "api",
        message: `接続テスト開始 ${requestTarget}`,
        detail: JSON.stringify(Array.from(headers.entries())),
      });

      try {
        const response = await fetch(requestTarget, {
          method: "GET",
          headers,
          cache: "no-store",
        });

        if (response.ok) {
          const payload = await response.json().catch(() => null);
          const count = Array.isArray(payload?.data) ? payload.data.length : undefined;
          const suffix = count !== undefined ? ` (取得モデル数: ${count})` : "";
          const policyLabel =
            STORAGE_POLICIES.find((policy) => policy.value === storagePolicy)?.title ??
            "不明";

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

          appendLog({
            level: "info",
            scope: "setup",
            message: "接続テスト成功",
            detail: `HTTP ${response.status}${suffix}`,
          });

          setResult({
            state: "success",
            statusCode: response.status,
            message: `接続成功: HTTP ${response.status}${suffix} / 保存ポリシー: ${policyLabel}`,
          });
          return;
        }

        const responseText = await response.text();
        const detail = responseText ? `レスポンス: ${responseText}` : "";

        appendLog({
          level: "error",
          scope: "api",
          message: `接続テスト失敗 HTTP ${response.status}`,
          detail,
        });

        setResult({
          state: "error",
          statusCode: response.status,
          message: `接続失敗: HTTP ${response.status}. ${detail}`.trim(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "原因不明のエラーです";
        appendLog({
          level: "error",
          scope: "api",
          message: "接続テスト例外",
          detail: message,
        });
        setResult({
          state: "error",
          message: `接続テストに失敗しました: ${message}`,
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
      requestTarget,
      storagePolicy,
    ],
  );

  const handleClear = useCallback(() => {
    clearConnection();
    setSavedFlags({ session: false, persistent: false });
    setApiKey("");
    setBaseUrl(DEFAULT_BASE_URL);
    setHttpProxy("");
    setHttpsProxy("");
    setAdditionalHeaders("");
    setStoragePolicy("none");
    setEncryptionEnabled(false);
    setPassphrase("");
    setPassphraseError(null);
    setResult({ state: "success", message: "保存済み設定を削除しました。" });
    appendLog({
      level: "info",
      scope: "setup",
      message: "保存済み接続を削除しました",
    });
  }, []);

  return (
    <main className="welcome-page">
      <section className="section-card">
        <h1 className="page-header-title">ようこそ！まずは接続を確認しましょう</h1>
        <p className="page-header-description">
          API キーと（必要に応じて）プロキシ設定を入力して `/v1/models` への接続をテストします。
          初回セットアップが完了したら「ダッシュボード (G1)」へ進み、以降の運用設定は G5 設定画面で調整できます。
        </p>
        <p className="page-header-description">
          保存状況: セッション {savedFlags.session ? "✅" : "❌"} / 永続 {savedFlags.persistent ? "✅" : "❌"}
        </p>
      </section>

      <section className="section-card">
        <div className="section-card-title">接続テスト</div>
        <p className="section-card-description">
          現在のリクエスト先: <code className="inline-code">{requestTarget}</code>
        </p>
        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="field-group">
            <label className="field-label" htmlFor="api-key">
              API キー <span className="field-required">*</span>
            </label>
            <input
              autoComplete="off"
              className="field-input"
              id="api-key"
              placeholder="sk-..."
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="base-url">
              Base URL
            </label>
            <input
              autoComplete="off"
              className="field-input"
              id="base-url"
              placeholder={DEFAULT_BASE_URL}
              type="url"
              value={baseUrl}
              onChange={(event) => {
                setBaseUrl(event.target.value);
                resetResult();
              }}
            />
          </div>

          <details
            className="advanced-panel"
            open={advancedOpen}
            onToggle={(event) => {
              const element = event.currentTarget as HTMLDetailsElement;
              setAdvancedOpen(element.open);
            }}
          >
            <summary>詳細設定（プロキシ、追加ヘッダ、保存ポリシー）</summary>
            <div className="advanced-content">
              <div className="field-grid-two">
                <div className="field-group">
                  <label className="field-label" htmlFor="http-proxy">
                    HTTP プロキシ
                  </label>
                  <input
                    autoComplete="off"
                    className="field-input"
                    id="http-proxy"
                    placeholder="http://proxy.example.com:8080"
                    value={httpProxy}
                    onChange={(event) => setHttpProxy(event.target.value)}
                  />
                  <p className="field-hint">HTTP 経由でアクセスする際のゲートウェイ URL。</p>
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="https-proxy">
                    HTTPS プロキシ
                  </label>
                  <input
                    autoComplete="off"
                    className="field-input"
                    id="https-proxy"
                    placeholder="https://secure-proxy.example.com:8443"
                    value={httpsProxy}
                    onChange={(event) => setHttpsProxy(event.target.value)}
                  />
                  <p className="field-hint">HTTPS 通信で利用するゲートウェイ URL。</p>
                </div>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="additional-headers">
                  追加ヘッダ（1 行 = `Header-Name: value`）
                </label>
                <textarea
                  className="field-textarea"
                  id="additional-headers"
                  placeholder={"X-Proxy-Token: example-token"}
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
                    ゲートウェイや追加認証用ヘッダを設定できます。複数行で複数指定してください。
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
                        className={clsx("radio-card", checked && "radio-card-active")}
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
                  暗号化を有効にするとパスフレーズが必須になります。忘れると復号できません。
                </p>
              </div>

              {encryptionEnabled && (
                <div className="field-group">
                  <label className="field-label" htmlFor="passphrase">
                    暗号化パスフレーズ <span className="field-required">*</span>
                  </label>
                  <input
                    autoComplete="off"
                    className="field-input"
                    id="passphrase"
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
                      G5 設定画面などで復号する際に必要です。忘れると API キーを復元できません。
                    </p>
                  )}
                </div>
              )}
            </div>
          </details>

          <div className="form-actions">
            <button
              className="primary-button"
              disabled={result.state === "loading"}
              type="submit"
            >
              {result.state === "loading" ? "テスト中…" : "/v1/models に接続"}
            </button>
          </div>
        </form>

        <div className={`status-banner status-${result.state}`} role="status">
          <div className="status-title">
            接続ステータス
            {result.statusCode ? ` (HTTP ${result.statusCode})` : ""}
          </div>
          <p className="status-message">{result.message}</p>
          {result.state === "error" && (
            <ul className="status-guidance">
              <li>401/403: API キーまたは権限を再確認してください。</li>
              <li>429: 利用制限に達しています。待機または制限緩和をご検討ください。</li>
              <li>
                ネットワーク/CORS: プロキシや追加ヘッダが必要な場合は「詳細設定」を展開して入力し直してください。
              </li>
              <li>
                既存設定を編集したい場合は <Link href="/settings">G5 設定</Link> を開いてください。
              </li>
            </ul>
          )}
        </div>

        <div className="form-navigation">
          <button className="outline-button" onClick={handleClear} type="button">
            保存済み接続を削除
          </button>
          <Link className="outline-button" href="/settings">
            詳細設定 (G5) へ移動
          </Link>
          <Link className="primary-button" href="/dashboard">
            ダッシュボード (G1) へ進む
          </Link>
        </div>
      </section>
    </main>
  );
}
