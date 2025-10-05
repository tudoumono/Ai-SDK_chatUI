import type { ConnectionSettings } from "@/lib/settings/connection-storage";
import { createResponsesClient } from "@/lib/chat/openai-client";

export type ModelInfo = {
  id: string;
  name: string;
  created?: number;
};

const DEFAULT_MODELS: ModelInfo[] = [
  { id: "gpt-4o", name: "GPT-4o" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini" },
  { id: "o1", name: "o1" },
  { id: "o1-mini", name: "o1 Mini" },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
];

export async function fetchModelsFromApi(
  connection: ConnectionSettings,
): Promise<ModelInfo[]> {
  try {
    const client = createResponsesClient(connection);
    const response = await client.models.list();

    const models = response.data
      .filter((model) => model.id.includes("gpt") || model.id.includes("o1"))
      .map((model) => ({
        id: model.id,
        name: model.id,
        created: model.created,
      }))
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));

    return models.length > 0 ? models : DEFAULT_MODELS;
  } catch (error) {
    console.error("Failed to fetch models:", error);
    return DEFAULT_MODELS;
  }
}

export function getDefaultModels(): ModelInfo[] {
  return DEFAULT_MODELS;
}
