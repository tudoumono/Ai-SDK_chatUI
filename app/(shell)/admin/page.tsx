"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Shield, Plus, Trash2, Edit2, Save, X, AlertCircle, Key, Lock, Search, Settings } from "lucide-react";
import {
  loadOrgWhitelist,
  addOrgToWhitelist,
  removeOrgFromWhitelist,
  updateOrgInWhitelist,
  type OrgWhitelistEntry,
} from "@/lib/settings/org-whitelist";
import { changePassword, getDefaultPassword } from "@/lib/settings/admin-password";
import { fetchOrgInfo } from "@/lib/openai/org-validation";
import {
  FEATURE_RESTRICTIONS_EVENT,
  FEATURE_RESTRICTIONS_STORAGE_KEY,
  isFeatureRestrictionsManaged,
  loadFeatureRestrictions,
  saveFeatureRestrictions,
  type FeatureRestrictions,
} from "@/lib/settings/feature-restrictions";
import { PasswordGate } from "@/components/admin/password-gate";
import { PageLoading } from "@/components/ui/page-loading";
import "./admin.css";

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<OrgWhitelistEntry[]>([]);
  const [newOrgId, setNewOrgId] = useState("");
  const [newOrgName, setNewOrgName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOrgName, setEditOrgName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [whitelistManagedExternally, setWhitelistManagedExternally] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordManagedExternally, setPasswordManagedExternally] = useState(false);

  // Organization ID lookup state
  const [lookupApiKey, setLookupApiKey] = useState("");
  const [lookupBaseUrl, setLookupBaseUrl] = useState("https://api.openai.com/v1");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<{ orgIds: string[]; error?: string } | null>(null);

  // Feature restrictions state
  const [featureRestrictions, setFeatureRestrictions] = useState<FeatureRestrictions>({
    allowWebSearch: true,
    allowVectorStore: true,
    allowFileUpload: true,
    allowChatFileAttachment: true,
    updatedAt: new Date().toISOString(),
  });
  const [featureRestrictionsManaged, setFeatureRestrictionsManagedState] = useState(false);
  const [restrictionsSuccess, setRestrictionsSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const loaded = await loadOrgWhitelist();
        const restrictions = loadFeatureRestrictions();
        if (!cancelled) {
          setEntries(loaded);
          setFeatureRestrictions(restrictions);
          if (typeof window !== "undefined") {
            setWhitelistManagedExternally(
              window.localStorage.getItem("org-whitelist:managed-by-secure-config") === "true",
            );
            setPasswordManagedExternally(
              window.localStorage.getItem("admin-password:managed-by-secure-config") === "true",
            );
            setFeatureRestrictionsManagedState(isFeatureRestrictionsManaged());
          }
        }
      } catch (error) {
        if (!cancelled) {
          setError(
            error instanceof Error ? error.message : "Failed to load whitelist",
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
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleUpdate = () => {
      setFeatureRestrictions(loadFeatureRestrictions());
      setFeatureRestrictionsManagedState(isFeatureRestrictionsManaged());
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === FEATURE_RESTRICTIONS_STORAGE_KEY || event.key === `${FEATURE_RESTRICTIONS_STORAGE_KEY}:managed-by-secure-config`) {
        handleUpdate();
      }
    };

    window.addEventListener(FEATURE_RESTRICTIONS_EVENT, handleUpdate);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(FEATURE_RESTRICTIONS_EVENT, handleUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const handleAdd = useCallback(async () => {
    if (whitelistManagedExternally) {
      setError("ホワイトリストは配布設定ファイルで管理されています。編集するには管理者にお問い合わせください。");
      return;
    }

    if (!newOrgId.trim() || !newOrgName.trim()) {
      setError("Organization ID and Name are required");
      return;
    }

    // Validate org ID format (org-xxxx)
    if (!newOrgId.match(/^org-[a-zA-Z0-9]+$/)) {
      setError('Organization ID must be in format "org-xxxx"');
      return;
    }

    try {
      setError(null);
      const entry = await addOrgToWhitelist(
        newOrgId.trim(),
        newOrgName.trim(),
        newNotes.trim() || undefined,
      );
      setEntries((prev) => [...prev, entry]);
      setNewOrgId("");
      setNewOrgName("");
      setNewNotes("");
      setSuccess("Organization added successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to add organization");
    }
  }, [newOrgId, newOrgName, newNotes, whitelistManagedExternally]);

  const handleDelete = useCallback(async (id: string) => {
    if (whitelistManagedExternally) {
      setError("ホワイトリストは配布設定ファイルで管理されています。削除するには管理者にお問い合わせください。");
      return;
    }

    if (!confirm("Are you sure you want to remove this organization from the whitelist?")) {
      return;
    }

    try {
      setError(null);
      await removeOrgFromWhitelist(id);
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
      setSuccess("Organization removed successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to remove organization");
    }
  }, [whitelistManagedExternally]);

  const handleStartEdit = useCallback((entry: OrgWhitelistEntry) => {
    if (whitelistManagedExternally) {
      setError("ホワイトリストは配布設定ファイルで管理されています。編集するには管理者にお問い合わせください。");
      return;
    }

    setEditingId(entry.id);
    setEditOrgName(entry.orgName);
    setEditNotes(entry.notes || "");
  }, [whitelistManagedExternally]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditOrgName("");
    setEditNotes("");
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (whitelistManagedExternally) {
      setError("ホワイトリストは配布設定ファイルで管理されています。編集するには管理者にお問い合わせください。");
      return;
    }

    if (!editingId || !editOrgName.trim()) {
      setError("Organization name is required");
      return;
    }

    try {
      setError(null);
      const updated = await updateOrgInWhitelist(editingId, {
        orgName: editOrgName.trim(),
        notes: editNotes.trim() || undefined,
      });
      setEntries((prev) =>
        prev.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      setEditingId(null);
      setEditOrgName("");
      setEditNotes("");
      setSuccess("Organization updated successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to update organization");
    }
  }, [editingId, editOrgName, editNotes, whitelistManagedExternally]);

  const handlePasswordChange = useCallback(async () => {
    if (passwordManagedExternally) {
      setPasswordError("管理者パスワードは配布設定ファイルで管理されています。変更するには管理者にお問い合わせください。");
      return;
    }

    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("すべてのフィールドを入力してください");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("新しいパスワードと確認用パスワードが一致しません");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError("パスワードは6文字以上である必要があります");
      return;
    }

    const result = await changePassword(currentPassword, newPassword);

    if (result.success) {
      setPasswordSuccess("パスワードを変更しました");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSuccess(null), 3000);
    } else {
      setPasswordError(result.error || "パスワードの変更に失敗しました");
    }
  }, [currentPassword, newPassword, confirmPassword, passwordManagedExternally]);

  const handleLookupOrgId = useCallback(async () => {
    if (!lookupApiKey.trim()) {
      setLookupResult({ orgIds: [], error: "APIキーを入力してください" });
      return;
    }

    setLookupLoading(true);
    setLookupResult(null);

    const result = await fetchOrgInfo(lookupApiKey.trim(), lookupBaseUrl.trim());

    setLookupLoading(false);
    setLookupResult(result);
  }, [lookupApiKey, lookupBaseUrl]);

  type FeatureToggleField = Exclude<keyof FeatureRestrictions, "updatedAt">;

  const handleFeatureRestrictionChange = useCallback((field: FeatureToggleField, value: boolean) => {
    if (featureRestrictionsManaged) {
      setRestrictionsSuccess("config.pkg で機能制限が固定されています。");
      return;
    }

    setRestrictionsSuccess(null);
    setFeatureRestrictions((prev) => ({
      ...prev,
      [field]: value,
      ...(field === "allowFileUpload" && !value ? { allowChatFileAttachment: false } : {}),
    }));
  }, [featureRestrictionsManaged]);

  const handleSaveFeatureRestrictions = useCallback(() => {
    if (featureRestrictionsManaged) {
      setRestrictionsSuccess("config.pkg で機能制限が管理されています。設定変更は配布担当者へお問い合わせください。");
      return;
    }

    try {
      const updated = saveFeatureRestrictions({
        allowWebSearch: featureRestrictions.allowWebSearch,
        allowVectorStore: featureRestrictions.allowVectorStore,
        allowFileUpload: featureRestrictions.allowFileUpload,
        allowChatFileAttachment: featureRestrictions.allowChatFileAttachment,
      });
      setFeatureRestrictions(updated);
      setRestrictionsSuccess("機能制限の設定を保存しました");
      setTimeout(() => setRestrictionsSuccess(null), 3000);
    } catch (error) {
      setError("機能制限設定の保存に失敗しました");
    }
  }, [featureRestrictions, featureRestrictionsManaged]);

  if (loading) {
    return <PageLoading message="Loading admin panel..." />;
  }

  return (
    <PasswordGate>
      <main className="page-grid">
        <div className="page-header">
          <h1 className="page-header-title">
            <Shield size={28} style={{ display: "inline", marginRight: "8px", verticalAlign: "middle" }} />
            Organization Whitelist Management
          </h1>
          <p className="page-header-description">
            管理者画面 - 組織IDホワイトリストの管理
          </p>
          <Link href="/welcome" className="button-link">
            ← Back to Welcome
          </Link>
        </div>
        {error && (
          <div className="status-banner status-error">
            <div className="status-title">エラー</div>
            <p className="status-message">{error}</p>
          </div>
        )}

        {success && (
          <div className="status-banner status-success">
            <div className="status-title">成功</div>
            <p className="status-message">{success}</p>
          </div>
        )}

        {whitelistManagedExternally && (
          <div className="status-banner status-info">
            <div className="status-title">ホワイトリストは配布設定で管理されています</div>
            <p className="status-message">`config.pkg` に設定された組織IDリストが適用されており、この画面からは変更できません。</p>
          </div>
        )}

        {passwordManagedExternally && (
          <div className="status-banner status-info">
            <div className="status-title">管理者パスワードは配布設定で管理されています</div>
            <p className="status-message">ローカルでの再設定は無効化されています。必要な場合は配布担当者にご連絡ください。</p>
          </div>
        )}

        {!whitelistManagedExternally && (
          <section className="admin-info-section">
            <h3 className="admin-info-title">How It Works</h3>
            <div className="admin-info-content">
              <p>
                このホワイトリストは、会社配布のAPIキーのみを使用できるようにするための機能です。
              </p>
              <ol className="admin-info-list">
                <li>
                  <strong>組織IDの取得:</strong> OpenAI API の{" "}
                  <code>/v1/me</code>{" "}
                  エンドポイントを使用して、入力されたAPIキーに紐づく組織IDを取得します。
                </li>
                <li>
                  <strong>ホワイトリスト照合:</strong>{" "}
                  取得した組織IDが、ここで登録されたホワイトリストに含まれているかを確認します。
                </li>
                <li>
                  <strong>検証結果:</strong>{" "}
                  ホワイトリストに含まれていない場合は、個人のAPIキーと判断してエラーを返します。
                </li>
              </ol>
              <p className="admin-info-note">
                <strong>注意:</strong> APIキーのプレフィックス（sk-proj など）だけでは個人のキーと区別できないため、
                組織IDでの検証が推奨されます。
              </p>
            </div>
          </section>
        )}

        <section className="section-card">
          <h2 className="admin-section-title">
            <Search size={20} style={{ display: "inline", marginRight: "8px" }} />
            組織IDの取得
          </h2>
          <p className="admin-section-description">
            会社配布のAPIキーから組織IDを取得します。取得した組織IDをホワイトリストに追加してください。
          </p>

          <div className="admin-form">
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label htmlFor="lookup-api-key" className="admin-label">
                  API Key *
                </label>
                <input
                  id="lookup-api-key"
                  type="password"
                  className="admin-input"
                  placeholder="sk-proj-xxxxx or sk-xxxxx"
                  value={lookupApiKey}
                  onChange={(e) => setLookupApiKey(e.target.value)}
                />
                <span className="admin-hint">
                  会社配布のOpenAI APIキーを入力
                </span>
              </div>

              <div className="admin-form-group">
                <label htmlFor="lookup-base-url" className="admin-label">
                  Base URL (Optional)
                </label>
                <input
                  id="lookup-base-url"
                  type="text"
                  className="admin-input"
                  placeholder="https://api.openai.com/v1"
                  value={lookupBaseUrl}
                  onChange={(e) => setLookupBaseUrl(e.target.value)}
                />
                <span className="admin-hint">
                  通常は変更不要
                </span>
              </div>
            </div>

            <button
              type="button"
              className="admin-button admin-button-primary"
              onClick={handleLookupOrgId}
              disabled={lookupLoading}
            >
              <Search size={20} />
              {lookupLoading ? "検索中..." : "組織IDを取得"}
            </button>

            {lookupResult && (
              <div style={{ marginTop: "var(--spacing-lg)" }}>
                {lookupResult.error ? (
                  <div className="admin-alert admin-alert-error">
                    <AlertCircle size={20} />
                    <span>{lookupResult.error}</span>
                  </div>
                ) : lookupResult.orgIds.length > 0 ? (
                  <div className="admin-alert admin-alert-success">
                    <div>
                      <strong>組織IDが見つかりました:</strong>
                      <ul style={{ marginTop: "8px", marginBottom: 0, paddingLeft: "20px" }}>
                        {lookupResult.orgIds.map((orgId) => (
                          <li key={orgId}>
                            <code className="admin-code">{orgId}</code>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(orgId);
                                setSuccess("組織IDをクリップボードにコピーしました");
                                setTimeout(() => setSuccess(null), 3000);
                              }}
                              style={{
                                marginLeft: "8px",
                                padding: "2px 8px",
                                fontSize: "12px",
                                cursor: "pointer",
                              }}
                            >
                              コピー
                            </button>
                          </li>
                        ))}
                      </ul>
                      <p style={{ marginTop: "12px", marginBottom: 0, fontSize: "14px" }}>
                        💡 上記の組織IDを下の「Add New Organization」セクションで登録してください。
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="admin-alert admin-alert-error">
                    <AlertCircle size={20} />
                    <span>組織IDが見つかりませんでした</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {!whitelistManagedExternally && (
          <section className="admin-section">
            <h2 className="admin-section-title">Add New Organization</h2>
            <p className="admin-section-description">
              会社配布のAPIキーに紐づく組織IDをホワイトリストに追加します。
              個人のAPIキーが使用されるのを防ぎます。
            </p>

            <div className="admin-form">
              <div className="admin-form-row">
                <div className="admin-form-group">
                  <label htmlFor="org-id" className="admin-label">
                    Organization ID *
                  </label>
                  <input
                    id="org-id"
                    type="text"
                    className="admin-input"
                    placeholder="org-abc123xyz"
                    value={newOrgId}
                    onChange={(e) => setNewOrgId(e.target.value)}
                  />
                  <span className="admin-hint">
                    Format: org-xxxx (OpenAI organization ID)
                  </span>
                </div>

                <div className="admin-form-group">
                  <label htmlFor="org-name" className="admin-label">
                    Organization Name *
                  </label>
                  <input
                    id="org-name"
                    type="text"
                    className="admin-input"
                    placeholder="Company Name"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                  />
                </div>
              </div>

              <div className="admin-form-group">
                <label htmlFor="org-notes" className="admin-label">
                  Notes (Optional)
                </label>
                <textarea
                  id="org-notes"
                  className="admin-textarea"
                  placeholder="Additional notes about this organization..."
                  rows={3}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="admin-button admin-button-primary"
                onClick={handleAdd}
              >
                <Plus size={20} />
                Add Organization
              </button>
            </div>
          </section>
        )}

        {!whitelistManagedExternally && (
        <section className="admin-section">
          <h2 className="admin-section-title">
            Whitelisted Organizations ({entries.length})
          </h2>
          <p className="admin-section-description">
            現在ホワイトリストに登録されている組織の一覧です。
          </p>

          {entries.length === 0 ? (
            <div className="admin-empty">
              <Shield size={48} className="admin-empty-icon" />
              <p className="admin-empty-text">
                No organizations in whitelist yet.
              </p>
              <p className="admin-empty-subtext">
                Add your first organization above to get started.
              </p>
            </div>
          ) : (
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Organization ID</th>
                    <th>Organization Name</th>
                    <th>Notes</th>
                    <th>Added At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const isEditing = editingId === entry.id;

                    return (
                      <tr key={entry.id} className={isEditing ? "editing" : ""}>
                        <td>
                          <code className="admin-code">{entry.orgId}</code>
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="text"
                              className="admin-input admin-input-sm"
                              value={editOrgName}
                              onChange={(e) => setEditOrgName(e.target.value)}
                            />
                          ) : (
                            entry.orgName
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="text"
                              className="admin-input admin-input-sm"
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              placeholder="Notes..."
                            />
                          ) : (
                            <span className="admin-notes">
                              {entry.notes || "—"}
                            </span>
                          )}
                        </td>
                        <td className="admin-date">
                          {new Date(entry.addedAt).toLocaleString()}
                        </td>
                        <td>
                          <div className="admin-actions">
                            {isEditing ? (
                              <>
                                <button
                                  className="admin-action-button admin-action-save"
                                  onClick={handleSaveEdit}
                                  title="Save"
                                >
                                  <Save size={16} />
                                </button>
                                <button
                                  className="admin-action-button admin-action-cancel"
                                  onClick={handleCancelEdit}
                                  title="Cancel"
                                >
                                  <X size={16} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className="admin-action-button admin-action-edit"
                                  onClick={() => handleStartEdit(entry)}
                                  title="Edit"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  className="admin-action-button admin-action-delete"
                                  onClick={() => handleDelete(entry.id)}
                                  title="Delete"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        )}

        {!passwordManagedExternally && (
          <section className="admin-section">
            <h2 className="admin-section-title">
              <Key size={20} style={{ display: "inline", marginRight: "8px" }} />
              パスワード変更
            </h2>
            <p className="admin-section-description">
              管理者画面のパスワードを変更します。初期パスワード「{getDefaultPassword()}」から必ず変更してください。
            </p>

            {passwordError && (
              <div className="admin-alert admin-alert-error">
                <AlertCircle size={20} />
                <span>{passwordError}</span>
                <button onClick={() => setPasswordError(null)} className="admin-alert-close">
                  ×
                </button>
              </div>
            )}

            {passwordSuccess && (
              <div className="admin-alert admin-alert-success">
                <span>{passwordSuccess}</span>
              </div>
            )}

            <div className="admin-form">
              <div className="admin-form-group">
                <label htmlFor="current-password" className="admin-label">
                  <Lock size={16} style={{ display: "inline", marginRight: "4px" }} />
                  現在のパスワード *
                </label>
                <input
                  id="current-password"
                  type="password"
                  className="admin-input"
                  placeholder="現在のパスワードを入力"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>

              <div className="admin-form-row">
                <div className="admin-form-group">
                  <label htmlFor="new-password" className="admin-label">
                    新しいパスワード *
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    className="admin-input"
                    placeholder="新しいパスワード（6文字以上）"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>

                <div className="admin-form-group">
                  <label htmlFor="confirm-password" className="admin-label">
                    パスワード確認 *
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    className="admin-input"
                    placeholder="新しいパスワードを再入力"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="button"
                className="admin-button admin-button-primary"
                onClick={handlePasswordChange}
              >
                <Key size={20} />
                パスワードを変更
              </button>
            </div>
          </section>
        )}

        <section className="admin-section">
          <h2 className="admin-section-title">
            <Settings size={20} style={{ display: "inline", marginRight: "8px" }} />
            機能制限設定
          </h2>
          <p className="admin-section-description">
            ユーザーが使用できる機能を制限します。配布前にこの設定を行うことで、組織のポリシーに合わせた機能制御が可能です。
          </p>

          {restrictionsSuccess && (
            <div className="admin-alert admin-alert-success">
              <span>{restrictionsSuccess}</span>
            </div>
          )}

          {featureRestrictionsManaged && (
            <div className="admin-alert admin-alert-info" style={{ alignItems: "center", gap: "8px" }}>
              <AlertCircle size={18} />
              <span>config.pkg で設定された機能ポリシーを適用中です。変更する場合は配布担当者にご相談ください。</span>
            </div>
          )}

          <div className="admin-form">
            <div className="admin-form-group">
              <label className="admin-checkbox-label">
                <input
                  type="checkbox"
                  checked={featureRestrictions.allowWebSearch}
                  onChange={(e) => handleFeatureRestrictionChange("allowWebSearch", e.target.checked)}
                  disabled={featureRestrictionsManaged}
                  style={{ marginRight: "8px" }}
                />
                <strong>Web検索機能を許可</strong>
              </label>
              <p className="admin-hint" style={{ marginTop: "4px", marginLeft: "24px" }}>
                チェックを外すと、ユーザーはWeb検索機能を使用できなくなります。
                Settings画面でWeb検索オプションが非表示になります。
              </p>
            </div>

            <div className="admin-form-group" style={{ marginTop: "var(--spacing-lg)" }}>
              <label className="admin-checkbox-label">
                <input
                  type="checkbox"
                  checked={featureRestrictions.allowVectorStore}
                  onChange={(e) => handleFeatureRestrictionChange("allowVectorStore", e.target.checked)}
                  disabled={featureRestrictionsManaged}
                  style={{ marginRight: "8px" }}
                />
                <strong>Vector Store機能を許可</strong>
              </label>
              <p className="admin-hint" style={{ marginTop: "4px", marginLeft: "24px" }}>
                チェックを外すと、ユーザーはVector Store（RAG）機能を使用できなくなります。
                Settings画面とダッシュボードでVector Store関連のUIが非表示になります。
              </p>
            </div>

            <div className="admin-form-group" style={{ marginTop: "var(--spacing-lg)" }}>
              <label className="admin-checkbox-label">
                <input
                  type="checkbox"
                  checked={featureRestrictions.allowFileUpload}
                  onChange={(e) => handleFeatureRestrictionChange("allowFileUpload", e.target.checked)}
                  disabled={featureRestrictionsManaged}
                  style={{ marginRight: "8px" }}
                />
                <strong>ファイルアップロード機能を許可</strong>
              </label>
              <p className="admin-hint" style={{ marginTop: "4px", marginLeft: "24px" }}>
                Vector Store 取り込みやチャット添付で OpenAI にファイルを送信できるかを制御します。無効化すると関連 UI が非表示になり、アップロード API もブロックされます。
              </p>
            </div>

            <div className="admin-form-group" style={{ marginTop: "var(--spacing-lg)" }}>
              <label className="admin-checkbox-label">
                <input
                  type="checkbox"
                  checked={featureRestrictions.allowChatFileAttachment}
                  onChange={(e) => handleFeatureRestrictionChange("allowChatFileAttachment", e.target.checked)}
                  disabled={featureRestrictionsManaged || !featureRestrictions.allowFileUpload}
                  style={{ marginRight: "8px" }}
                />
                <strong>チャットでのファイル添付を許可</strong>
              </label>
              <p className="admin-hint" style={{ marginTop: "4px", marginLeft: "24px" }}>
                ファイルアップロードを許可している場合のみ有効です。無効化するとチャット入力欄のクリップボタンが使えなくなります。
              </p>
            </div>

            <button
              type="button"
              className="admin-button admin-button-primary"
              onClick={handleSaveFeatureRestrictions}
              disabled={featureRestrictionsManaged}
              style={{ marginTop: "var(--spacing-lg)" }}
            >
              <Save size={20} />
              設定を保存
            </button>

            {featureRestrictions.updatedAt && (
              <p className="admin-hint" style={{ marginTop: "var(--spacing-md)" }}>
                最終更新: {new Date(featureRestrictions.updatedAt).toLocaleString()}
              </p>
            )}
          </div>
        </section>
      </main>
    </PasswordGate>
  );
}
