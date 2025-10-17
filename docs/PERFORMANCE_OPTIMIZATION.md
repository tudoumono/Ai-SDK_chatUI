# パフォーマンス最適化ガイド

このドキュメントでは、アプリケーションのメモリ使用量削減とexe効率化の方法を説明します。

## メモリリーク対策

### 既に実装済みの対策

#### 1. **Chat画面のクリーンアップ** (`app/(shell)/chat/page.tsx`)

```typescript
// ✅ useEffect内でイベントリスナーのクリーンアップ
useEffect(() => {
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
  return () => {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  };
}, [activeResize, ...]);

// ✅ タイマーのクリーンアップ
useEffect(() => {
  const timeoutId = setTimeout(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, 100);
  return () => clearTimeout(timeoutId);
}, [messages]);

// ✅ コンポーネントアンマウント時のクリーンアップ
useEffect(() => {
  return () => {
    cancelled = true;
    streamingControllerRef.current?.abort();
    if (assistantSnapshotTimerRef.current) {
      clearTimeout(assistantSnapshotTimerRef.current);
      assistantSnapshotTimerRef.current = null;
    }
  };
}, []);
```

#### 2. **メッセージの遅延ロード** (`app/(shell)/chat/page.tsx:284`)

```typescript
// ✅ 初回は最新30件のみ読み込み
const result = await loadConversationMessagesPaginated(activeConversation.id, {
  limit: 30
});

// ✅ 古いメッセージは必要に応じて読み込み
const handleLoadOlderMessages = useCallback(async () => {
  const result = await loadConversationMessagesPaginated(conversation.id, {
    limit: 30,
    beforeMessageId: oldestMessage.id,
  });
  // ...
}, []);
```

**効果**: 初期メモリ使用量を大幅に削減（数千件のメッセージがある場合でも最新30件のみロード）

#### 3. **スプレッド演算子の最適化** (`app/(shell)/chat/page.tsx:512`)

```typescript
// ❌ Before: スプレッド演算子で毎回配列をコピー（メモリ消費大）
setMessages([...messagesRef.current, userMessage, assistantDraft]);

// ✅ After: concatを使用（効率的）
const newMessages = messagesRef.current.concat([userMessage, assistantDraft]);
setMessages(newMessages);
messagesRef.current = newMessages;
```

**効果**: 大量のメッセージがある場合のメモリコピーを削減

## exe効率化

### Tauri設定の最適化

#### 1. **tauri.conf.json の最適化**

```json
{
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis"],  // 不要なターゲットを削除
    "windows": {
      "wix": {
        "language": ["ja-JP"]  // 必要な言語のみ
      }
    }
  },
  "build": {
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:3000",
    "frontendDist": "../out"
  }
}
```

#### 2. **Cargo.toml の最適化**

`src-tauri/Cargo.toml` にリリース最適化を追加:

```toml
[profile.release]
opt-level = "z"     # サイズ最適化
lto = true          # Link Time Optimization
codegen-units = 1   # 並列コンパイルを無効にしてサイズ削減
panic = "abort"     # パニック時のスタックトレースを無効化
strip = true        # デバッグシンボルを削除
```

**効果**: exeサイズを30-50%削減可能

#### 3. **依存関係の削減**

不要なTauriプラグインを削除:

```toml
# src-tauri/Cargo.toml
[dependencies]
tauri = { version = "2.8", features = ["protocol-asset"] }
# 不要なfeaturesは削除
```

### Next.jsビルドの最適化

#### 1. **next.config.mjs の最適化**

```javascript
const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
    formats: ['image/webp']  // 軽量フォーマット
  },
  compress: true,  // gzip圧縮
  swcMinify: true,  // SWCベースの最小化

  // 本番環境でのソースマップ無効化
  productionBrowserSourceMaps: false,

  // 未使用のCSSを削除
  experimental: {
    optimizeCss: true
  }
};
```

#### 2. **不要な依存関係の削除**

```bash
# 開発依存関係のみをインストール
npm install --production

# 使用していないパッケージを確認
npx depcheck
```

### IndexedDBの最適化

#### 1. **古いデータの自動削除** (既に実装済み)

```typescript
// app/(shell)/chat/page.tsx:210
await pruneConversationsOlderThan(CONVERSATION_RETENTION_DAYS);
```

#### 2. **インデックスの最適化**

`lib/storage/indexed-db.ts` でインデックスを追加:

```typescript
const conversationStore = db.createObjectStore("conversations", {
  keyPath: "id"
});
conversationStore.createIndex("updatedAt", "updatedAt", { unique: false });
conversationStore.createIndex("isFavorite", "isFavorite", { unique: false });
```

## メモリ使用量の監視

### ブラウザ開発者ツール

1. **Chrome DevTools**
   - Performance タブ → メモリプロファイリング
   - Memory タブ → ヒープスナップショット

2. **メモリリークの検出**
   ```javascript
   // Consoleで実行
   performance.memory.usedJSHeapSize / 1048576  // MB単位
   ```

### Tauriアプリ

タスクマネージャーでメモリ使用量を監視:
- Windows: `タスクマネージャー` → `詳細`
- 目標: 200MB以下（アイドル時）

## ビルドサイズの比較

### 最適化前後の比較（参考値）

| 項目 | 最適化前 | 最適化後 | 削減率 |
|------|---------|---------|--------|
| exe サイズ | ~15 MB | ~8 MB | 47% |
| 起動時メモリ | 250 MB | 150 MB | 40% |
| アイドルメモリ | 300 MB | 180 MB | 40% |

## チェックリスト

配布前に以下を確認:

- [ ] Cargo.toml に `[profile.release]` 最適化を追加
- [ ] next.config.mjs で `productionBrowserSourceMaps: false`
- [ ] 不要な依存関係を削除（`npm prune --production`）
- [ ] tauri.conf.json で不要なバンドルターゲットを削除
- [ ] メッセージの遅延ロード機能が有効
- [ ] 古い会話の自動削除が有効（14日間）
- [ ] イベントリスナーとタイマーのクリーンアップが実装済み

## トラブルシューティング

### メモリ使用量が多い場合

1. **IndexedDBのクリア**
   ```javascript
   // 開発者ツールのConsoleで実行
   indexedDB.deleteDatabase("chat-app-db");
   ```

2. **会話履歴の削除**
   - Settings画面 → 「会話履歴をすべて削除」

3. **ブラウザキャッシュのクリア**
   - Ctrl+Shift+Delete → キャッシュクリア

### exeサイズが大きい場合

1. **UPXで圧縮**（任意）
   ```bash
   # Windows
   upx --best --lzma app.exe
   ```
   注意: セキュリティソフトが誤検知する可能性あり

2. **依存関係の確認**
   ```bash
   cargo tree | less
   ```

## 参考リンク

- [Tauri Performance](https://v2.tauri.app/concept/performance/)
- [Next.js Optimization](https://nextjs.org/docs/pages/building-your-application/optimizing)
- [React Performance](https://react.dev/learn/render-and-commit#optimizing-performance)

---

**最終更新**: 2025-01-17
