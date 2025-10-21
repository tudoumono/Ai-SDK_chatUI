/**
 * Feature Restrictions Management
 * 機能制限の管理
 *
 * 管理者が特定の機能（Web検索、Vector Store）を制限できるようにする
 */

export const FEATURE_RESTRICTIONS_STORAGE_KEY = "feature-restrictions";
const MANAGED_FLAG_KEY = `${FEATURE_RESTRICTIONS_STORAGE_KEY}:managed-by-secure-config`;
export const FEATURE_RESTRICTIONS_EVENT = "feature-restrictions-updated";

type FeatureToggleKeys = "allowWebSearch" | "allowVectorStore" | "allowFileUpload" | "allowChatFileAttachment";

export interface FeatureRestrictions {
  /** Web検索機能を許可するか */
  allowWebSearch: boolean;
  /** Vector Store機能を許可するか */
  allowVectorStore: boolean;
  /** ファイルアップロード機能を許可するか（Vector Store・チャット共通） */
  allowFileUpload: boolean;
  /** チャットでのファイル添付を許可するか */
  allowChatFileAttachment: boolean;
  /** 最終更新日時 */
  updatedAt: string;
}

const DEFAULT_RESTRICTIONS: FeatureRestrictions = {
  allowWebSearch: true,
  allowVectorStore: true,
  allowFileUpload: true,
  allowChatFileAttachment: true,
  updatedAt: new Date().toISOString(),
};

export type FeatureRestrictionsInput = Partial<Pick<FeatureRestrictions, FeatureToggleKeys>>;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function normalizeRestrictions(partial?: Partial<FeatureRestrictions>): FeatureRestrictions {
  const source = partial ?? {};
  return {
    allowWebSearch: source.allowWebSearch ?? DEFAULT_RESTRICTIONS.allowWebSearch,
    allowVectorStore: source.allowVectorStore ?? DEFAULT_RESTRICTIONS.allowVectorStore,
    allowFileUpload: source.allowFileUpload ?? DEFAULT_RESTRICTIONS.allowFileUpload,
    allowChatFileAttachment: source.allowChatFileAttachment ?? DEFAULT_RESTRICTIONS.allowChatFileAttachment,
    updatedAt: source.updatedAt ?? new Date().toISOString(),
  };
}

function broadcastFeatureRestrictionUpdate() {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(FEATURE_RESTRICTIONS_EVENT));
}

function writeRestrictionsToStorage(restrictions: FeatureRestrictions) {
  if (!isBrowser()) return;
  localStorage.setItem(FEATURE_RESTRICTIONS_STORAGE_KEY, JSON.stringify(restrictions));
  broadcastFeatureRestrictionUpdate();
}

export function setFeatureRestrictionsManaged(managed: boolean) {
  if (!isBrowser()) return;
  if (managed) {
    localStorage.setItem(MANAGED_FLAG_KEY, "true");
  } else {
    localStorage.removeItem(MANAGED_FLAG_KEY);
  }
}

export function isFeatureRestrictionsManaged(): boolean {
  if (!isBrowser()) return false;
  return localStorage.getItem(MANAGED_FLAG_KEY) === "true";
}

/**
 * Load feature restrictions from localStorage
 * 機能制限設定を読み込む
 */
export function loadFeatureRestrictions(): FeatureRestrictions {
  if (!isBrowser()) {
    return DEFAULT_RESTRICTIONS;
  }

  try {
    const stored = localStorage.getItem(FEATURE_RESTRICTIONS_STORAGE_KEY);
    if (!stored) {
      return DEFAULT_RESTRICTIONS;
    }

    const parsed = JSON.parse(stored) as Partial<FeatureRestrictions>;
    return normalizeRestrictions(parsed);
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
  restrictions: FeatureRestrictionsInput,
): FeatureRestrictions {
  if (!isBrowser()) {
    return DEFAULT_RESTRICTIONS;
  }

  try {
    const current = loadFeatureRestrictions();
    const updated = normalizeRestrictions({
      ...current,
      ...restrictions,
      updatedAt: new Date().toISOString(),
    });

    setFeatureRestrictionsManaged(false);
    writeRestrictionsToStorage(updated);
    return updated;
  } catch (error) {
    console.error("Failed to save feature restrictions:", error);
    throw error;
  }
}

export function applyFeatureRestrictionsFromSecureConfig(
  overrides: FeatureRestrictionsInput,
): FeatureRestrictions {
  if (!isBrowser()) {
    return DEFAULT_RESTRICTIONS;
  }

  const updated = normalizeRestrictions({
    ...DEFAULT_RESTRICTIONS,
    ...overrides,
    updatedAt: new Date().toISOString(),
  });
  setFeatureRestrictionsManaged(true);
  writeRestrictionsToStorage(updated);
  return updated;
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

/** ファイルアップロードが許可されているか */
export function isFileUploadAllowed(): boolean {
  const restrictions = loadFeatureRestrictions();
  return restrictions.allowFileUpload;
}

/** チャットでのファイル添付が許可されているか */
export function isChatAttachmentAllowed(): boolean {
  const restrictions = loadFeatureRestrictions();
  return restrictions.allowFileUpload && restrictions.allowChatFileAttachment;
}

/**
 * Reset to default restrictions (all allowed)
 * デフォルトの制限設定にリセット（すべて許可）
 */
export function resetFeatureRestrictions(): FeatureRestrictions {
  if (!isBrowser()) {
    return DEFAULT_RESTRICTIONS;
  }
  setFeatureRestrictionsManaged(false);
  const normalized = normalizeRestrictions({
    ...DEFAULT_RESTRICTIONS,
    updatedAt: new Date().toISOString(),
  });
  writeRestrictionsToStorage(normalized);
  return normalized;
}
