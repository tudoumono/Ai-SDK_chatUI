# Secure Config Pack (`config.pkg`)

このドキュメントは、部署ごとのホワイトリストや管理者パスワードをローカルストレージではなく Tauri 側で安全に配布するための新しい設定ファイルについて説明します。

## 目的

- localStorage を初期化してもホワイトリストと管理者パスワードを再投入する
- 部署ごとに異なる設定をバンドルし、非エンジニアにも「フォルダをコピーするだけ」の配布体験を維持
- 将来的な署名・暗号化強化の受け皿となる共通フォーマットを提供

## ファイルの場所

| OS      | 期待する配置先                                  |
|---------|--------------------------------------------------|
| Windows | `%APPDATA%/Ai-SDK_chatUI/config.pkg`              |
| macOS   | `~/Library/Application Support/Ai-SDK_chatUI/config.pkg` |
| Linux   | `~/.config/Ai-SDK_chatUI/config.pkg`              |

※ Tauri が提供する `app_config_dir` に配置されます。配布スクリプトでは exe と同梱するだけでなく、このパスに `config.pkg` をコピーする処理を組み込んでください。

## JSON フォーマット

```json
{
  "version": 1,
  "orgWhitelist": [
    {
      "id": "org-entry-sales",
      "orgId": "org-sales-123",
      "orgName": "Sales Dept Tenant",
      "addedAt": "2025-10-21T00:00:00.000Z",
      "notes": "営業部門専用"
    }
  ],
  "adminPasswordHash": "<SHA-256 hex>",
  "features": {
    "allowWebSearch": false,
    "allowVectorStore": true,
    "allowFileUpload": false,
    "allowChatFileAttachment": false
  }
}
```

- `version` … 任意。将来のフォーマット移行判定に使用します。
- `orgWhitelist` … `OrgWhitelistEntry` と同じ構造。`id` が無い場合はアプリ側で自動生成されます。
- `adminPasswordHash` … `admin-password-hash` と同じ SHA-256 ハッシュ文字列。
- `features` … 主要な機能トグル。未指定の項目は既定値 (true) が適用されます。
- `signature` … 署名を導入する際の拡張フィールド（現状は未使用）。

## 生成ワークフロー例

1. 部署ごとのホワイトリスト JSON を用意します。
2. 管理者パスワードを決め、`echo -n "new-password" | shasum -a 256` 等でハッシュ化します。
3. 上記フォーマットに沿って `config.pkg` を作成します。
4. 配布スクリプトで exe と同じディレクトリに格納し、インストール後に所定の `app_config_dir` へコピーします。
   - Vector Store やファイルアップロードを無効化したい部署では `features` を必ず指定してください。

> ✅ 今後 `scripts/api/generate-config.ts` を追加し、KMS 経由で署名付きファイルを自動生成する予定です。（Issue: `#security-config-cli`）

## アプリ側の挙動

- 起動時 (`app/providers.tsx`) に Tauri コマンド `load_secure_config` を呼び出し、`config.pkg` の内容を読み込みます。
- `org-whitelist` および `admin-password-hash` を localStorage に再書き込みし、`…:managed-by-secure-config` フラグを立てます。
- 管理画面 (`/admin`) ではこれらのフラグを検知すると、編集 UI をロックし、警告を表示します。

## OSS 利用者へのガイダンス

- `docs/secure-config.md` を参照し、自社で署名鍵・暗号鍵を管理してください。
- config.pkg を同梱しない場合は従来どおり localStorage で管理されますが、セキュリティ要件に注意してください。
- PR で自社向けのホスト追加が必要な場合は `NEXT_PUBLIC_ALLOWED_OPENAI_HOSTS` と `ALLOWED_OPENAI_HOSTS` 環境変数で指定できます。

## 既知の課題

- 署名／暗号化は未実装です。部署内 KMS と連携する CLI を次フェーズで導入します。
- config.pkg のホットリロードは未サポートです。差し替え後はアプリを再起動してください。
- Whitelist / password の UI ロックは localStorage フラグに依存しているため、Tauri 側で追って完全な read-only 化を実装します。

配布担当はこのファイルを各部署ごとに生成し、共通 exe と同梱した ZIP で配布する運用を推奨します。
