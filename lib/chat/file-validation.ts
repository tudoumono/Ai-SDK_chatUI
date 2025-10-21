// Responses APIでサポートされているファイル形式
// 参考: https://platform.openai.com/docs/assistants/tools/file-search/supported-files
export const SUPPORTED_FILE_TYPES = {
  // 画像ファイル（Vision対応モデル用）
  images: {
    extensions: ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    purpose: 'vision' as const,
  },
  // 文書・テキストファイル（file_search用）
  // OpenAIが公式にサポートしている形式のみ
  documents: {
    extensions: [
      '.pdf',    // PDF
      '.txt',    // テキスト
      '.md',     // Markdown
      '.html',   // HTML
      '.docx',   // Word (新形式)
      '.pptx',   // PowerPoint (新形式)
    ],
    mimeTypes: [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'text/html',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
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
  const extension = (() => {
    const parts = file.name.split('.');
    if (parts.length <= 1) return '';
    const last = parts.pop();
    return last ? `.${last.toLowerCase()}` : '';
  })();
  const mimeType = file.type.toLowerCase();

  // 画像ファイルチェック
  const isImageExtension = SUPPORTED_FILE_TYPES.images.extensions.some((ext) => ext === extension);
  const isImageMime = SUPPORTED_FILE_TYPES.images.mimeTypes.some((type) => type === mimeType);
  const isImage = isImageExtension || isImageMime;

  // 文書ファイルチェック
  const isDocumentExtension = SUPPORTED_FILE_TYPES.documents.extensions.some((ext) => ext === extension);
  const isDocumentMime = SUPPORTED_FILE_TYPES.documents.mimeTypes.some((type) => type === mimeType);
  const isDocument = isDocumentExtension || isDocumentMime;

  // サポート外の形式
  if (!isImage && !isDocument) {
    const supportedExts = [
      ...SUPPORTED_FILE_TYPES.images.extensions,
      ...SUPPORTED_FILE_TYPES.documents.extensions,
    ].join(', ');
    const extensionLabel = extension || '(拡張子なし)';
    return {
      error: {
        type: 'unsupported',
        message: `ファイル形式 ${extensionLabel} はサポートされていません。サポート形式: ${supportedExts}`,
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
