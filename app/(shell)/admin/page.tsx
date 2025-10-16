"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Shield, Plus, Trash2, Edit2, Save, X, AlertCircle } from "lucide-react";
import {
  loadOrgWhitelist,
  addOrgToWhitelist,
  removeOrgFromWhitelist,
  updateOrgInWhitelist,
  type OrgWhitelistEntry,
} from "@/lib/settings/org-whitelist";
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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const loaded = await loadOrgWhitelist();
        if (!cancelled) {
          setEntries(loaded);
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

  const handleAdd = useCallback(async () => {
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
  }, [newOrgId, newOrgName, newNotes]);

  const handleDelete = useCallback(async (id: string) => {
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
  }, []);

  const handleStartEdit = useCallback((entry: OrgWhitelistEntry) => {
    setEditingId(entry.id);
    setEditOrgName(entry.orgName);
    setEditNotes(entry.notes || "");
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditOrgName("");
    setEditNotes("");
  }, []);

  const handleSaveEdit = useCallback(async () => {
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
  }, [editingId, editOrgName, editNotes]);

  if (loading) {
    return <PageLoading message="Loading admin panel..." />;
  }

  return (
    <div className="admin-container">
      <header className="admin-header">
        <div className="admin-header-content">
          <Shield className="admin-icon" size={32} />
          <div>
            <h1 className="admin-title">Organization Whitelist Management</h1>
            <p className="admin-subtitle">
              管理者画面 - 組織IDホワイトリストの管理
            </p>
          </div>
        </div>
        <Link href="/welcome" className="admin-back-link">
          ← Back to Welcome
        </Link>
      </header>

      <main className="admin-main">
        {error && (
          <div className="admin-alert admin-alert-error">
            <AlertCircle size={20} />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="admin-alert-close">
              ×
            </button>
          </div>
        )}

        {success && (
          <div className="admin-alert admin-alert-success">
            <span>{success}</span>
          </div>
        )}

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
      </main>
    </div>
  );
}
