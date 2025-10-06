/**
 * テキスト内のキーワードをハイライト表示するためのユーティリティ
 */

import React from "react";

/**
 * テキスト内のキーワードをハイライトして返す
 */
export function highlightText(text: string, keyword: string): React.ReactNode {
  if (!keyword.trim()) {
    return text;
  }

  const normalizedKeyword = keyword.toLowerCase();
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  const lowerText = text.toLowerCase();
  let index = lowerText.indexOf(normalizedKeyword);

  while (index !== -1) {
    // マッチ前のテキスト
    if (index > lastIndex) {
      parts.push(text.substring(lastIndex, index));
    }

    // ハイライトされたテキスト
    parts.push(
      <mark key={`highlight-${index}`} className="search-highlight">
        {text.substring(index, index + keyword.length)}
      </mark>
    );

    lastIndex = index + keyword.length;
    index = lowerText.indexOf(normalizedKeyword, lastIndex);
  }

  // 残りのテキスト
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

/**
 * タグ配列をハイライト表示
 */
export function highlightTags(tags: string[], keyword: string): React.ReactNode[] {
  return tags.map((tag, index) => (
    <span key={`${tag}-${index}`} className="conversation-tag">
      #{highlightText(tag, keyword)}
    </span>
  ));
}

/**
 * メッセージからマッチ部分を抽出してプレビュー文字列を生成
 */
export function extractMatchPreview(
  text: string,
  keyword: string,
  contextLength = 50
): string {
  const normalizedKeyword = keyword.toLowerCase();
  const lowerText = text.toLowerCase();
  const index = lowerText.indexOf(normalizedKeyword);

  if (index === -1) {
    return text.substring(0, 100) + (text.length > 100 ? "..." : "");
  }

  // マッチ位置の前後を抽出
  const start = Math.max(0, index - contextLength);
  const end = Math.min(text.length, index + keyword.length + contextLength);

  let preview = text.substring(start, end);

  // 先頭に省略記号を追加
  if (start > 0) {
    preview = "..." + preview;
  }

  // 末尾に省略記号を追加
  if (end < text.length) {
    preview = preview + "...";
  }

  return preview;
}
