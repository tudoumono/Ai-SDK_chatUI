"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearConnection,
  hasStoredConnection,
  loadConnection,
  saveConnection,
  type StoragePolicy,
} from "@/lib/settings/connection-storage";

type TestState = "idle" | "loading" | "success" | "error";

type ConnectionResult = {
  state: TestState;
  message: string;
  statusCode?: number;
};

const STORAGE_POLICIES: Array<{
  value: StoragePolicy;
  title: string;
  description: string;
  note?: string;
}> = [
  {
    value: "none",
    title: "保存しない",
    description:
      "API キーはメモリ上のみで扱い、タブを閉じると直ちに破棄されます。",
  },
  {
    value: "session",
    title: "一時保存",
    description:
      "IndexedDB に暗号化して保存。ブラウザを再起動すると削除されます。",
    note: "暗号化パスフレーズ未設定時は、一時的なランダム鍵を使用します。",
  },
  {
    value: "persistent",
    title: "永続保存",
    description:
      "暗号化パスフレーズの入力を必須にし、明示的に削除するまで保持します。",
    note: "共有端末では利用を推奨しません。",
  },
];

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

function headersToTextarea(headers?: Record<string, string>) {
  if (!headers) return "";
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

function buildModelsUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/$/, "");
  return `${trimmed}/models`;
}

function parseAdditionalHeaders(input: string):
  | { headers: Record<string, string> }
  | { error: string } {
  if (!input.trim()) {
    return { headers: {} };
  }

  const lines = input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const headers: Record<string, string> = {};

  for (const line of lines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      return { error: `"${line}" にコロン区切りがありません` };
    }

    const name = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!name || !value) {
      return { error: `"${line}" のヘッダ名または値が空です` };
    }

    headers[name] = value;
  }

  return { headers };
}

export default function WelcomePage() {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [httpProxy, setHttpProxy] = useState("");
  const [httpsProxy, setHttpsProxy] = useState("");
  const [additionalHeaders, setAdditionalHeaders] = useState("");
  const [headersError, setHeadersError] = useState<string | null>(null);
  const [storagePolicy, setStoragePolicy] =
    useState<StoragePolicy>("none");
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [result, setResult] = useState<ConnectionResult>({
    state: "idle",
    message: "接続テストは未実行です。",
  });
  const [savedFlags, setSavedFlags] = useState({ session: false, persistent: false });

  const requestTarget = useMemo(() => buildModelsUrl(baseUrl), [baseUrl]);

  const resetResult = useCallback(() => {
    setResult({ state: "idle", message: "接続テストは未実行です。" });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
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
      setSavedFlags(hasStoredConnection());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClearSavedConnection = useCallback(() => {
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
    setResult({
      state: "success",
      message: "保存済みの接続情報を削除しました。必要に応じて再度テストしてください。",
    });
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

      if (encryptionEnabled || storagePolicy === "persistent") {
        if (!passphrase.trim()) {
          setPassphraseError("暗号化パスフレーズを入力してください。");
          setResult({
            state: "error",
            message: "暗号化パスフレーズを入力してください。",
          });
          return;
        }
      }

      setPassphraseError(null);

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

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey.trim()}`,
      };

      Object.assign(headers, parsed.headers);

      setResult({ state: "loading", message: "接続テストを実行中です…" });

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
          const normalizedBaseUrl = baseUrl.trim();
          await saveConnection({
            apiKey: apiKey.trim(),
            baseUrl: normalizedBaseUrl,
            additionalHeaders: parsed.headers,
            httpProxy: httpProxy.trim() || undefined,
            httpsProxy: httpsProxy.trim() || undefined,
            storagePolicy,
            encryptionEnabled,
            passphrase:
              encryptionEnabled || storagePolicy === "persistent"
                ? passphrase.trim() || undefined
                : undefined,
          });
          setSavedFlags(hasStoredConnection());
          setResult({
            state: "success",
            statusCode: response.status,
            message: `接続成功: HTTP ${response.status}${suffix} / 保存ポリシー: ${policyLabel}`,
          });
          return;
        }

        const responseText = await response.text();
        const detail = responseText ? `レスポンス: ${responseText}` : "";

        setResult({
          state: "error",
          statusCode: response.status,
          message: `接続失敗: HTTP ${response.status}. ${detail}`.trim(),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "原因不明のエラーです";
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

  return (
    <main className="welcome-page">
      <section className="section-card">
        <h1 className="page-header-title">G0: ウェルカム / キー設定</h1>
        <p className="page-header-description">
          BYOK（Bring Your Own Key）モデルで API キー、Base URL、追加ヘッダを登録し、/v1/models で接続テストを実行します。
        </p>
        <p className="page-header-description">
          初期設定が完了したら <Link href="/chat">チャット画面</Link> へ遷移します。
        </p>
      </section>

      <section className="section-card">
        <div className="section-card-title">接続テスト</div>
        <p className="section-card-description">
          現在のリクエスト先:
          <code className="inline-code"> {requestTarget}</code>
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
              <p className="field-hint">
                HTTP 経由のリクエストで利用するプロキシ URL。未設定でも構いません。
              </p>
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
              <p className="field-hint">
                HTTPS 経由で利用するプロキシ URL。必要に応じて設定してください。
              </p>
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
                Proxy ゲートウェイや追加認証用のカスタムヘッダを指定できます。例:
                `X-Proxy-Token: abc123`。複数指定する場合は改行してください。
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
                    className={clsx(
                      "radio-card",
                      checked && "radio-card-active",
                    )}
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
                      <span className="radio-card-description">
                        {policy.description}
                      </span>
                      {policy.note ? (
                        <span className="radio-card-note">{policy.note}</span>
                      ) : null}
                    </div>
                  </label>
                );
              })}
            </div>
            <p className="field-hint">
              設定内容は今後 IndexedDB に保存予定です。永続保存を選ぶ場合は共有端末での利用に注意してください。
            </p>
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
              <span>
                履歴を暗号化（AES-GCM + PBKDF2 で鍵導出）
              </span>
            </label>
            <p className="field-hint">
              暗号化を有効にすると履歴と設定をパスフレーズで保護できます。
            </p>
          </div>

          {(encryptionEnabled || storagePolicy === "persistent") && (
            <div className="field-group">
              <label className="field-label" htmlFor="passphrase">
                暗号化パスフレーズ
                <span className="field-required">*</span>
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
                  ローカル保存時の復号に使用します。忘れた場合は復元できません。
                </p>
              )}
            </div>
          )}

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

        <div
          className={`status-banner status-${result.state}`}
          role="status"
        >
          <div className="status-title">
            接続ステータス
            {result.statusCode ? ` (HTTP ${result.statusCode})` : ""}
          </div>
          <p className="status-message">{result.message}</p>
          {result.state === "error" && (
            <ul className="status-guidance">
              <li>401/403: API キーまたは権限を再確認してください。</li>
              <li>429: 利用制限に達しています。待機または制限緩和をご検討ください。</li>
              <li>ネットワーク/CORS: ゲートウェイや Base URL の切り替えを試してください。</li>
            </ul>
          )}
        </div>

        <div className="form-navigation">
          {(savedFlags.session || savedFlags.persistent) && (
            <button
              className="outline-button"
              onClick={handleClearSavedConnection}
              type="button"
            >
              保存済み接続を削除
            </button>
          )}
          <Link className="primary-button" href="/dashboard">
            ダッシュボード (G1) へ移動
          </Link>
        </div>
      </section>

      <section className="section-card">
        <div className="section-card-title">保存ポリシー</div>
        <p className="section-card-description">
          本アプリでは API キーと履歴をローカルに閉じた形で扱います。暗号化設定と保存ポリシーは上記フォームの選択内容をもとに後続画面へ引き継ぎます。
        </p>
        <p className="section-card-description">
          配布形態はビルド済み静的アセット + BYOK を基本とし、CORS 要件を満たすゲートウェイ URL を利用者に案内してください。
        </p>
      </section>
    </main>
  );
}
