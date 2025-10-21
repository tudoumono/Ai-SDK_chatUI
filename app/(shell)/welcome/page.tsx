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
import { getSecureConfigStatus, type SecureConfigSearchPath } from "@/lib/security/secure-config";

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

type OnboardingStep = "credentials" | "storage" | "test";

const ONBOARDING_STEPS: Array<{ id: OnboardingStep; title: string; description: string }> = [
  {
    id: "credentials",
    title: "API キーを入力",
    description: "利用する OpenAI API キーと接続先を登録します。",
  },
  {
    id: "storage",
    title: "保存方法を決める",
    description: "API キーの保存ポリシーと暗号化パスフレーズを選びます。",
  },
  {
    id: "test",
    title: "接続テスト",
    description: "/v1/models へ接続し、設定を保存します。",
  },
];

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
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("credentials");
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);

  const requestTarget = useMemo(() => {
    const result = validateBaseUrl(baseUrl);
    const normalized = result.ok ? result.normalized : DEFAULT_BASE_URL;
    return `${normalized}/models`;
  }, [baseUrl]);
  const currentStepIndex = useMemo(
    () => ONBOARDING_STEPS.findIndex((step) => step.id === currentStep),
    [currentStep],
  );
  const totalSteps = ONBOARDING_STEPS.length;
  const currentStepMeta = ONBOARDING_STEPS[currentStepIndex] ?? ONBOARDING_STEPS[0];
  const canGoBack = currentStepIndex > 0;
  const testCompleted = result.state === "success";
  const isLastStep = currentStepIndex >= ONBOARDING_STEPS.length - 1;
  const storageBadges = useMemo(
    () => [
      { key: "session", label: "セッション保存", active: savedFlags.session },
      { key: "persistent", label: "永続保存", active: savedFlags.persistent },
      { key: "encrypted", label: "暗号化", active: savedFlags.encrypted },
    ],
    [savedFlags],
  );

  const resetResult = useCallback(() => {
    setResult({ state: "idle", message: "接続テストは未実行です。" });
  }, []);

  const handleNextStep = useCallback(() => {
    setWizardError(null);
    if (currentStep === "credentials") {
      if (!apiKey.trim()) {
        setWizardError("API キーを入力してください。");
        return;
      }

      const baseUrlValidation = validateBaseUrl(baseUrl);
      if (!baseUrlValidation.ok) {
        setWizardError(baseUrlValidation.message);
        return;
      }

      if (baseUrlValidation.normalized !== baseUrl) {
        setBaseUrl(baseUrlValidation.normalized);
      }

      resetResult();
      setCurrentStep("storage");
      return;
    }

    if (currentStep === "storage") {
      if (encryptionEnabled && !passphrase.trim()) {
        setPassphraseError("暗号化パスフレーズを入力してください。");
        setWizardError("暗号化パスフレーズを入力してください。");
        return;
      }

      resetResult();
      setCurrentStep("test");
    }
  }, [
    apiKey,
    baseUrl,
    currentStep,
    encryptionEnabled,
    passphrase,
    resetResult,
  ]);

  const handlePreviousStep = useCallback(() => {
    setWizardError(null);
    if (currentStep === "storage") {
      setCurrentStep("credentials");
      return;
    }

    if (currentStep === "test") {
      setCurrentStep("storage");
    }
  }, [currentStep]);

  const handleConnectionTest = useCallback(async () => {
    setWizardError(null);

    if (!apiKey.trim()) {
      setResult({ state: "error", message: "API キーを入力してください。" });
      return;
    }

    if (encryptionEnabled && !passphrase.trim()) {
      setPassphraseError("暗号化パスフレーズを入力してください。");
      setResult({ state: "error", message: "暗号化パスフレーズを入力してください。" });
      return;
    }

    const parsed = parseAdditionalHeaders(additionalHeaders);
    if ("error" in parsed) {
      setHeadersError(parsed.error);
      setResult({ state: "error", message: "追加ヘッダの形式エラーを修正してください。" });
      return;
    }
    setHeadersError(null);
    setPassphraseError(null);

    const baseUrlValidation = validateBaseUrl(baseUrl);
    if (!baseUrlValidation.ok) {
      setResult({ state: "error", message: baseUrlValidation.message });
      return;
    }

    const normalizedBaseUrl = baseUrlValidation.normalized;
    const target = `${normalizedBaseUrl}/models`;

    const headers = buildRequestHeaders(
      { Authorization: `Bearer ${apiKey.trim()}` },
      parsed.headers,
    );

    setResult({ state: "loading", message: "接続テストを実行中です…" });

    const maskedHeaders = Array.from(headers.entries()).map(([key, value]) => {
      if (key.toLowerCase() === "authorization") {
        const match = value.match(/^(Bearer\s+)(.+)$/i);
        if (match) {
          const token = match[2];
          const masked = token.length > 8
            ? `${token.substring(0, 8)}****${token.substring(token.length - 4)}`
            : "****";
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
          STORAGE_POLICIES.find((policy) => policy.value === storagePolicy)?.title ?? "不明";

        if (whitelistEnabled) {
          setResult({ state: "loading", message: "組織IDを検証中..." });

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

          await saveValidationResult(apiKey.trim(), validation.matchedOrgId || "");
          lockApiKeyInput();
          setIsLocked(true);
        } else {
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
  }, [
    additionalHeaders,
    apiKey,
    baseUrl,
    encryptionEnabled,
    httpProxy,
    httpsProxy,
    passphrase,
    storagePolicy,
    whitelistEnabled,
  ]);

  const handleUnlock = useCallback(() => {
    if (
      !confirm(
        "⚠️ APIキーのロックを解除すると、検証キャッシュも削除されます。\n\n再度APIキーを入力し、組織ID検証を行う必要があります。\n\n続行しますか？",
      )
    ) {
      return;
    }
    unlockApiKeyInput();
    setIsLocked(false);
    resetResult();
    setCurrentStep("credentials");
    appendLog({
      level: "info",
      scope: "setup",
      message: "APIキーのロックを解除しました",
    });
  }, [resetResult]);

  const handleClear = useCallback(async () => {
    await clearConnection();
    unlockApiKeyInput();
    setIsLocked(false);
    setSavedFlags({ session: false, persistent: false, encrypted: false });
    setApiKey("");
    setBaseUrl(DEFAULT_BASE_URL);
    setHttpProxy("");
    setHttpsProxy("");
    setAdditionalHeaders("");
    setStoragePolicy("none");
    setEncryptionEnabled(true);
    setPassphrase("");
    setPassphraseError(null);
    resetResult();
    setCurrentStep("credentials");
    setWizardError(null);
    setShowAdvancedOptions(false);
    appendLog({
      level: "info",
      scope: "setup",
      message: "保存済み接続を削除しました",
    });
  }, [resetResult]);

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
  }, [secureConfigInfo]);


  return (
    <main className="page-grid onboarding-grid">
      <section className="section-card onboarding-hero-card">
        <div className="onboarding-hero-main">
          <h1 className="onboarding-title">ようこそ！3ステップで準備しましょう</h1>
          <p className="onboarding-subtitle">
            現在ステップ {currentStepIndex + 1} / {totalSteps} ：{currentStepMeta.title}
          </p>
          {whitelistEnabled && (
            <div className="onboarding-badge onboarding-badge-success">
              <Shield size={16} />
              <span>組織IDホワイトリスト検証が有効です</span>
            </div>
          )}
          <div className="onboarding-badges">
            {storageBadges.map((badge) => (
              <div
                key={badge.key}
                className={clsx(
                  "storage-badge",
                  badge.key === "encrypted"
                    ? badge.active
                      ? "storage-badge-encrypted"
                      : "storage-badge-not-encrypted"
                    : badge.active
                    ? "storage-badge-active"
                    : "storage-badge-inactive",
                )}
              >
                <span className="storage-badge-icon">
                  {badge.key === "encrypted"
                    ? badge.active
                      ? "🔒"
                      : "🔓"
                    : badge.active
                    ? "✓"
                    : "－"}
                </span>
                <span className="storage-badge-label">{badge.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="onboarding-hero-actions">
          <Link className="outline-button" href="/admin">
            <Shield size={16} />
            管理者画面
          </Link>
          <button className="outline-button" onClick={handleClear} type="button">
            保存済み設定を削除
          </button>
        </div>
      </section>

      {secureConfigBanner ? (
        <section className="section-card onboarding-alert-card">{secureConfigBanner}</section>
      ) : null}

      <section className="section-card onboarding-step-card">
        <ol className="onboarding-stepper">
          {ONBOARDING_STEPS.map((step, index) => {
            const state =
              index < currentStepIndex ? "done" : index === currentStepIndex ? "active" : "pending";
            return (
              <li key={step.id} className={clsx("onboarding-step", `onboarding-step-${state}`)}>
                <span className="onboarding-step-index">{index + 1}</span>
                <div className="onboarding-step-copy">
                  <span className="onboarding-step-title">{step.title}</span>
                  <span className="onboarding-step-description">{step.description}</span>
                </div>
              </li>
            );
          })}
        </ol>

        {wizardError ? (
          <div className="status-banner status-error onboarding-inline-error">
            <div className="status-title">確認してください</div>
            <p className="status-message">{wizardError}</p>
          </div>
        ) : null}

        {currentStep === "credentials" && (
          <form
            className="form-grid onboarding-form"
            onSubmit={(event) => {
              event.preventDefault();
              handleNextStep();
            }}
          >
            <div className="field-group">
              <div className="field-label-row">
                <label className="field-label" htmlFor="api-key">
                  API キー <span className="field-required">*</span>
                </label>
                {isLocked && <span className="field-hint accent">🔒 認証済み</span>}
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
                style={isLocked ? { backgroundColor: "var(--surface-disabled)", cursor: "not-allowed" } : undefined}
              />
              {isLocked ? (
                <div className="onboarding-inline-actions">
                  <button type="button" className="outline-button" onClick={handleUnlock}>
                    🔓 ロック解除
                  </button>
                  <p className="field-hint">ロック解除すると組織ID検証キャッシュが削除されます。</p>
                </div>
              ) : (
                <p className="field-hint">OpenAI の管理画面から発行した API キーを入力してください。</p>
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
                onChange={(event) => {
                  setBaseUrl(event.target.value);
                  resetResult();
                }}
              />
              <p className="field-hint">プロキシやゲートウェイを利用する場合はこちらを変更します。</p>
            </div>

            <div className="onboarding-advanced-toggle">
              <button
                type="button"
                className="outline-button"
                onClick={() => setShowAdvancedOptions((prev) => !prev)}
                aria-expanded={showAdvancedOptions}
              >
                {showAdvancedOptions ? "詳細設定を閉じる" : "詳細設定を開く"}
              </button>
            </div>

            {showAdvancedOptions && (
              <div className="advanced-panel">
                <div className="advanced-panel-title">ネットワークと追加ヘッダ</div>
                <div className="advanced-content">
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
                    <p className="field-hint">HTTP 通信時に経由させたいゲートウェイ URL。</p>
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
                    <p className="field-hint">HTTPS 通信に利用するゲートウェイ URL。</p>
                  </div>

                  <div className="field-group">
                    <label className="field-label" htmlFor="additional-headers">
                      追加ヘッダ（1 行 = Header: value）
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
                      <p className="field-hint">認証ゲートウェイや社内プロキシのヘッダをまとめて設定できます。</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="onboarding-actions">
              <button className="primary-button" type="submit">
                保存方法へ進む
              </button>
            </div>
          </form>
        )}

        {currentStep === "storage" && (
          <form
            className="form-grid onboarding-form"
            onSubmit={(event) => {
              event.preventDefault();
              handleNextStep();
            }}
          >
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
                        {policy.note ? <span className="radio-card-note">{policy.note}</span> : null}
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
                    if (!enabled) {
                      const confirmed = window.confirm(
                        "⚠️ 警告: 暗号化を無効にすると、API キーが平文で保存されます。\n\n本当に無効化しますか？",
                      );
                      if (!confirmed) {
                        return;
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
              <p className="field-hint">暗号化を有効にするとパスフレーズが必須です。忘れると復号できません。</p>
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
                  <p className="field-hint">設定画面で復号する際にも同じパスフレーズが必要です。</p>
                )}
              </div>
            )}

            <div className="onboarding-actions">
              {canGoBack && (
                <button className="outline-button" onClick={handlePreviousStep} type="button">
                  戻る
                </button>
              )}
              <button className="primary-button" type="submit">
                接続テストへ
              </button>
            </div>
          </form>
        )}

        {currentStep === "test" && (
          <div className="onboarding-form">
            <div className="onboarding-summary-grid">
              <div className="summary-card">
                <span className="summary-label">接続先</span>
                <code className="inline-code">{requestTarget}</code>
              </div>
              <div className="summary-card">
                <span className="summary-label">保存ポリシー</span>
                <span className="summary-value">
                  {STORAGE_POLICIES.find((policy) => policy.value === storagePolicy)?.title ?? "未選択"}
                </span>
              </div>
              <div className="summary-card">
                <span className="summary-label">暗号化</span>
                <span className="summary-value">{encryptionEnabled ? "有効" : "無効"}</span>
              </div>
            </div>

            <div className="onboarding-actions">
              {canGoBack && (
                <button className="outline-button" onClick={handlePreviousStep} type="button">
                  戻る
                </button>
              )}
              <button
                className="primary-button"
                disabled={result.state === "loading" || isLocked}
                onClick={handleConnectionTest}
                type="button"
              >
                {result.state === "loading"
                  ? "テスト中…"
                  : isLocked
                  ? "認証済み（ロック中）"
                  : "/v1/models に接続"}
              </button>
            </div>

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
                  <li>ネットワーク/CORS: プロキシや追加ヘッダを確認してください。</li>
                  <li>
                    既存設定を編集する場合は <Link href="/settings">設定</Link> を開いてください。
                  </li>
                </ul>
              )}
            </div>

            {testCompleted && (
              <div className="onboarding-next-links">
                <Link className="primary-button" href="/chat">
                  チャットを開く
                </Link>
                <Link className="outline-button" href="/dashboard">
                  ダッシュボードを見る
                </Link>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );

}
