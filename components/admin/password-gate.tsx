"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Shield, Lock, AlertCircle, Info, Key } from "lucide-react";
import {
  verifyPassword,
  getDefaultPassword,
  isPasswordChanged,
  resetPasswordFromFile
} from "@/lib/settings/admin-password";
import {
  checkPasswordResetFile,
  deletePasswordResetFile
} from "@/lib/settings/password-reset-file";
import "./password-gate.css";

interface PasswordGateProps {
  children: ReactNode;
}

export function PasswordGate({ children }: PasswordGateProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDefaultPassword, setShowDefaultPassword] = useState(false);
  const [resetFileDetected, setResetFileDetected] = useState(false);
  const [resetInProgress, setResetInProgress] = useState(false);

  useEffect(() => {
    // Check if already authenticated in session
    const sessionAuth = sessionStorage.getItem("admin-authenticated");
    if (sessionAuth === "true") {
      setAuthenticated(true);
    }

    // Check if password has been changed and if reset file exists
    (async () => {
      const changed = await isPasswordChanged();
      setShowDefaultPassword(!changed);

      // リセットファイルの確認
      const resetFileCheck = await checkPasswordResetFile();
      if (resetFileCheck.exists) {
        setResetFileDetected(true);
      }

      setLoading(false);
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password.trim()) {
      setError("パスワードを入力してください");
      return;
    }

    const isValid = await verifyPassword(password.trim());

    if (isValid) {
      setAuthenticated(true);
      sessionStorage.setItem("admin-authenticated", "true");
    } else {
      setError("パスワードが正しくありません");
      setPassword("");
    }
  };

  const handlePasswordReset = async () => {
    if (!confirm(
      "⚠️ パスワードリセットを実行します。\n\n" +
      "リセットファイルに記載されたパスワードに変更されます。\n" +
      "リセット後、ファイルは自動的に削除されます。\n\n" +
      "続行しますか？"
    )) {
      return;
    }

    setResetInProgress(true);
    setError(null);

    try {
      // リセットファイルの内容を確認
      const resetFileCheck = await checkPasswordResetFile();

      if (!resetFileCheck.exists) {
        setError("リセットファイルが見つかりません");
        setResetInProgress(false);
        setResetFileDetected(false);
        return;
      }

      if (resetFileCheck.error) {
        setError(resetFileCheck.error);
        setResetInProgress(false);
        return;
      }

      if (!resetFileCheck.newPassword) {
        setError("リセットファイルが正しく読み込めませんでした");
        setResetInProgress(false);
        return;
      }

      // パスワードをリセット
      await resetPasswordFromFile(resetFileCheck.newPassword);

      // リセットファイルを削除
      await deletePasswordResetFile();

      // 成功メッセージを表示してリロード
      alert("✅ パスワードをリセットしました。\n新しいパスワードでログインしてください。");
      setResetFileDetected(false);
      setResetInProgress(false);
      window.location.reload();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "パスワードリセットに失敗しました"
      );
      setResetInProgress(false);
    }
  };

  if (loading) {
    return (
      <div className="password-gate-loading">
        <Shield size={48} className="password-gate-loading-icon" />
        <p>読み込み中...</p>
      </div>
    );
  }

  if (authenticated) {
    return <>{children}</>;
  }

  return (
    <div className="password-gate-container">
      <div className="password-gate-card">
        <div className="password-gate-header">
          <Shield size={48} className="password-gate-icon" />
          <h1 className="password-gate-title">管理者認証</h1>
          <p className="password-gate-subtitle">
            この画面にアクセスするには管理者パスワードが必要です
          </p>
        </div>

        {resetFileDetected && (
          <div className="password-gate-alert password-gate-alert-info">
            <Key size={20} />
            <div>
              <strong>パスワードリセットファイルが検出されました</strong>
              <br />
              <small>下のボタンをクリックしてパスワードをリセットできます</small>
            </div>
          </div>
        )}

        {showDefaultPassword && !resetFileDetected && (
          <div className="password-gate-alert password-gate-alert-info">
            <Info size={20} />
            <div>
              <strong>初期パスワード:</strong> <code>{getDefaultPassword()}</code>
              <br />
              <small>ログイン後、必ずパスワードを変更してください</small>
            </div>
          </div>
        )}

        {error && (
          <div className="password-gate-alert password-gate-alert-error">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="password-gate-form">
          <div className="password-gate-field">
            <label htmlFor="admin-password" className="password-gate-label">
              <Lock size={16} />
              パスワード
            </label>
            <input
              id="admin-password"
              type="password"
              className="password-gate-input"
              placeholder="管理者パスワードを入力"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>

          <button type="submit" className="password-gate-button">
            <Shield size={20} />
            ログイン
          </button>

          {resetFileDetected && (
            <button
              type="button"
              onClick={handlePasswordReset}
              disabled={resetInProgress}
              className="password-gate-button"
              style={{
                marginTop: "12px",
                backgroundColor: "var(--warning-bg, #fef3c7)",
                borderColor: "var(--warning, #f59e0b)",
                color: "var(--warning-text, #92400e)",
              }}
            >
              <Key size={20} />
              {resetInProgress ? "リセット中..." : "パスワードをリセット"}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
