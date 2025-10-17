/**
 * Feature Restrictions Management
 * 機能制限の管理
 *
 * 管理者が特定の機能（Web検索、Vector Store）を制限できるようにする
 */

const STORAGE_KEY = "feature-restrictions";

export interface FeatureRestrictions {
  /** Web検索機能を許可するか */
  allowWebSearch: boolean;
  /** Vector Store機能を許可するか */
  allowVectorStore: boolean;
  /** 最終更新日時 */
  updatedAt: string;
}

const DEFAULT_RESTRICTIONS: FeatureRestrictions = {
  allowWebSearch: true,
  allowVectorStore: true,
  updatedAt: new Date().toISOString(),
};

/**
 * Load feature restrictions from localStorage
 * 機能制限設定を読み込む
 */
export function loadFeatureRestrictions(): FeatureRestrictions {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return DEFAULT_RESTRICTIONS;
    }

    const parsed = JSON.parse(stored) as FeatureRestrictions;
    return parsed;
  } catch (error) {
    console.error("Failed to load feature restrictions:", error);
    return DEFAULT_RESTRICTIONS;
  }
}

/**
 * Save feature restrictions to localStorage
 * 機能制限設定を保存する
 */
export function saveFeatureRestrictions(
  restrictions: Partial<FeatureRestrictions>,
): FeatureRestrictions {
  try {
    const current = loadFeatureRestrictions();
    const updated: FeatureRestrictions = {
      ...current,
      ...restrictions,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error("Failed to save feature restrictions:", error);
    throw error;
  }
}

/**
 * Check if web search is allowed
 * Web検索が許可されているか確認
 */
export function isWebSearchAllowed(): boolean {
  const restrictions = loadFeatureRestrictions();
  return restrictions.allowWebSearch;
}

/**
 * Check if vector store is allowed
 * Vector Storeが許可されているか確認
 */
export function isVectorStoreAllowed(): boolean {
  const restrictions = loadFeatureRestrictions();
  return restrictions.allowVectorStore;
}

/**
 * Reset to default restrictions (all allowed)
 * デフォルトの制限設定にリセット（すべて許可）
 */
export function resetFeatureRestrictions(): FeatureRestrictions {
  return saveFeatureRestrictions(DEFAULT_RESTRICTIONS);
}
