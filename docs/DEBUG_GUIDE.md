# 🐛 デバッグガイド

このドキュメントでは、AI-SDK ChatUI（Tauri版/exe版）のデバッグ方法について説明します。

## 📋 目次

- [ターミナルからの起動方法](#ターミナルからの起動方法)
- [ログの確認方法](#ログの確認方法)
- [よくある問題と解決方法](#よくある問題と解決方法)
- [開発者ツールの使用](#開発者ツールの使用)

---

## ターミナルからの起動方法

Tauri版（exe版）をターミナルから起動することで、詳細なログを確認できます。

### Windows PowerShell

#### 方法1: リアルタイムでログを表示

```powershell
# exeファイルのディレクトリに移動
cd "F:\10_code\00_PlayGround\Ai-SDK_chatUI\src-tauri\target\release"

# 実行（ターミナルにログを表示）
.\app.exe
```

#### 方法2: ログをファイルに保存しながら表示

```powershell
# exeファイルのディレクトリに移動
cd "F:\10_code\00_PlayGround\Ai-SDK_chatUI\src-tauri\target\release"

# ログをファイルに保存しながら表示
.\app.exe 2>&1 | Tee-Object -FilePath debug.log
```

この方法では、ターミナルにログが表示されながら、同時に `debug.log` ファイルにも保存されます。

#### 方法3: ログをファイルのみに保存

```powershell
.\app.exe > debug.log 2>&1
```

アプリ終了後、`debug.log` を開いてログを確認できます。

### コマンドプロンプト

```cmd
cd "F:\10_code\00_PlayGround\Ai-SDK_chatUI\src-tauri\target\release"
app.exe > debug.log 2>&1
```

### バッチファイルで起動

便利なバッチファイルを作成することもできます。

**run_with_log.bat**:
```batch
@echo off
cd "F:\10_code\00_PlayGround\Ai-SDK_chatUI\src-tauri\target\release"
echo Starting AI-SDK ChatUI with logging...
app.exe 2>&1 | findstr /R ".*"
pause
```

このバッチファイルをダブルクリックすると、ログを表示しながらアプリが起動します。

---

## ログの確認方法

### ログの種類

#### 1. Rustバックエンドログ（必ず表示される）

形式: `[日付][時刻][モジュール名][レベル] メッセージ`

例:
```
[2025-10-18][18:20:22][app_lib][INFO] Application started
[2025-10-18][18:20:23][app_lib::openai_proxy][INFO] [Request xxx] Starting new request
[2025-10-18][18:20:36][app_lib::openai_proxy][INFO] [Request xxx] Response body: {...}
```

**重要なログ**:
- `Application started` - アプリ起動成功
- `Starting new request` - API リクエスト開始
- `Response received` - API レスポンス受信
- `Response body` - レスポンスの内容（デバッグ用）
- `Request completed successfully` - リクエスト成功

#### 2. JavaScriptコンソールログ（開発者ツール使用時）

形式: `[モジュール名] メッセージ`

例:
```
[Tauri] responses.stream called
[Tauri] Response received
[streaming] Event #1: response.output_text.delta
```

### ログの読み方

#### APIリクエストの追跡

1. **リクエスト開始**:
   ```
   [Request xxx] Starting new request
   [Request xxx] POST https://api.openai.com/v1/responses
   ```

2. **リクエスト送信**:
   ```
   [Request xxx] Sending request...
   ```

3. **レスポンス受信**:
   ```
   [Request xxx] Response received | Status: 200 | Size: 3670 bytes
   ```

4. **リクエスト完了**:
   ```
   [Request xxx] Request completed successfully
   ```

#### エラーの特定

エラーログは `[ERROR]` レベルで表示されます:
```
[2025-10-18][18:20:36][app_lib::openai_proxy][ERROR] [Request xxx] Connection failed: ...
```

---

## よくある問題と解決方法

### 問題1: アプリが起動しない

**症状**: exeファイルをダブルクリックしても何も起こらない

**デバッグ手順**:
1. ターミナルから起動してログを確認:
   ```powershell
   .\app.exe
   ```
2. エラーメッセージを確認
3. 依存関係が不足していないか確認

### 問題2: チャット機能が動作しない

**症状**: メッセージを送信しても応答が表示されない

**デバッグ手順**:
1. ターミナルでログを確認:
   ```powershell
   .\app.exe 2>&1 | Tee-Object -FilePath debug.log
   ```

2. 以下のログを確認:
   - `Response received | Status: 200` - API リクエストが成功しているか
   - `Response body: {...}` - レスポンスにテキストが含まれているか
   - エラーログが出ていないか

3. 開発者ツールを開いて JavaScript コンソールを確認（F12キー）

### 問題3: ファイルダウンロードが動作しない

**症状**: エクスポートボタンを押してもファイルが保存されない

**デバッグ手順**:
1. 設定画面で「診断情報」を確認
   - 「実行環境: ✅ Tauri (exe/app)」と表示されているか
   - 「⚠️ ブラウザ」と表示される場合は、ビルドに問題あり

2. ターミナルでログを確認:
   ```
   [saveTauriFile] Starting Tauri file save
   [saveTauriFile] Opening save dialog...
   ```

3. ダイアログが表示されない場合は、Tauri権限設定を確認

### 問題4: API接続エラー

**症状**: "Connection failed" エラーが表示される

**ログ例**:
```
[Request xxx] Connection failed: ... (Check network/proxy settings)
```

**解決方法**:
1. インターネット接続を確認
2. プロキシ設定を確認（必要な場合）
3. ファイアウォール設定を確認
4. APIキーが正しいか確認

---

## 開発者ツールの使用

Tauri版では、`F12` キーで開発者ツールを開くことができます（ビルド設定で有効化されている場合）。

### 開発者ツールの開き方

1. **アプリを起動**
2. **`F12` キーを押す**
3. **「Console」タブを開く**

### JavaScriptログの確認

コンソールタブで以下のようなログを確認できます:

```javascript
[Tauri] ===== responses.stream called =====
[Tauri] Response received
[Tauri] Extracted output text length: 150
[streaming] Event #1: response.output_text.delta
[streaming] Event #2: response.output_text.delta
```

### ネットワークタブの使用

「Network」タブでは、通常のブラウザと異なり、Tauri版では Rust バックエンドを経由するため、
リクエストは表示されません。代わりに、ターミナルのログで確認してください。

---

## トラブルシューティングチェックリスト

問題が発生した場合、以下を順番に確認してください:

- [ ] ターミナルから起動してログを確認した
- [ ] APIキーが正しく設定されている
- [ ] インターネット接続が正常
- [ ] エラーログに具体的なエラーメッセージが出ていないか確認
- [ ] 診断情報で「実行環境: ✅ Tauri (exe/app)」と表示されている
- [ ] 開発者ツール（F12）でJavaScriptエラーが出ていないか確認
- [ ] 最新版のexeファイルを使用している（古いキャッシュを削除）

---

## ログファイルの共有

問題を報告する際は、以下の情報を含めてください:

1. **debug.log ファイル**:
   ```powershell
   .\app.exe 2>&1 | Tee-Object -FilePath debug.log
   ```

2. **診断情報のスクリーンショット**:
   - 設定画面 → 診断情報セクション

3. **エラーメッセージのスクリーンショット**（ある場合）

4. **実行環境情報**:
   - OS バージョン
   - exeファイルのパス
   - 実行手順

---

## 参考リンク

- [EXE版テストガイド](./EXE_VERSION_TESTING_GUIDE.md)
- [Tauri公式ドキュメント](https://tauri.app/v1/guides/debugging/)
- [開発ガイド](../README.md)
