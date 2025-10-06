"use client";

import React, { Component, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { saveLog } from "@/lib/logging/error-logger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  category?: "startup" | "runtime" | "api" | "storage" | "ui" | "unknown";
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * エラーバウンダリーコンポーネント
 *
 * Reactコンポーネントツリー内のエラーをキャッチし、
 * ログに記録してフォールバックUIを表示します。
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // エラーをログに記録
    const category = this.props.category || "ui";

    saveLog(
      "error",
      category,
      error.message,
      error,
      {
        componentStack: errorInfo.componentStack,
      }
    );

    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // カスタムフォールバックが提供されている場合はそれを使用
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // デフォルトのエラーUI
      return (
        <div className="error-boundary-fallback">
          <div className="error-boundary-icon">
            <AlertTriangle size={48} strokeWidth={1.5} color="#ef4444" />
          </div>
          <h2 className="error-boundary-title">エラーが発生しました</h2>
          <p className="error-boundary-message">
            {this.state.error?.message || "予期しないエラーが発生しました"}
          </p>
          <button
            className="primary-button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            ページを再読み込み
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
