"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Shield } from "lucide-react";
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
import { validateOrgWhitelist } from "@/lib/openai/org-validation";
import { getWhitelistedOrgIds } from "@/lib/settings/org-whitelist";
import {
  saveValidationResult,
  clearValidationResult,
  lockApiKeyInput,
  unlockApiKeyInput,
  isApiKeyLocked,
} from "@/lib/settings/org-validation-guard";
import { validateBaseUrl } from "@/lib/security/base-url";
import {
  getSecureConfigStatus,
  getConfigCandidates,
  loadSecureConfigFromPath,
  type SecureConfigSearchPath,
  type ConfigCandidate,
} from "@/lib/security/secure-config";

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
  const [encryptionEnabled, setEncryptionEnabled] = useState(true);
  const [passphrase, setPassphrase] = useState("");
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [result, setResult] = useState<ConnectionResult>({
    state: "idle",
    message: "接続テストは未実行です。",
  });
  const [savedFlags, setSavedFlags] = useState({ session: false, persistent: false, encrypted: false });
  const [whitelistEnabled, setWhitelistEnabled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [secureConfigInfo, setSecureConfigInfo] = useState<
    {
      path: string | null;
      status: "applied" | "missing" | "error" | "unsupported" | "none";
      searchedPaths: SecureConfigSearchPath[];
    }
    | null
  >(null);
  const [configCandidates, setConfigCandidates] = useState<ConfigCandidate[]>([]);
  const [showConfigSelector, setShowConfigSelector] = useState(false);
  const [selectedConfigPath, setSelectedConfigPath] = useState<string | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);

  const requestTarget = useMemo(() => {
    const result = validateBaseUrl(baseUrl);
    const normalized = result.ok ? result.normalized : DEFAULT_BASE_URL;
    return `${normalized}/models`;
  }, [baseUrl]);

  const secureConfigBanner = useMemo(() => {
    if (!secureConfigInfo || secureConfigInfo.status === "none") {
      return null;
    }
    const pathLabel = secureConfigInfo.path ?? null;
    const searchedPaths = secureConfigInfo.searchedPaths ?? [];
    const searchedList =
      searchedPaths.length > 0 ? (
        <ul style={{ margin: "8px 0 0", paddingLeft: "20px" }}>
          {searchedPaths.map((item) => (
            <li key={`${item.label}:${item.path}`} style={{ marginBottom: "6px" }}>
              <span>{item.label}</span>
              <div>
                <code style={{ display: "inline-block", marginTop: "4px", fontSize: "12px" }}>{item.path}</code>
              </div>
            </li>
          ))}
        </ul>
      ) : null;

    switch (secureConfigInfo.status) {
      case "applied": {
        const matched = pathLabel
          ? searchedPaths.find((entry) => entry.path === pathLabel)
          : undefined;
        const description = matched
          ? `${matched.label} にある config.pkg を読み込みました。`
          : pathLabel
          ? `パス: ${pathLabel} から設定を読み込みました。`
          : "設定ファイルを読み込みました。";

        return (
          <div className="status-banner status-success">
            <div className="status-title">config.pkg を適用中</div>
            <div className="status-message">
              <p style={{ marginBottom: matched ? "8px" : 0 }}>{description}</p>
              {matched && pathLabel && (
                <code style={{ display: "inline-block", fontSize: "12px" }}>{pathLabel}</code>
              )}
            </div>
          </div>
        );
      }
      case "missing":
        return (
          <div className="status-banner status-info">
            <div className="status-title">config.pkg は見つかりませんでした</div>
            <div className="status-message">
              <p style={{ marginBottom: "8px" }}>
                配布用の設定ファイル <code>config.pkg</code> が見つかりませんでした。次の場所を自動的に探しました:
              </p>
              {searchedList}
              <p style={{ marginTop: "12px" }}>
                ファイルが手元にある場合は、<strong>Ai-SDK ChatUI.exe と同じフォルダ</strong>に <code>config.pkg</code> を置いてからアプリを再起動してください。
                アプリが設定フォルダへ反映します。ご不明な場合は配布担当者にお問い合わせください。
              </p>
              {configCandidates.length > 0 && (
                <div style={{ marginTop: "16px" }}>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => setShowConfigSelector(true)}
                    style={{ fontSize: "0.875rem", padding: "0.5rem 1rem" }}
                  >
                    config.pkg を探して読み込む
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      case "unsupported":
        return (
          <div className="status-banner status-info">
            <div className="status-title">config.pkg はこの環境では利用できません</div>
            <p className="status-message">ブラウザ版では配布設定ファイルは読み込まれません。</p>
          </div>
        );
      case "error":
        return (
          <div className="status-banner status-error">
            <div className="status-title">config.pkg の読み込みに失敗しました</div>
            <div className="status-message">
              <p style={{ marginBottom: pathLabel ? "8px" : "0" }}>
                設定ファイルの読み込み中にエラーが発生しました。詳細はログを確認してください。
              </p>
              {pathLabel && (
                <p style={{ marginBottom: searchedList ? "8px" : 0 }}>
                  対象のファイル:
                  <br />
                  <code style={{ display: "inline-block", marginTop: "4px", fontSize: "12px" }}>{pathLabel}</code>
                </p>
              )}
              {searchedList}
            </div>
          </div>
        );
      default:
        return null;
    }
  }, [secureConfigInfo, configCandidates.length]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadConnection();
      if (cancelled) {
        return;
      }

      if (stored) {
        setApiKey(stored.apiKey ?? "");
        setBaseUrl(stored.baseUrl || DEFAULT_BASE_URL);
        setHttpProxy(stored.httpProxy ?? "");
        setHttpsProxy(stored.httpsProxy ?? "");
        setAdditionalHeaders(headersToTextarea(stored.additionalHeaders));
        setStoragePolicy(stored.storagePolicy);
        setEncryptionEnabled(stored.encryptionEnabled);
      }

      setSavedFlags(hasStoredConnection());

      // Check if whitelist is configured
      const whitelistOrgIds = await getWhitelistedOrgIds();
      setWhitelistEnabled(whitelistOrgIds.length > 0);

      // Check if API key is locked
      setIsLocked(isApiKeyLocked());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const refreshStatus = () => {
      setSecureConfigInfo(getSecureConfigStatus());
    };
    refreshStatus();
    const handler = (event: StorageEvent) => {
      if (event.key === "secure-config:last-path" || event.key === "secure-config:last-status") {
        refreshStatus();
      }
    };
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("storage", handler);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const candidates = await getConfigCandidates();
      if (cancelled) {
        return;
      }
      setConfigCandidates(candidates);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resetResult = useCallback(() => {
    setResult({ state: "idle", message: "接続テストは未実行です。" });
  }, []);

  const handleLoadConfigFromPath = useCallback(async (path: string) => {
    setIsLoadingConfig(true);
    try {
      appendLog({
        level: "info",
        scope: "setup",
        message: `config.pkg を読み込んでいます: ${path}`,
      });

      const result = await loadSecureConfigFromPath(path);

      if (result?.config) {
        // Force reload the page to apply the config
        window.location.reload();
      } else {
        appendLog({
          level: "error",
          scope: "setup",
          message: "config.pkg の読み込みに失敗しました",
        });
        alert("config.pkg の読み込みに失敗しました。");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendLog({
        level: "error",
        scope: "setup",
        message: "config.pkg の読み込みエラー",
        detail: message,
      });
      alert(`エラー: ${message}`);
    } finally {
      setIsLoadingConfig(false);
    }
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

      const baseUrlValidation = validateBaseUrl(baseUrl);
      if (!baseUrlValidation.ok) {
        setResult({
          state: "error",
          message: baseUrlValidation.message,
        });
        return;
      }

      const normalizedBaseUrl = baseUrlValidation.normalized;
      const target = `${normalizedBaseUrl}/models`;

      const headers = buildRequestHeaders(
        { Authorization: `Bearer ${apiKey.trim()}` },
        parsed.headers,
      );

      setResult({ state: "loading", message: "接続テストを実行中です…" });

      // APIキーをマスクしてログ出力
      const maskedHeaders = Array.from(headers.entries()).map(([key, value]) => {
        if (key.toLowerCase() === 'authorization') {
          // Bearer sk-proj-xxx... → Bearer sk-proj-****...末尾4文字
          const match = value.match(/^(Bearer\s+)(.+)$/i);
          if (match) {
            const token = match[2];
            const masked = token.length > 8
              ? `${token.substring(0, 8)}****${token.substring(token.length - 4)}`
              : '****';
            return [key, `${match[1]}${masked}`];
          }
        }
        return [key, value];
      });

      appendLog({
        level: "info",
        scope: "api",
        message: `接続テスト開始 ${target}`,
        detail: JSON.stringify(maskedHeaders),
      });

      try {
        const response = await fetch(target, {
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

          // Validate organization whitelist if enabled
          if (whitelistEnabled) {
            setResult({
              state: "loading",
              message: "組織IDを検証中...",
            });

            const validation = await validateOrgWhitelist(apiKey.trim(), normalizedBaseUrl);

            if (!validation.valid) {
              appendLog({
                level: "error",
                scope: "setup",
                message: "組織ID検証失敗",
                detail: validation.error || "Unknown error",
              });

              setResult({
                state: "error",
                message: `組織ID検証エラー: ${validation.error || "このAPIキーは許可されていません"}`,
              });
              return;
            }

            appendLog({
              level: "info",
              scope: "setup",
              message: "組織ID検証成功",
              detail: `Matched org: ${validation.matchedOrgId || "N/A"}`,
            });

            // 検証結果をキャッシュに保存（軽量な検証用）
            await saveValidationResult(apiKey.trim(), validation.matchedOrgId || "");
            // APIキー入力をロック
            lockApiKeyInput();
            setIsLocked(true);
          } else {
            // ホワイトリストが無効な場合はキャッシュをクリア
            clearValidationResult();
          }

          await saveConnection({
            baseUrl: normalizedBaseUrl,
            apiKey: apiKey.trim(),
            additionalHeaders: parsed.headers,
            httpProxy: httpProxy.trim() || undefined,
            httpsProxy: httpsProxy.trim() || undefined,
            storagePolicy,
            encryptionEnabled,
            passphrase: passphrase.trim() || undefined,
          });
          setBaseUrl(normalizedBaseUrl);
          setSavedFlags(hasStoredConnection());

          appendLog({
            level: "info",
            scope: "setup",
            message: "接続テスト成功",
            detail: `HTTP ${response.status}${suffix}`,
          });

          const whitelistMessage = whitelistEnabled ? " / 組織ID検証: OK" : "";
          setResult({
            state: "success",
            statusCode: response.status,
            message: `接続成功: HTTP ${response.status}${suffix}${whitelistMessage} / 保存ポリシー: ${policyLabel}`,
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
      storagePolicy,
      whitelistEnabled,
    ],
  );

  const handleUnlock = useCallback(() => {
    if (!confirm("⚠️ APIキーのロックを解除すると、検証キャッシュも削除されます。\n\n再度APIキーを入力し、組織ID検証を行う必要があります。\n\n続行しますか？")) {
      return;
    }
    unlockApiKeyInput(); // 検証キャッシュも削除される
    setIsLocked(false);
    setResult({ state: "idle", message: "ロックを解除しました。APIキーを再入力してください。" });
    appendLog({
      level: "info",
      scope: "setup",
      message: "APIキーのロックを解除しました",
    });
  }, []);

  const handleClear = useCallback(async () => {
    await clearConnection();
    unlockApiKeyInput(); // ロック解除＋検証キャッシュクリア
    setIsLocked(false);
    setSavedFlags({ session: false, persistent: false, encrypted: false });
    setApiKey("");
    setBaseUrl(DEFAULT_BASE_URL);
    setHttpProxy("");
    setHttpsProxy("");
    setAdditionalHeaders("");
    setStoragePolicy("none");
    setEncryptionEnabled(true); // デフォルトに戻す
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
    <>
      <main className="page-grid">
        <div className="page-header">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
            <div>
              <h1 className="page-header-title">ようこそ！まずは接続を確認しましょう</h1>
              {whitelistEnabled && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem", color: "var(--accent)" }}>
                  <Shield size={16} />
                  <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>組織IDホワイトリスト検証が有効です</span>
                </div>
              )}
            </div>
            <Link
              href="/admin"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 1rem",
                background: "var(--background-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                textDecoration: "none",
                color: "var(--foreground)",
                fontSize: "0.875rem",
                transition: "all var(--transition-fast)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--accent)";
                e.currentTarget.style.color = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.color = "var(--foreground)";
              }}
            >
              <Shield size={16} />
              管理者画面
            </Link>
          </div>
        <p className="page-header-description">
          API キーと（必要に応じて）プロキシ設定を入力して `/v1/models` への接続をテストします。
        </p>
        <div className="storage-status-container">
          <div className="storage-status-badges">
            <div className={`storage-badge ${savedFlags.session ? 'storage-badge-active' : 'storage-badge-inactive'}`}>
              <span className="storage-badge-icon">{savedFlags.session ? '✓' : '－'}</span>
              <span className="storage-badge-label">セッション保存</span>
            </div>
            <div className={`storage-badge ${savedFlags.persistent ? 'storage-badge-active' : 'storage-badge-inactive'}`}>
              <span className="storage-badge-icon">{savedFlags.persistent ? '✓' : '－'}</span>
              <span className="storage-badge-label">永続保存（オプション）</span>
            </div>
            <div className={`storage-badge ${savedFlags.encrypted ? 'storage-badge-encrypted' : 'storage-badge-not-encrypted'}`}>
              <span className="storage-badge-icon">{savedFlags.encrypted ? '🔒' : '🔓'}</span>
              <span className="storage-badge-label">暗号化</span>
            </div>
          </div>
          <p className="storage-status-hint">
            ※ セッション保存のみでも利用可能です。永続保存は共有端末では推奨されません。
          </p>
        </div>
      </div>

      {secureConfigBanner}

      <section className="section-card">
        <div className="section-card-title">接続テスト</div>
        <p className="section-card-description">
          現在のリクエスト先: <code className="inline-code">{requestTarget}</code>
        </p>
        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="field-group">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label className="field-label" htmlFor="api-key">
                API キー <span className="field-required">*</span>
              </label>
              {isLocked && (
                <span style={{ fontSize: "0.875rem", color: "var(--accent)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  🔒 認証済み（ロック中）
                </span>
              )}
            </div>
            <input
              autoComplete="off"
              className="field-input"
              id="api-key"
              placeholder="例: sk-..."
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              disabled={isLocked}
              style={isLocked ? { backgroundColor: "var(--background-secondary)", cursor: "not-allowed" } : {}}
            />
            {isLocked && (
              <div style={{ marginTop: "0.5rem" }}>
                <button
                  type="button"
                  className="outline-button"
                  onClick={handleUnlock}
                  style={{ fontSize: "0.875rem", padding: "0.375rem 0.75rem" }}
                >
                  🔓 ロック解除（検証キャッシュを削除）
                </button>
                <p className="field-hint" style={{ marginTop: "0.5rem" }}>
                  ⚠️ ロックを解除すると検証キャッシュが削除され、再度組織ID検証が必要になります。
                </p>
              </div>
            )}
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
              readOnly
              disabled
              style={{ backgroundColor: "var(--background-secondary)", cursor: "not-allowed" }}
            />
            <p className="field-hint">
              セキュリティ上の理由により、Welcome画面ではBase URLを変更できません。変更が必要な場合は<Link href="/settings">設定画面</Link>をご利用ください。
            </p>
          </div>

          <div className="advanced-panel">
            <div className="advanced-panel-title">詳細設定（プロキシ、追加ヘッダ、保存ポリシー）</div>
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
                    placeholder="例: http://proxy.example.com:8080"
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
                    placeholder="例: https://secure-proxy.example.com:8443"
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

                      // 暗号化を無効にする場合は警告を表示
                      if (!enabled) {
                        const confirmed = window.confirm(
                          "⚠️ 警告: 暗号化を無効にすると、API キーが平文で保存されます。\n\n" +
                          "セキュリティリスクが高まりますが、本当に無効化しますか？"
                        );
                        if (!confirmed) {
                          return; // キャンセルされた場合は変更しない
                        }
                        setPassphrase("");
                        setPassphraseError(null);
                      }

                      setEncryptionEnabled(enabled);
                    }}
                    type="checkbox"
                  />
                  <span>API キーを AES-GCM で暗号化して保存する（推奨）</span>
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
                      設定画面などで復号する際に必要です。忘れると API キーを復元できません。
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button
              className="primary-button"
              disabled={result.state === "loading" || isLocked}
              type="submit"
            >
              {result.state === "loading" ? "テスト中…" : isLocked ? "認証済み（ロック中）" : "/v1/models に接続"}
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
                ネットワーク/CORS: プロキシや追加ヘッダが必要な場合は詳細設定欄で再入力してください。
              </li>
              <li>
                既存設定を編集したい場合は <Link href="/settings">設定</Link> を開いてください。
              </li>
            </ul>
          )}
        </div>

        <div className="form-navigation">
          <button className="outline-button" onClick={handleClear} type="button">
            保存済み接続を削除
          </button>
        </div>
      </section>
    </main>

    {showConfigSelector && (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}
        onClick={() => setShowConfigSelector(false)}
      >
        <div
          style={{
            backgroundColor: "var(--background)",
            borderRadius: "var(--radius-lg)",
            padding: "2rem",
            maxWidth: "600px",
            width: "90%",
            maxHeight: "80vh",
            overflow: "auto",
            border: "1px solid var(--border)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 style={{ marginBottom: "1rem", fontSize: "1.5rem", fontWeight: 600 }}>
            config.pkg を選択
          </h2>
          <p style={{ marginBottom: "1.5rem", color: "var(--foreground-secondary)" }}>
            読み込むconfig.pkgファイルを選択してください。
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {configCandidates.map((candidate) => (
              <div
                key={candidate.path}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: "1rem",
                  backgroundColor: candidate.exists
                    ? "var(--background-secondary)"
                    : "var(--background)",
                  opacity: candidate.exists ? 1 : 0.5,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "0.5rem" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, marginBottom: "0.25rem" }}>
                      {candidate.label}
                    </div>
                    <code style={{ fontSize: "0.875rem", color: "var(--foreground-secondary)", wordBreak: "break-all" }}>
                      {candidate.path}
                    </code>
                  </div>
                  <div style={{ marginLeft: "1rem" }}>
                    {candidate.exists ? (
                      <span style={{ color: "var(--success)", fontSize: "0.875rem" }}>✓ 存在</span>
                    ) : (
                      <span style={{ color: "var(--foreground-tertiary)", fontSize: "0.875rem" }}>未検出</span>
                    )}
                  </div>
                </div>
                {candidate.exists && (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => handleLoadConfigFromPath(candidate.path)}
                    disabled={isLoadingConfig}
                    style={{ width: "100%", marginTop: "0.5rem" }}
                  >
                    {isLoadingConfig ? "読み込み中..." : "このファイルを読み込む"}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="outline-button"
              onClick={() => setShowConfigSelector(false)}
              disabled={isLoadingConfig}
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  );
}
