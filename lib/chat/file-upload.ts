import type { ConnectionSettings } from "@/lib/settings/connection-storage";
import { createResponsesClient } from "./openai-client";
import { saveLog } from "@/lib/logging/error-logger";
import { isChatAttachmentAllowed, isFileUploadAllowed } from "@/lib/settings/feature-restrictions";

export type UploadedFileInfo = {
  fileId: string;
  fileName: string;
  fileSize: number;
  purpose: 'vision' | 'assistants';
  isImage: boolean;
};

export async function uploadFileToOpenAI(
  file: File,
  purpose: 'vision' | 'assistants',
  connection: ConnectionSettings,
): Promise<UploadedFileInfo> {
  if (!isFileUploadAllowed()) {
    throw new Error("ファイルアップロード機能は管理者により無効化されています。");
  }

  if (!isChatAttachmentAllowed()) {
    throw new Error("チャットでのファイル添付は管理者により無効化されています。");
  }

  const client = createResponsesClient(connection);

  try {
    console.log(`[file-upload] Uploading file: ${file.name} (${file.size} bytes) with purpose: ${purpose}`);

    const uploadedFile = await client.files.create({
      file,
      purpose,
    });

    console.log(`[file-upload] Upload successful. File ID: ${uploadedFile.id}`);

    return {
      fileId: uploadedFile.id,
      fileName: file.name,
      fileSize: file.size,
      purpose,
      isImage: purpose === 'vision',
    };
  } catch (error) {
    console.error('[file-upload] Upload failed:', error);

    // エラーログに記録
    await saveLog(
      'error',
      'api',
      `Chat file upload failed: ${file.name}`,
      error instanceof Error ? error : undefined,
      {
        fileName: file.name,
        fileSize: file.size,
        purpose,
        isImage: purpose === 'vision',
        errorMessage: error instanceof Error ? error.message : String(error),
      }
    );

    if (error instanceof Error) {
      // OpenAI APIエラーメッセージを解析
      if (error.message.includes('unsupported')) {
        throw new Error(`ファイル形式がサポートされていません: ${file.name}`);
      }
      if (error.message.includes('size')) {
        throw new Error(`ファイルサイズが大きすぎます: ${file.name}`);
      }
      throw new Error(`ファイルアップロードエラー: ${error.message}`);
    }
    throw new Error('ファイルのアップロードに失敗しました');
  }
}

export async function deleteFileFromOpenAI(
  fileId: string,
  connection: ConnectionSettings,
): Promise<void> {
  const client = createResponsesClient(connection);
  try {
    await client.files.delete(fileId);
  } catch (error) {
    console.error('Failed to delete file:', error);
    // 削除失敗は致命的ではないため、エラーを投げない
  }
}
