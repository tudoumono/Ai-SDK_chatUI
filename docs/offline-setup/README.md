# オフライン環境でのビルド手順

このドキュメントでは、インターネット接続のないオフライン環境でAi-SDK_chatUIをWindows向けにexe化する手順を説明します。

## 📋 必要なもの

### インストーラー（GitHub Releasesから入手）

以下のインストーラーを[GitHubのReleases](https://github.com/tudoumono/PlayGround/releases)からダウンロードしてください:

- **Node.js**: `node-v20.x.x-x64.msi`
- **Rust**: `rustup-init.exe`
- **Visual Studio Build Tools**: `vs_BuildTools.exe` + オフラインレイアウト

> **注意**: VS Build Toolsのオフラインレイアウトは約5-10GBと巨大なため、GitHub Releasesには含まれていません。別途ダウンロードスクリプトを使用してください。

### プロジェクトファイル

- このリポジトリのソースコード（zip形式またはgit clone）

---

## 🔧 事前準備（インターネット接続可能な環境で実行）

### 1. インストーラーのダウンロード

#### PowerShellスクリプトを使用（推奨）

```powershell
# ダウンロードスクリプトを実行
cd docs/offline-setup
.\download-tools.ps1
```

スクリプトは以下を `C:\offline-installers` にダウンロードします:
- Node.js v20.x.x
- Rustup
- VS Build Tools（オフラインレイアウト作成）

#### 手動ダウンロード

1. **Node.js**
   - URL: https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi
   - ファイル名: `node-v20.11.0-x64.msi`

2. **Rust**
   - URL: https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe
   - ファイル名: `rustup-init.exe`

3. **Visual Studio Build Tools**
   - URL: https://aka.ms/vs/17/release/vs_BuildTools.exe
   - ダウンロード後、オフラインレイアウトを作成:
   ```cmd
   vs_BuildTools.exe --layout C:\offline-installers\VSBuildTools ^
     --add Microsoft.VisualStudio.Workload.VCTools ^
     --includeRecommended ^
     --lang ja-JP
   ```
   - 完了まで30分〜1時間程度かかります

### 2. プロジェクトの準備

```bash
# プロジェクトのルートディレクトリで実行
cd /path/to/Ai-SDK_chatUI

# 依存関係を完全インストール
npm install

# プロジェクト全体をアーカイブ（node_modules含む）
cd ..
tar -czf Ai-SDK_chatUI-offline.tar.gz Ai-SDK_chatUI/
```

または、node_modulesを除外してアーカイブ:
```bash
# Git管理下のファイルのみをアーカイブ
git archive --format=tar.gz --output=Ai-SDK_chatUI.tar.gz HEAD
```

### 3. オフライン環境への持ち込み

以下をUSBメモリ等にコピー:
```
📁 offline-package/
  ├─ node-v20.11.0-x64.msi
  ├─ rustup-init.exe
  ├─ VSBuildTools/ (完全なオフラインレイアウト)
  └─ Ai-SDK_chatUI-offline.tar.gz
```

---

## 💻 オフライン環境でのインストール（Windows）

### Step 1: Node.jsのインストール

1. `node-v20.11.0-x64.msi` をダブルクリック
2. インストールウィザードに従って進める（デフォルト設定でOK）
3. インストール完了後、新しいコマンドプロンプトを開いて確認:
   ```cmd
   node --version
   npm --version
   ```

### Step 2: Visual Studio Build Toolsのインストール

1. `VSBuildTools\vs_BuildTools.exe` を実行
2. 「**C++ によるデスクトップ開発**」ワークロードを選択
3. インストール（約30分〜1時間）
4. 完了後、再起動を推奨

### Step 3: Rustのインストール

#### オプションA: Rustupを使用（シンプル）

```cmd
rustup-init.exe
```

インストール中に以下を選択:
- `1) Proceed with installation (default)`
- インストール先はデフォルトのまま

#### オプションB: 完全オフラインインストール（上級者向け）

事前に別環境で `.rustup` フォルダをコピーしている場合:

```cmd
# .rustupフォルダをユーザーディレクトリに配置
xcopy /E /I D:\USB\.rustup C:\Users\%USERNAME%\.rustup
xcopy /E /I D:\USB\.cargo C:\Users\%USERNAME%\.cargo

# 環境変数を設定
setx RUSTUP_HOME "C:\Users\%USERNAME%\.rustup"
setx CARGO_HOME "C:\Users\%USERNAME%\.cargo"
setx PATH "%PATH%;C:\Users\%USERNAME%\.cargo\bin"
```

新しいコマンドプロンプトで確認:
```cmd
rustc --version
cargo --version
```

### Step 4: プロジェクトのセットアップ

```cmd
# プロジェクトを展開
cd C:\projects
tar -xzf Ai-SDK_chatUI-offline.tar.gz
cd Ai-SDK_chatUI

# 依存関係のインストール（node_modulesが無い場合のみ）
npm install
```

---

## 🚀 exeファイルのビルド

### ビルドコマンド実行

```cmd
npm run tauri build
```

ビルドには10〜20分程度かかります。

### ビルド成果物

ビルドが成功すると、以下の場所にファイルが生成されます:

#### 実行ファイル（exe）
```
src-tauri\target\release\ai-sdk-chatui.exe
```

#### インストーラー（msi）
```
src-tauri\target\release\bundle\msi\ai-sdk-chatui_1.0.0_x64_ja-JP.msi
```

#### その他のバンドル（オプション）
- NSIS形式: `src-tauri\target\release\bundle\nsis\*.exe`

---

## 📦 配布方法

### 方法1: 実行ファイル（exe）のみ配布

`ai-sdk-chatui.exe` を配布。
- **メリット**: シンプル
- **デメリット**: 依存ファイルが必要な場合がある

### 方法2: インストーラー（msi）を配布（推奨）

`*.msi` を配布。
- **メリット**: Windowsの標準的なインストール方法
- **デメリット**: ファイルサイズが大きい

---

## ⚠️ トラブルシューティング

### ビルドエラー: "linker 'link.exe' not found"

**原因**: Visual Studio Build Toolsが正しくインストールされていない

**解決策**:
1. VS Build Toolsを再インストール
2. 「C++ によるデスクトップ開発」が選択されているか確認
3. Windowsを再起動

### ビルドエラー: "cargo: command not found"

**原因**: Rustのパスが通っていない

**解決策**:
```cmd
# 新しいコマンドプロンプトを開く
# または手動でパスを追加
set PATH=%PATH%;C:\Users\%USERNAME%\.cargo\bin
```

### npm installが失敗する

**原因**: node_modulesが不完全

**解決策**:
```cmd
# キャッシュをクリア
npm cache clean --force

# node_modulesを削除して再インストール
rmdir /s /q node_modules
npm install
```

---

## 📚 参考リンク

- [Tauri公式ドキュメント](https://tauri.app/v1/guides/)
- [Rustインストールガイド](https://www.rust-lang.org/tools/install)
- [Node.js公式サイト](https://nodejs.org/)

---

## 🆘 サポート

問題が発生した場合は、以下の情報と共にGitHub Issuesに報告してください:

- Windowsのバージョン
- エラーメッセージの全文
- 実行したコマンドの履歴
