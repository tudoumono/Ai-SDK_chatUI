#!/bin/bash
# オフライン環境用インストーラーダウンロードスクリプト（Linux/macOS用）
# 実行方法: bash download-tools.sh

set -e

# 出力先ディレクトリ
OUTPUT_DIR="$HOME/offline-installers"

# 色設定
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ディレクトリ作成
echo -e "${CYAN}出力先ディレクトリを作成: $OUTPUT_DIR${NC}"
mkdir -p "$OUTPUT_DIR"

echo -e "\n${GREEN}========================================"
echo "オフライン環境用インストーラーダウンロード開始"
echo -e "========================================${NC}\n"

# 1. Node.js のダウンロード
echo -e "${YELLOW}[1/3] Node.js v20.11.0 をダウンロード中...${NC}"
NODE_URL="https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
NODE_OUTPUT="$OUTPUT_DIR/node-v20.11.0-x64.msi"

if curl -L "$NODE_URL" -o "$NODE_OUTPUT" --progress-bar; then
    echo -e "${GREEN}✓ Node.js ダウンロード完了: $NODE_OUTPUT${NC}"
else
    echo -e "${RED}✗ Node.js ダウンロード失敗${NC}"
fi

# 2. Rustup のダウンロード
echo -e "\n${YELLOW}[2/3] Rustup をダウンロード中...${NC}"
RUST_URL="https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe"
RUST_OUTPUT="$OUTPUT_DIR/rustup-init.exe"

if curl -L "$RUST_URL" -o "$RUST_OUTPUT" --progress-bar; then
    echo -e "${GREEN}✓ Rustup ダウンロード完了: $RUST_OUTPUT${NC}"
else
    echo -e "${RED}✗ Rustup ダウンロード失敗${NC}"
fi

# 3. Visual Studio Build Tools のダウンロード
echo -e "\n${YELLOW}[3/3] Visual Studio Build Tools をダウンロード中...${NC}"
VS_URL="https://aka.ms/vs/17/release/vs_BuildTools.exe"
VS_OUTPUT="$OUTPUT_DIR/vs_BuildTools.exe"

if curl -L "$VS_URL" -o "$VS_OUTPUT" --progress-bar; then
    echo -e "${GREEN}✓ VS Build Tools ダウンロード完了: $VS_OUTPUT${NC}"
    echo -e "${CYAN}※ オフラインレイアウトの作成はWindows環境で実行してください${NC}"
else
    echo -e "${RED}✗ VS Build Tools ダウンロード失敗${NC}"
fi

# 完了メッセージ
echo -e "\n${GREEN}========================================"
echo "ダウンロード完了"
echo -e "========================================${NC}"
echo -e "\n${CYAN}出力先: $OUTPUT_DIR${NC}\n"

echo -e "${CYAN}ダウンロードされたファイル:${NC}"
ls -lh "$OUTPUT_DIR"

echo -e "\n${YELLOW}次のステップ:${NC}"
echo "1. $OUTPUT_DIR フォルダをWindows環境に転送"
echo "2. Windows上で download-tools.ps1 を実行してVS Build Toolsのオフラインレイアウトを作成"
echo "3. docs/offline-setup/README.md の手順に従ってインストール"

echo -e "\n${GREEN}スクリプト終了${NC}"
