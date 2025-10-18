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
    console.log('[downloadBrowserFile] MIME type:', mimeType);

    // 方法1: Blob + <a>タグでダウンロード（主要な方法）
    try {
      const blob = new Blob([content], { type: mimeType });
      console.log('[downloadBrowserFile] Blob created:', blob.size, 'bytes');

      const url = URL.createObjectURL(blob);
      console.log('[downloadBrowserFile] Object URL created:', url);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      
      // リンクを一時的にDOMに追加（一部のブラウザで必要）
      link.style.display = 'none';
      document.body.appendChild(link);
      console.log('[downloadBrowserFile] Link appended to document');

      // クリックイベントをディスパッチ
      console.log('[downloadBrowserFile] Triggering click event...');
      link.click();
      console.log('[downloadBrowserFile] Click event triggered');

      // 少し待ってからクリーンアップ
      setTimeout(() => {
        try {
          if (link.parentNode) {
            document.body.removeChild(link);
          }
          URL.revokeObjectURL(url);
          console.log('[downloadBrowserFile] Cleanup completed');
        } catch (cleanupError) {
          console.warn('[downloadBrowserFile] Cleanup warning:', cleanupError);
        }
      }, 500); // 100msから500msに延長

      console.log('[downloadBrowserFile] ✅ Download triggered successfully');
      console.log('[downloadBrowserFile] ⚠️ ファイルがダウンロードされない場合:');
      console.log('[downloadBrowserFile]   1. ブラウザの通知バーを確認してください');
      console.log('[downloadBrowserFile]   2. ダウンロード設定でブロックされていないか確認してください');
      console.log('[downloadBrowserFile]   3. ダウンロードフォルダを確認してください');
      return;
    } catch (downloadError) {
      console.error('[downloadBrowserFile] ⚠️ Primary download method failed, trying alternative...', downloadError);

      // 方法2: data URIを使った代替方法
      try {
        const dataUri = `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
        const link = document.createElement('a');
        link.href = dataUri;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();

        setTimeout(() => {
          if (link.parentNode) {
            document.body.removeChild(link);
          }
        }, 500);

        console.log('[downloadBrowserFile] ✅ Alternative download method succeeded');
        return;
      } catch (altError) {
        console.error('[downloadBrowserFile] ❌ Alternative download method also failed:', altError);
        throw altError;
      }
    }
  } catch (error) {
    console.error('[downloadBrowserFile] ❌ All download methods failed:', error);
    console.error('[downloadBrowserFile] Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

/**
 * 環境に応じてファイルを保存（Tauri or Browser）
 */
export async function saveFile(content: string, filename: string): Promise<void> {
  const isTauri = isTauriEnvironment();
  console.log(`[saveFile] Environment: ${isTauri ? 'Tauri' : 'Browser'}, File: ${filename}`);

  try {
    if (isTauri) {
      console.log('[saveFile] Using Tauri file dialog...');
      await saveTauriFile(content, filename);
    } else {
      console.log('[saveFile] Using browser download...');
      downloadBrowserFile(content, filename);
    }
  } catch (error) {
    console.error('[saveFile] ❌ File save failed:', error);
    throw error;
  }
}
