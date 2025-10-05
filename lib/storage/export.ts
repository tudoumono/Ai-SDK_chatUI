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
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ai-sdk-chatui-export-${Date.now()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
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
