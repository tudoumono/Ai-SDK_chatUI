import type { ExportBundle } from "@/lib/storage/schema";

/**
 * バンドルデータをJSON形式でダウンロード
 */
export async function downloadBundle(bundle: ExportBundle): Promise<void> {
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `ai-sdk-chatui-export-${timestamp}.json`;

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * JSON文字列をパースしてExportBundle型に変換
 */
export function parseBundle(json: unknown): ExportBundle {
  if (!json || typeof json !== "object") {
    throw new Error("Invalid bundle format: not an object");
  }

  const bundle = json as Record<string, unknown>;

  if (bundle.schemaVersion !== 1) {
    throw new Error(
      `Unsupported schema version: ${bundle.schemaVersion}. Expected version 1.`,
    );
  }

  if (!Array.isArray(bundle.conversations)) {
    throw new Error("Invalid bundle format: conversations must be an array");
  }

  if (!Array.isArray(bundle.vectorStores)) {
    throw new Error("Invalid bundle format: vectorStores must be an array");
  }

  return {
    schemaVersion: 1,
    exportedAt: String(bundle.exportedAt || new Date().toISOString()),
    conversations: bundle.conversations,
    vectorStores: bundle.vectorStores,
    messages: Array.isArray(bundle.messages) ? bundle.messages : undefined,
    attachments: Array.isArray(bundle.attachments) ? bundle.attachments : undefined,
  };
}
