# 配布ガイド - Deployment Guide

このドキュメントは、アプリケーションを組織内に配布する際の手順と、事前設定について説明します。

## 目次

1. [配布前の準備](#配布前の準備)
2. [事前設定（各ユーザーでの設定を不要にする）](#事前設定各ユーザーでの設定を不要にする)
3. [ビルドと配布](#ビルドと配布)
4. [配布後の初期設定](#配布後の初期設定)
5. [ユーザーへの案内](#ユーザーへの案内)

---

## 配布前の準備

### 1. 必要な情報の収集

配布前に以下の情報を準備してください：

- [ ] 会社のOpenAI組織ID（`org-xxxx`形式）
- [ ] 管理者用の新しいパスワード（デフォルトから変更）
- [ ] 配布先ユーザーのリスト
- [ ] プロキシ設定（必要な場合）

### 2. 組織IDの確認方法

会社のOpenAI APIキーを使用して、組織IDを確認します：

```bash
curl https://api.openai.com/v1/me \
  -H "Authorization: Bearer YOUR_COMPANY_API_KEY"
```

レスポンスから `orgs.data[].id` の値（`org-xxxx`）をメモしてください。

---

## 事前設定（各ユーザーでの設定を不要にする）

### アプローチ1: ビルド時にデフォルト値を設定（推奨）

#### 1. 管理者パスワードのデフォルト値変更

`lib/settings/admin-password.ts` を編集：

```typescript
const DEFAULT_PASSWORD = "YourSecurePasswordHere"; // 変更
```

⚠️ **セキュリティ**: 推測されにくい強固なパスワードに変更してください。

#### 2. 組織IDホワイトリストの事前登録

`lib/settings/org-whitelist.ts` に以下の関数を追加：

```typescript
/**
 * Initialize default whitelist for deployment
 * 配布用のデフォルトホワイトリストを初期化
 */
export async function initializeDefaultWhitelist(): Promise<void> {
  const existing = await loadOrgWhitelist();

  // 既にエントリがある場合はスキップ
  if (existing.length > 0) {
    return;
  }

  // 会社の組織IDを事前登録
  const defaultOrgs = [
    {
      orgId: "org-abc123xyz", // ← ここに会社の組織IDを設定
      orgName: "Your Company Name",
      notes: "Default organization",
    },
  ];

  for (const org of defaultOrgs) {
    try {
      await addOrgToWhitelist(org.orgId, org.orgName, org.notes);
    } catch (error) {
      console.error("Failed to initialize default org:", error);
    }
  }
}
```

そして、`app/(shell)/welcome/page.tsx` の `useEffect` 内で初期化を呼び出し：

```typescript
useEffect(() => {
  let cancelled = false;
  (async () => {
    // デフォルトホワイトリストを初期化（初回のみ）
    await initializeDefaultWhitelist();

    // 既存のコード...
    const stored = await loadConnection();
    // ...
  })();
  return () => { cancelled = true; };
}, []);
```

#### 3. プロキシ設定のデフォルト値（必要な場合）

`app/(shell)/welcome/page.tsx` の初期状態を変更：

```typescript
const [httpProxy, setHttpProxy] = useState("http://proxy.company.com:8080");
const [httpsProxy, setHttpsProxy] = useState("http://proxy.company.com:8080");
```

### アプローチ2: 環境変数を使用

#### `.env.local` ファイルを作成

```env
NEXT_PUBLIC_DEFAULT_ORG_ID=org-abc123xyz
NEXT_PUBLIC_DEFAULT_ORG_NAME=Your Company Name
NEXT_PUBLIC_HTTP_PROXY=http://proxy.company.com:8080
NEXT_PUBLIC_HTTPS_PROXY=http://proxy.company.com:8080
NEXT_PUBLIC_ADMIN_PASSWORD=YourSecurePassword
```

#### コード内で環境変数を参照

`lib/settings/admin-password.ts`:

```typescript
const DEFAULT_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "admin123";
```

`lib/settings/org-whitelist.ts`:

```typescript
export async function initializeDefaultWhitelist(): Promise<void> {
  const defaultOrgId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
  const defaultOrgName = process.env.NEXT_PUBLIC_DEFAULT_ORG_NAME || "Company";

  if (!defaultOrgId) {
    return; // 環境変数が設定されていない場合はスキップ
  }

  const existing = await loadOrgWhitelist();
  if (existing.length > 0) {
    return;
  }

  await addOrgToWhitelist(defaultOrgId, defaultOrgName, "Default organization");
}
```

---

## ビルドと配布

### 静的エクスポート（推奨）

このアプリケーションは静的サイトとしてエクスポート可能です。

#### 1. ビルド

```bash
npm run build
```

#### 2. 出力の確認

`out/` ディレクトリに静的ファイルが生成されます：

```
out/
├── _next/
├── admin.html
├── chat.html
├── dashboard.html
├── index.html
├── settings.html
└── welcome.html
```

#### 3. 配布方法の選択

**オプションA: 社内Webサーバーでホスティング**

```bash
# 例：Nginxの場合
sudo cp -r out/* /var/www/html/chat-app/
```

ユーザーは `https://intranet.company.com/chat-app/` にアクセス

**オプションB: ファイルサーバーで共有**

1. `out/` ディレクトリをZIP圧縮
2. 社内ファイルサーバーに配置
3. ユーザーにダウンロードして展開してもらう
4. `index.html` をブラウザで開く

**オプションC: 電子メールで配布**

⚠️ **非推奨**: セキュリティ上の理由から推奨しません

---

## 配布後の初期設定

配布後、管理者が以下の設定を行ってください：

### 1. 管理画面へのアクセス

配布したアプリケーションの `/admin` URLにアクセス

### 2. パスワード変更（ビルド時に変更していない場合）

1. デフォルトパスワード `admin123` でログイン
2. 「パスワード変更」セクションで新しいパスワードに変更
3. **必ずパスワードをメモ**

### 3. 組織IDホワイトリストの確認

1. 会社の組織IDが登録されているか確認
2. 登録されていない場合は追加

### 4. テスト

1. Welcome画面で会社のAPIキーをテスト
2. 個人のAPIキー（あれば）で拒否されることを確認

---

## ユーザーへの案内

### 配布時のメール テンプレート

```
件名: AIチャットアプリケーションの展開について

お疲れ様です。

社内で利用可能なAIチャットアプリケーションを展開しましたのでお知らせします。

【アクセス方法】
URL: https://intranet.company.com/chat-app/
または、添付のZIPファイルを展開してindex.htmlを開いてください。

【初回設定】
1. Welcome画面でAPIキーを入力（会社配布のAPIキーを使用）
2. 「接続をテスト」をクリック
3. 「チャットを開始」でご利用開始

【ユーザーガイド】
詳細な使い方は、同梱の USER_GUIDE.md をご覧ください。

【注意事項】
- 個人のAPIキーは使用できません
- 会社配布のAPIキーのみご利用ください
- APIキーは他人と共有しないでください

【サポート】
ご不明な点がございましたら、IT部門までお問い合わせください。
```

### 必要なドキュメント

配布パッケージに以下を同梱してください：

```
chat-app/
├── out/                    # ビルド済みファイル
├── docs/
│   ├── USER_GUIDE.md      # ユーザー向けガイド
│   └── ADMIN_GUIDE.md     # 管理者向けガイド（オプション）
└── README.txt             # クイックスタートガイド
```

### README.txt の例

```
AIチャットアプリケーション - クイックスタート

【インストール】
1. このフォルダをローカルに保存
2. out/index.html をブラウザで開く

【初回設定】
1. APIキーを入力（会社から配布されたもの）
2. 接続テストを実行
3. チャット開始

【詳細な使い方】
docs/USER_GUIDE.md を参照してください

【サポート】
IT部門: support@company.com
```

---

## セキュリティチェックリスト

配布前の最終確認：

- [ ] デフォルトパスワードが変更されている
- [ ] 会社の組織IDがホワイトリストに登録されている
- [ ] テスト環境で動作確認済み
- [ ] ユーザーガイドが準備されている
- [ ] サポート連絡先が明記されている
- [ ] 不要な開発用ファイル（`.env.local`など）が削除されている
- [ ] 本番用のビルドが実行されている（`npm run build`）

---

## 高度な配布オプション

### Docker コンテナ化

```dockerfile
FROM nginx:alpine
COPY out/ /usr/share/nginx/html/
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

ビルドと実行：

```bash
docker build -t chat-app .
docker run -d -p 80:80 chat-app
```

### CI/CD パイプライン

GitHub Actions の例：

```yaml
name: Build and Deploy

on:
  push:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v2
        with:
          name: build
          path: out/
```

---

## トラブルシューティング（配布後）

### 問題: ユーザーが「組織ID検証エラー」を受け取る

**原因**: ホワイトリストに組織IDが登録されていない

**解決策**:
1. 管理画面にアクセス
2. エラーに表示されている組織IDを確認
3. ホワイトリストに追加

### 問題: ブラウザで開いても真っ白

**原因**: 静的ファイルのパスが正しくない

**解決策**:
- Webサーバーでホスティングする
- または、ローカルサーバーを起動：`npx serve out/`

### 問題: プロキシエラー

**原因**: 社内プロキシ設定が必要

**解決策**:
1. Welcome画面でHTTP/HTTPSプロキシを設定
2. または、ビルド前にデフォルト値を設定

---

## アップデート手順

新しいバージョンを配布する場合：

1. **ビルド**: `npm run build`
2. **バックアップ**: 既存のlocalStorageデータをバックアップするよう案内
3. **配布**: 新しい `out/` フォルダを配布
4. **移行ガイド**: 変更点をドキュメント化

⚠️ **注意**: localStorageデータは上書きされないため、ユーザーの設定は保持されます。

---

## よくある質問（配布担当者向け）

### Q1. 各ユーザーがAPIキーを入力する必要がありますか？

**A**: はい、各ユーザーが初回アクセス時にAPIキーを入力する必要があります。セキュリティ上、APIキーをアプリケーションに埋め込むことは推奨しません。

### Q2. 管理者パスワードは全ユーザー共通ですか？

**A**: はい、管理画面のパスワードは共通です。ただし、一般ユーザーは管理画面にアクセスする必要はありません。

### Q3. ホワイトリストの設定は全ユーザーに反映されますか？

**A**: いいえ、ホワイトリストはブラウザのlocalStorageに保存されるため、**各ユーザーのブラウザごと**に設定が必要です。

**推奨**: ビルド時にデフォルト値を設定することで、ユーザーの設定作業を不要にできます（上記の「事前設定」を参照）。

### Q4. 複数拠点に配布する場合は？

**A**: 各拠点で同じビルドを使用できます。組織IDやプロキシ設定が異なる場合は、拠点ごとに別のビルドを作成してください。

---

**バージョン**: 1.0
**最終更新**: 2025年1月
