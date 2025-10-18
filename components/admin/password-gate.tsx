"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Shield, Lock, AlertCircle, Info } from "lucide-react";
import { verifyPassword, getDefaultPassword, isPasswordChanged } from "@/lib/settings/admin-password";
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

  useEffect(() => {
    // Check if already authenticated in session
    const sessionAuth = sessionStorage.getItem("admin-authenticated");
    if (sessionAuth === "true") {
      setAuthenticated(true);
    }

    // Check if password has been changed
    (async () => {
      const changed = await isPasswordChanged();
      setShowDefaultPassword(!changed);
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

        {showDefaultPassword && (
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
        </form>
      </div>
    </div>
  );
}
