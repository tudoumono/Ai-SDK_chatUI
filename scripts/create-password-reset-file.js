#!/usr/bin/env node

/**
 * パスワードリセットファイル作成スクリプト
 *
 * 使用方法:
 *   node scripts/create-password-reset-file.js <新しいパスワード>
 *
 * 例:
 *   node scripts/create-password-reset-file.js MyNewSecurePassword123
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const RESET_FILE_NAME = '.admin-password-reset';

function getAppConfigDir() {
  const platform = os.platform();
  const homeDir = os.homedir();

  // Tauriのapp config dirの場所（プラットフォーム別）
  // 実際の配置場所はTauriの設定に依存しますが、一般的な場所を示します
  switch (platform) {
    case 'win32':
      return path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'com.tauri.dev');
    case 'darwin':
      return path.join(homeDir, 'Library', 'Application Support', 'com.tauri.dev');
    case 'linux':
      return path.join(homeDir, '.config', 'com.tauri.dev');
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

function createResetFile(newPassword, targetDir) {
  // パスワードのバリデーション
  if (!newPassword || newPassword.length < 6) {
    console.error('❌ エラー: パスワードは6文字以上である必要があります');
    process.exit(1);
  }

  // ディレクトリが存在しない場合は作成
  if (!fs.existsSync(targetDir)) {
    console.log(`📁 ディレクトリを作成: ${targetDir}`);
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const resetFilePath = path.join(targetDir, RESET_FILE_NAME);

  // リセットファイルを作成
  fs.writeFileSync(resetFilePath, newPassword, 'utf8');

  console.log('✅ パスワードリセットファイルを作成しました\n');
  console.log(`📄 ファイルパス: ${resetFilePath}`);
  console.log(`🔑 新しいパスワード: ${newPassword}`);
  console.log('\n⚠️  重要:');
  console.log('1. このファイルをアプリケーションの設定ディレクトリに配置してください');
  console.log('2. アプリケーションを起動し、管理者ログイン画面でリセットボタンをクリックしてください');
  console.log('3. リセット成功後、ファイルは自動的に削除されます\n');
}

// メイン処理
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('パスワードリセットファイル作成ツール\n');
  console.log('使用方法:');
  console.log('  node scripts/create-password-reset-file.js <新しいパスワード>\n');
  console.log('例:');
  console.log('  node scripts/create-password-reset-file.js MyNewSecurePassword123\n');
  console.log('オプション:');
  console.log('  --current-dir    カレントディレクトリにファイルを作成');
  console.log('  --help          このヘルプを表示\n');
  process.exit(0);
}

const newPassword = args[0];
const useCurrentDir = args.includes('--current-dir');

try {
  const targetDir = useCurrentDir ? process.cwd() : getAppConfigDir();
  createResetFile(newPassword, targetDir);
} catch (error) {
  console.error('❌ エラー:', error.message);
  process.exit(1);
}
