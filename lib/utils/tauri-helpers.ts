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
    // Tauri APIを動的にインポート
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');

    // ファイル保存ダイアログを表示
    const filePath = await save({
      defaultPath: defaultFilename,
      filters: [{
        name: 'JSON',
        extensions: ['json']
      }]
    });

    // キャンセルされた場合
    if (!filePath) {
      console.log('File save cancelled by user');
      return;
    }

    // ファイルを書き込み
    await writeTextFile(filePath, content);
    console.log(`File saved successfully: ${filePath}`);
  } catch (error) {
    console.error('Failed to save file in Tauri:', error);
    throw error;
  }
}

/**
 * ブラウザ環境でファイルをダウンロード（従来の方法）
 */
export function downloadBrowserFile(content: string, filename: string, mimeType = 'application/json'): void {
  try {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();

    // クリーンアップを少し遅延
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (error) {
    console.error('Download failed:', error);
    throw error;
  }
}

/**
 * 環境に応じてファイルを保存（Tauri or Browser）
 */
export async function saveFile(content: string, filename: string): Promise<void> {
  if (isTauriEnvironment()) {
    await saveTauriFile(content, filename);
  } else {
    downloadBrowserFile(content, filename);
  }
}
