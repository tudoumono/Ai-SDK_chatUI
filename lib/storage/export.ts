import {
  type ConversationRecord,
  type ExportBundle,
  type VectorStoreRecord,
} from "./schema";

export function buildExportBundle(
  conversations: ConversationRecord[],
  vectorStores: VectorStoreRecord[],
): ExportBundle {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    conversations,
    vectorStores,
  };
}

export async function downloadBundle(bundle: ExportBundle) {
  try {
    const json = JSON.stringify(bundle, null, 2);
    const blob = new Blob([json], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ai-sdk-chatui-export-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();

    // クリーンアップを少し遅延
    setTimeout(() => {
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (error) {
    console.error("Download failed:", error);
    throw error;
  }
}

export function parseBundle(json: unknown): ExportBundle {
  if (!json || typeof json !== "object") {
    throw new Error("無効なファイルです");
  }
  const bundle = json as Partial<ExportBundle>;
  if (bundle.schemaVersion !== 1) {
    throw new Error("対応していない schemaVersion です");
  }
  if (!Array.isArray(bundle.conversations) || !Array.isArray(bundle.vectorStores)) {
    throw new Error("conversations/vectorStores が欠落しています");
  }
  return bundle as ExportBundle;
}
