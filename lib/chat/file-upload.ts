import type { ConnectionSettings } from "@/lib/settings/connection-storage";
import { createResponsesClient } from "./openai-client";

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
  const client = createResponsesClient(connection);

  try {
    const uploadedFile = await client.files.create({
      file,
      purpose,
    });

    return {
      fileId: uploadedFile.id,
      fileName: file.name,
      fileSize: file.size,
      purpose,
      isImage: purpose === 'vision',
    };
  } catch (error) {
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
