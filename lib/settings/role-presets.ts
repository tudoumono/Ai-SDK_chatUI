export type RolePreset = {
  id: string;
  name: string;
  content: string;
  isDefault?: boolean;
};

const STORAGE_KEY = "ai-sdk-chatui::role-presets";

const DEFAULT_PRESETS: RolePreset[] = [
  {
    id: "coding-assistant",
    name: "コーディングアシスタント",
    content: `あなたは経験豊富なソフトウェアエンジニアです。以下の原則に従ってください:

- コードは常に読みやすく、保守しやすい形で提供する
- ベストプラクティスとデザインパターンを適用する
- セキュリティとパフォーマンスを考慮する
- 適切なエラーハンドリングを実装する
- コメントで重要な箇所を説明する
- TypeScript/JavaScriptでは型安全性を重視する`,
    isDefault: true,
  },
  {
    id: "error-analyzer",
    name: "エラー分析スペシャリスト",
    content: `あなたはエラー分析とデバッグの専門家です。以下の手順でサポートしてください:

1. エラーメッセージとスタックトレースを詳しく分析
2. 問題の根本原因を特定
3. 具体的な解決策を段階的に提示
4. 再発防止のためのベストプラクティスを提案
5. 必要に応じて代替アプローチも提示

常に明確で実行可能な解決策を提供してください。`,
    isDefault: true,
  },
];

export async function loadRolePresets(): Promise<RolePreset[]> {
  if (typeof window === "undefined") {
    return DEFAULT_PRESETS;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return DEFAULT_PRESETS;
    }

    const presets = JSON.parse(stored) as RolePreset[];
    // デフォルトプリセットと統合
    const customPresets = presets.filter((p) => !p.isDefault);
    return [...DEFAULT_PRESETS, ...customPresets];
  } catch {
    return DEFAULT_PRESETS;
  }
}

export async function saveRolePresets(presets: RolePreset[]): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  try {
    // デフォルトプリセット以外を保存
    const customPresets = presets.filter((p) => !p.isDefault);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(customPresets));
  } catch (error) {
    console.error("Failed to save role presets:", error);
  }
}

export async function addRolePreset(preset: Omit<RolePreset, "id">): Promise<RolePreset> {
  const presets = await loadRolePresets();
  const newPreset: RolePreset = {
    id: `custom-${Date.now()}`,
    ...preset,
  };
  await saveRolePresets([...presets, newPreset]);
  return newPreset;
}

export async function deleteRolePreset(id: string): Promise<void> {
  const presets = await loadRolePresets();
  const filtered = presets.filter((p) => p.id !== id && !p.isDefault);
  await saveRolePresets(filtered);
}

export async function updateRolePreset(id: string, updates: Partial<RolePreset>): Promise<void> {
  const presets = await loadRolePresets();
  const updated = presets.map((p) => (p.id === id && !p.isDefault ? { ...p, ...updates } : p));
  await saveRolePresets(updated);
}
