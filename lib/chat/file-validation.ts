// Responses APIでサポートされているファイル形式
export const SUPPORTED_FILE_TYPES = {
  // 画像ファイル（Vision対応モデル用）
  images: {
    extensions: ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    purpose: 'vision' as const,
  },
  // 文書・テキストファイル（file_search用）
  documents: {
    extensions: [
      '.pdf', '.txt', '.md', '.json', '.html',
      '.doc', '.docx',
      '.c', '.cs', '.cpp', '.java', '.js', '.ts', '.py', '.rb', '.go',
    ],
    mimeTypes: [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/json',
      'text/html',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/x-c',
      'text/x-csharp',
      'text/x-c++src',
      'text/x-java',
      'text/javascript',
      'application/typescript',
      'text/x-python',
      'text/x-ruby',
      'text/x-go',
    ],
    purpose: 'assistants' as const,
  },
} as const;

const MAX_FILE_SIZE = 512 * 1024 * 1024; // 512MB
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB

export type FileValidationError = {
  type: 'unsupported' | 'size' | 'invalid';
  message: string;
};

export type ValidatedFile = {
  file: File;
  purpose: 'vision' | 'assistants';
  isImage: boolean;
};

export function validateFile(file: File): { error?: FileValidationError; validated?: ValidatedFile } {
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  const mimeType = file.type.toLowerCase();

  // 画像ファイルチェック
  const isImage = SUPPORTED_FILE_TYPES.images.extensions.includes(extension) ||
    SUPPORTED_FILE_TYPES.images.mimeTypes.includes(mimeType);

  // 文書ファイルチェック
  const isDocument = SUPPORTED_FILE_TYPES.documents.extensions.includes(extension) ||
    SUPPORTED_FILE_TYPES.documents.mimeTypes.includes(mimeType);

  // サポート外の形式
  if (!isImage && !isDocument) {
    const supportedExts = [
      ...SUPPORTED_FILE_TYPES.images.extensions,
      ...SUPPORTED_FILE_TYPES.documents.extensions,
    ].join(', ');
    return {
      error: {
        type: 'unsupported',
        message: `ファイル形式 ${extension} はサポートされていません。サポート形式: ${supportedExts}`,
      },
    };
  }

  // ファイルサイズチェック
  const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_FILE_SIZE;
  if (file.size > maxSize) {
    const maxSizeMB = Math.floor(maxSize / 1024 / 1024);
    return {
      error: {
        type: 'size',
        message: `ファイルサイズが大きすぎます（最大 ${maxSizeMB}MB）`,
      },
    };
  }

  return {
    validated: {
      file,
      purpose: isImage ? 'vision' : 'assistants',
      isImage,
    },
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
