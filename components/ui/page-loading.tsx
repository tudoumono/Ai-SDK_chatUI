"use client";

import "./page-loading.css";

type PageLoadingProps = {
  message?: string;
};

export function PageLoading({ message = "読み込み中..." }: PageLoadingProps) {
  return (
    <div className="page-loading-overlay">
      <div className="page-loading-content">
        <div className="page-loading-spinner">
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>
        <p className="page-loading-message">{message}</p>
      </div>
    </div>
  );
}
