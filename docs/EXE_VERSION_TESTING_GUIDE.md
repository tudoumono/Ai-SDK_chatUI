# exe版ファイルダウンロード機能のテストガイド

このドキュメントでは、Tauri版（exe）でファイルダウンロード機能が正しく動作するかをテストする手順を説明します。

## 🔧 実装された機能

### 1. 環境自動検出
- Tauri環境と通常のブラウザ環境を自動的に検出
- `__TAURI__` グローバル変数の有無で判定

### 2. ファイル保存方法の切り替え
- **Tauri環境（exe版）**: ネイティブファイルダイアログを使用
  - `@tauri-apps/plugin-dialog` でファイル保存ダイアログを表示
  - `@tauri-apps/plugin-fs` でファイルシステムに書き込み
- **ブラウザ環境**: 従来のBlob + `<a>` ダウンロード

### 3. 対象機能
以下の機能がTauri版でも動作するように修正されました:
- ✅ データのエクスポート（会話履歴+ベクターストア）
- ✅ エラーログのエクスポート

## 📋 テスト手順

### ステップ1: ビルド

```bash
npm run tauri:build
```

ビルド成功後、`src-tauri/target/release` ディレクトリに実行ファイルが生成されます:
- Windows: `AI-SDK_chatUI_new.exe`
- macOS: `AI-SDK_chatUI_new.app`
- Linux: `ai-sdk-chatui-new`

### ステップ2: exe版を起動

ビルドされた実行ファイルをダブルクリックして起動します。

### ステップ3: 診断情報を確認

1. サイドバーから「設定」を開く
2. ページの最下部にスクロール
3. **「診断情報（exe版トラブルシューティング用）」**セクションを確認

#### 正常な場合の表示例:

```
実行環境: ✅ Tauri (exe/app)
__TAURI__ グローバル変数: ✅ 存在する
ユーザーエージェント: Mozilla/5.0 ... tauri/2.x ...
ファイル保存方式: Tauri Dialog + FS Plugin
```

#### 異常な場合の表示例:

```
実行環境: ⚠️ ブラウザ
__TAURI__ グローバル変数: ❌ 存在しない
ユーザーエージェント: Mozilla/5.0 (Windows NT 10.0; ...)
ファイル保存方式: Browser Download (Blob + <a>)
```

> ⚠️ **重要**: 環境が「ブラウザ」と表示される場合、Tauri版として正しくビルドされていません。

### ステップ4: ファイルダウンロードをテスト

#### テスト1: データエクスポート

1. 設定画面の「データのインポート/エクスポート」セクション
2. 「📦 データをエクスポート」ボタンをクリック
3. **期待される動作**:
   - ネイティブのファイル保存ダイアログが表示される
   - デフォルトファイル名は `ai-sdk-chatui-export-YYYY-MM-DDTHH-mm-ss.json`
   - 保存場所を選択できる
   - ファイルが指定した場所に保存される

#### テスト2: エラーログエクスポート

1. 設定画面の「🚨 詳細エラーログ（開発者向け）」セクション
2. テストエラーを生成する場合は「🧪 テストエラーを生成」ボタンをクリック
3. 「更新」ボタンでログを再読み込み
4. 「ログをエクスポート」ボタンをクリック
5. **期待される動作**:
   - ネイティブのファイル保存ダイアログが表示される
   - デフォルトファイル名は `error-logs-YYYY-MM-DDTHH-mm-ss.json`
   - 保存場所を選択できる
   - ファイルが指定した場所に保存される

### ステップ5: エクスポートされたファイルの確認

1. 保存したJSONファイルをテキストエディタで開く
2. **データエクスポートの場合**:
   ```json
   {
     "schemaVersion": 1,
     "exportedAt": "2025-10-18T...",
     "conversations": [...],
     "vectorStores": [...]
   }
   ```

3. **エラーログエクスポートの場合**:
   ```json
   {
     "exportedAt": "2025-10-18T...",
     "appVersion": "1.0.0",
     "totalLogs": 5,
     "logs": [...],
     "summary": {
       "byLevel": {...},
       "byCategory": {...}
     }
   }
   ```

4. **機密情報のサニタイズ確認**:
   - `[REDACTED]` という文字列が含まれていることを確認
   - APIキー、パスワード、トークンなどが含まれていないことを確認

## 🐛 トラブルシューティング

### 問題1: 環境が「ブラウザ」と表示される

**原因**: Tauri版として正しくビルドされていない

**解決方法**:
1. `npm run tauri:build` を再実行
2. ビルドログにエラーがないか確認
3. `src-tauri/Cargo.toml` に以下のプラグインが含まれているか確認:
   ```toml
   [dependencies]
   tauri-plugin-dialog = "2.0"
   tauri-plugin-fs = "2.0"
   ```
4. `src-tauri/src/lib.rs` でプラグインが初期化されているか確認:
   ```rust
   .plugin(tauri_plugin_dialog::init())
   .plugin(tauri_plugin_fs::init())
   ```

### 問題2: ダウンロードボタンを押しても何も起こらない

**診断手順**:
1. 診断情報セクションで環境が「Tauri」と表示されているか確認
2. Windows版の場合、管理者権限で実行してみる
3. ファイアウォールやウイルス対策ソフトがブロックしていないか確認

**デバッグ方法**:
1. Tauri版は開発者ツールが表示されないため、以下の手順でログを確認:
   ```bash
   # Windows
   .\AI-SDK_chatUI_new.exe 2>&1 | Out-File -FilePath debug.log

   # macOS/Linux
   ./ai-sdk-chatui-new 2>&1 | tee debug.log
   ```
2. `debug.log` ファイルに以下のようなログが出力されているか確認:
   ```
   [saveFile] Environment: Tauri, File: ai-sdk-chatui-export-...
   [saveFile] Using Tauri file dialog...
   [saveTauriFile] Starting Tauri file save...
   [saveTauriFile] Importing Tauri plugins...
   [saveTauriFile] Plugins imported successfully
   [saveTauriFile] Opening save dialog...
   [saveTauriFile] Writing file to: ...
   [saveTauriFile] ✅ File saved successfully: ...
   ```

### 問題3: ファイル保存ダイアログが開くがファイルが保存されない

**原因**: ファイルシステムの権限問題

**解決方法**:
1. 保存先ディレクトリへの書き込み権限を確認
2. 別の保存場所（ドキュメントフォルダなど）を試す
3. `src-tauri/capabilities/default.json` の権限設定を確認:
   ```json
   {
     "permissions": [
       "fs:allow-write-text-file",
       "dialog:default"
     ]
   }
   ```

### 問題4: エラーが発生する

**診断**:
診断情報セクションを開発者に共有してください。以下の情報が含まれています:
- 実行環境（Tauri/ブラウザ）
- `__TAURI__` グローバル変数の有無
- ユーザーエージェント
- ファイル保存方式

**報告方法**:
1. 診断情報セクションのスクリーンショットを撮影
2. エラーメッセージがある場合はそれもコピー
3. 上記の情報を開発者に送信

## 📝 デバッグログの詳細

以下のログメッセージがコンソールに出力されます（開発モードで実行した場合）:

### 成功時のログフロー:

```
[saveFile] Environment: Tauri, File: ai-sdk-chatui-export-2025-10-18T12-00-00.json
[saveFile] Using Tauri file dialog...
[saveTauriFile] Starting Tauri file save...
[saveTauriFile] Importing Tauri plugins...
[saveTauriFile] Plugins imported successfully
[saveTauriFile] Opening save dialog...
[saveTauriFile] Writing file to: C:\Users\User\Documents\export.json
[saveTauriFile] ✅ File saved successfully: C:\Users\User\Documents\export.json
```

### キャンセル時のログ:

```
[saveFile] Environment: Tauri, File: ai-sdk-chatui-export-2025-10-18T12-00-00.json
[saveFile] Using Tauri file dialog...
[saveTauriFile] Starting Tauri file save...
[saveTauriFile] Importing Tauri plugins...
[saveTauriFile] Plugins imported successfully
[saveTauriFile] Opening save dialog...
[saveTauriFile] File save cancelled by user
```

### エラー時のログ:

```
[saveFile] Environment: Tauri, File: ai-sdk-chatui-export-2025-10-18T12-00-00.json
[saveFile] Using Tauri file dialog...
[saveTauriFile] Starting Tauri file save...
[saveTauriFile] ❌ Failed to save file in Tauri: [Error details]
[saveTauriFile] Error details: {
  name: "...",
  message: "...",
  stack: "..."
}
```

## ✅ チェックリスト

テスト完了前に以下を確認してください:

- [ ] exe版を起動できた
- [ ] 設定画面を開けた
- [ ] 診断情報セクションで環境が「✅ Tauri (exe/app)」と表示される
- [ ] `__TAURI__` グローバル変数が「✅ 存在する」と表示される
- [ ] データエクスポートボタンをクリックしてファイル保存ダイアログが開く
- [ ] ファイルを保存できた
- [ ] 保存したJSONファイルを開けた
- [ ] JSONの内容が正しい（会話データまたはエラーログ）
- [ ] エラーログエクスポートも同様に動作する
- [ ] 機密情報が `[REDACTED]` に置き換わっている

## 🔗 関連ドキュメント

- [Tauri v2 プラグインドキュメント](https://v2.tauri.app/plugin/)
- [ファイルシステムプラグイン](https://v2.tauri.app/plugin/file-system/)
- [ダイアログプラグイン](https://v2.tauri.app/plugin/dialog/)
- [管理者パスワードリセット手順](./ADMIN_PASSWORD_RESET.md)

## 📞 サポート

問題が解決しない場合は、以下の情報とともに開発者に連絡してください:

1. **診断情報セクションのスクリーンショット**
2. **エラーメッセージ**（表示される場合）
3. **OS情報**（Windows 10/11, macOS 13/14, Ubuntuなど）
4. **実行方法**（ダブルクリック、コマンドラインなど）
5. **ビルドログ**（ビルド時にエラーがあった場合）
