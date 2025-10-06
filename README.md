# AI ChatBot - OpenAI Responses API

OpenAI Responses APIを活用した、**完全ローカル動作**のAIチャットアプリケーション。

ブラウザ版とデスクトップアプリ版（Tauri）の両方で動作し、会話履歴・APIキーの暗号化保存、RAG（Vector Store）対応、Web検索機能を搭載しています。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-15.5-black)
![React](https://img.shields.io/badge/React-19.2-blue)
![Tauri](https://img.shields.io/badge/Tauri-2.8-orange)

---

## ✨ 主な機能

### 🔐 セキュリティ
- **BYOK (Bring Your Own Key)** - APIキーは配布せず、ユーザー自身が管理
- **AES-GCM暗号化** - パスフレーズによるAPIキーの暗号化保存
- **ローカルストレージ** - IndexedDBで会話履歴をローカル保存

### 💬 チャット機能
- **マルチターン会話** - 会話履歴の保存・管理
- **ストリーミング応答** - リアルタイムでAIの回答を表示
- **ファイル添付** - 画像・PDF・テキストファイルのアップロード対応
- **お気に入り・タグ** - 会話の分類・検索

### 🔍 高度な機能
- **RAG (Vector Store)** - OpenAIのFile Search機能によるベクター検索
- **Web検索** - OpenAI Responses APIのWeb検索機能
- **データ移行** - JSON形式でのエクスポート/インポート
- **トークン使用量表示** - 会話ごとの累計トークン数を追跡

### 📦 配布形式
- **ブラウザ版** - 静的HTMLとして配布（インストール不要）
- **デスクトップアプリ** - Tauriによるネイティブアプリ（Windows/Mac/Linux）

---

## 🚀 クイックスタート

### ブラウザ版

```bash
# リポジトリをクローン
git clone https://github.com/tudoumono/PlayGround.git
cd PlayGround/Ai-SDK_chatUI

# 依存関係をインストール
npm install

# 開発サーバー起動
npm run dev
# → http://localhost:3000 を開く

# 本番ビルド
npm run build
npm run start
```

### デスクトップアプリ版（Tauri）

#### 前提条件
- **Node.js** 20.x以上
- **Rust** (https://www.rust-lang.org/tools/install)
- **システム依存関係**
  - Windows: Visual Studio C++ Build Tools
  - macOS: Xcode Command Line Tools
  - Linux: webkit2gtk, build-essential等

#### ビルド手順

```bash
# feature/tauri-integrationブランチに切り替え
git checkout feature/tauri-integration

# 依存関係をインストール
npm install

# 開発モードで起動
npm run tauri:dev

# 本番ビルド（実行ファイル生成）
npm run tauri:build
```

#### ビルド成果物

**Windows:**
```
src-tauri/target/release/ai-sdk-chatui.exe  ← ポータブル版（単体で動作）
src-tauri/target/release/bundle/nsis/       ← インストーラー版
```

**macOS:**
```
src-tauri/target/release/bundle/dmg/
src-tauri/target/release/bundle/macos/
```

**Linux:**
```
src-tauri/target/release/bundle/deb/
src-tauri/target/release/bundle/appimage/
```

---

## 📖 使い方

### 1. 初回セットアップ

1. **ウェルカム画面 (G0)** でOpenAI APIキーを入力
   - APIキーの取得: https://platform.openai.com/api-keys
   - 暗号化オプション: パスフレーズを設定すると安全に保存

2. **ダッシュボード (G1)** で会話履歴を確認

3. **チャット画面 (G2)** で会話を開始

### 2. 高度な機能の利用

#### Vector Store（RAG）の設定

1. **Vector Store画面 (G3)** で新規作成
2. OpenAIのダッシュボードでファイルをアップロード
3. チャット画面でVector Storeを有効化

#### ファイル添付

- チャット画面の📎ボタンからファイルを選択
- **画像**: Vision機能で画像分析
- **PDF/テキスト**: File Search機能でRAG

#### データ移行

**エクスポート:**
```
設定画面 → データのインポート/エクスポート → 📦 データをエクスポート
```

**インポート:**
```
設定画面 → データのインポート/エクスポート → 📥 データをインポート
```

---

## 🏗️ プロジェクト構成

```
Ai-SDK_chatUI/
├── app/                          # Next.js App Router
│   ├── (shell)/                  # メイン画面群
│   │   ├── chat/                 # チャット画面 (G2)
│   │   ├── dashboard/            # ダッシュボード (G1)
│   │   ├── settings/             # 設定画面 (G5)
│   │   ├── vector-stores/        # Vector Store管理 (G3)
│   │   └── welcome/              # ウェルカム画面 (G0)
│   ├── layout.tsx                # ルートレイアウト
│   └── globals.css               # グローバルスタイル
├── components/                   # 共有UIコンポーネント
├── lib/                          # ビジネスロジック
│   ├── chat/                     # チャット関連
│   ├── crypto/                   # 暗号化（AES-GCM）
│   ├── export/                   # データエクスポート
│   ├── openai/                   # OpenAI API連携
│   ├── settings/                 # 設定管理
│   └── storage/                  # IndexedDB操作
├── src-tauri/                    # Tauri設定（デスクトップアプリ）
│   ├── src/                      # Rustコード
│   ├── icons/                    # アプリアイコン
│   └── tauri.conf.json           # Tauri設定
├── next.config.mjs               # Next.js設定
├── package.json                  # 依存関係
└── README.md                     # このファイル
```

---

## 🔧 技術スタック

### フロントエンド
- **Next.js 15.5** - React フレームワーク（静的エクスポート）
- **React 19.2** - UIライブラリ
- **TypeScript 5.9** - 型安全性
- **Vercel AI SDK** - ストリーミング応答処理
- **Jotai** - 状態管理
- **idb** - IndexedDB ラッパー

### デスクトップアプリ
- **Tauri 2.8** - Rustベースのアプリフレームワーク
- **Rust 1.90** - バックエンド言語

### API・機能
- **OpenAI Responses API** - チャット応答
- **OpenAI File Search** - RAG（Vector Store）
- **Web Crypto API** - AES-GCM暗号化

---

## 🛠️ 開発ガイド

### スクリプト

```bash
npm run dev          # 開発サーバー起動（http://localhost:3000）
npm run build        # 本番ビルド（静的ファイル生成）
npm run start        # ビルド済みファイルをサーブ
npm run lint         # ESLint実行
npm run tauri:dev    # Tauriアプリ開発モード
npm run tauri:build  # Tauriアプリビルド
```

### 環境変数

不要。APIキーはユーザーが入力します（BYOK方式）。

### コーディング規約

- **TypeScript strict mode** 有効
- **関数コンポーネント** のみ使用
- **PEP8準拠** の命名規則（Python的記法）
- **型ヒント必須**
- **非同期処理**: async/await統一

詳細は `CLAUDE.md` と `AGENTS.md` を参照。

---

## 📝 設定ファイル

### `tauri.conf.json`

重要な設定項目:

```json
{
  "identifier": "com.tudoumono.ai-sdk-chatui",  // ユニークなアプリID
  "productName": "ai-sdk-chatui",
  "version": "0.1.0",
  "build": {
    "frontendDist": "../out",                   // Next.jsビルド出力
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [{
      "title": "AI ChatBot - OpenAI Responses API",
      "width": 1400,
      "height": 900,
      "minWidth": 1000,
      "minHeight": 700
    }]
  }
}
```

### `next.config.mjs`

```javascript
const nextConfig = {
  output: "export",              // 静的エクスポート
  images: { unoptimized: true }, // 画像最適化無効（静的配布用）
  assetPrefix: isProd ? undefined : 'http://localhost:3000'
};
```

---

## 🔒 セキュリティ

### データ保存

| データ | 保存場所 | 暗号化 |
|--------|---------|--------|
| **APIキー** | localStorage/sessionStorage | AES-GCM (任意) |
| **会話履歴** | IndexedDB | なし |
| **ベクターストアID** | IndexedDB | なし |

### 暗号化仕様

- **アルゴリズム**: AES-GCM-256
- **鍵導出**: PBKDF2 (SHA-256, 100,000イテレーション)
- **実装**: Web Crypto API

### プライバシー

- ✅ **完全ローカル動作** - 外部サーバーへのデータ送信なし（OpenAI API除く）
- ✅ **BYOK方式** - APIキーは配布せず、ユーザーが管理
- ✅ **オープンソース** - コードは全て公開

---

## 🐛 トラブルシューティング

### ブラウザ版

**問題**: `file://` でHTMLを開いても動作しない

**解決策**:
```bash
npm run start
# または
npx serve out
```
HTTP(S)経由でアクセスする必要があります。

---

### Tauri版

**問題**: `tauri init` が失敗する

**解決策**: Rustがインストールされているか確認
```bash
rustc --version
```

**問題**: ビルドが遅い

**解決策**: 初回ビルドは依存関係のコンパイルに5-15分かかります。2回目以降は高速化します。

**問題**: Windowsでクローンに失敗

**解決策**: Zone.Identifierファイルは削除済みです。最新版をpullしてください。

---

## 📄 ライセンス

MIT License

---

## 👤 作成者

**tudo** | [github.com/tudoumono](https://github.com/tudoumono)

---

## 🙏 謝辞

- [OpenAI](https://openai.com/) - Responses API
- [Vercel](https://vercel.com/) - AI SDK & Next.js
- [Tauri](https://tauri.app/) - デスクトップアプリフレームワーク

---

## 📚 関連ドキュメント

- [設計書](./設計.md) - アプリ設計と配布思想
- [AGENTS.md](./AGENTS.md) - プロジェクト構成ガイド
- [CLAUDE.md](./CLAUDE.md) - コーディング規約

---

## 🔗 リンク

- **リポジトリ**: https://github.com/tudoumono/PlayGround
- **OpenAI Platform**: https://platform.openai.com/
- **Tauri Documentation**: https://v2.tauri.app/

---

**最終更新**: 2025-10-06
