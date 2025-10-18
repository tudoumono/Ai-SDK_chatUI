/**
 * Tauri環境のヘルパーユーティリティ
 */

/**
 * Tauri環境で実行されているかチェック
 */
export function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return '__TAURI__' in window;
}

/**
 * Tauri環境でファイルを保存
 */
export async function saveTauriFile(content: string, defaultFilename: string): Promise<void> {
  if (!isTauriEnvironment()) {
    throw new Error('This function can only be called in Tauri environment');
  }

  try {
    console.log('[saveTauriFile] Starting Tauri file save...');

    // Tauri APIを動的にインポート
    console.log('[saveTauriFile] Importing Tauri plugins...');
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    console.log('[saveTauriFile] Plugins imported successfully');

    // ファイル保存ダイアログを表示
    console.log('[saveTauriFile] Opening save dialog...');
    const filePath = await save({
      defaultPath: defaultFilename,
      filters: [{
        name: 'JSON',
        extensions: ['json']
      }]
    });

    // キャンセルされた場合
    if (!filePath) {
      console.log('[saveTauriFile] File save cancelled by user');
      return;
    }

    // ファイルを書き込み
    console.log(`[saveTauriFile] Writing file to: ${filePath}`);
    await writeTextFile(filePath, content);
    console.log(`[saveTauriFile] ✅ File saved successfully: ${filePath}`);
  } catch (error) {
    console.error('[saveTauriFile] ❌ Failed to save file in Tauri:', error);
    console.error('[saveTauriFile] Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

/**
 * ブラウザ環境でファイルをダウンロード（従来の方法）
 */
export function downloadBrowserFile(content: string, filename: string, mimeType = 'application/json'): void {
  try {
    console.log('[downloadBrowserFile] Starting browser download...');
    console.log('[downloadBrowserFile] Filename:', filename);
    console.log('[downloadBrowserFile] Content size:', content.length, 'bytes');

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();

    console.log('[downloadBrowserFile] ✅ Download triggered successfully');

    // クリーンアップを少し遅延
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      console.log('[downloadBrowserFile] Cleanup completed');
    }, 100);
  } catch (error) {
    console.error('[downloadBrowserFile] ❌ Download failed:', error);
    throw error;
  }
}

/**
 * 環境に応じてファイルを保存（Tauri or Browser）
 */
export async function saveFile(content: string, filename: string): Promise<void> {
  const isTauri = isTauriEnvironment();
  console.log(`[saveFile] Environment: ${isTauri ? 'Tauri' : 'Browser'}, File: ${filename}`);

  if (isTauri) {
    console.log('[saveFile] Using Tauri file dialog...');
    await saveTauriFile(content, filename);
  } else {
    console.log('[saveFile] Using browser download...');
    downloadBrowserFile(content, filename);
  }
}
