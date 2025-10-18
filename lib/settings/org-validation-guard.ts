/**
 * Organization Validation Guard (Lightweight)
 * 軽量な組織ID検証ガード - localStorage のみ使用（API呼び出しなし）
 */

const VALIDATION_CACHE_KEY = 'org-validation-result';
const API_KEY_LOCK_KEY = 'api-key-locked';

export type ValidationResult = {
  validated: boolean;
  orgId: string | null;
  validatedAt: string;
  apiKeyHash: string; // APIキー全体のハッシュ値
};

/**
 * APIキーのハッシュを生成（SHA-256）
 */
async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 検証結果を保存（welcome画面で使用）
 */
export async function saveValidationResult(apiKey: string, orgId: string): Promise<void> {
  const apiKeyHash = await hashApiKey(apiKey);
  const result: ValidationResult = {
    validated: true,
    orgId,
    validatedAt: new Date().toISOString(),
    apiKeyHash, // APIキー全体のハッシュを保存
  };
  localStorage.setItem(VALIDATION_CACHE_KEY, JSON.stringify(result));
}

/**
 * 検証結果をクリア
 */
export function clearValidationResult(): void {
  localStorage.removeItem(VALIDATION_CACHE_KEY);
}

/**
 * APIキー入力をロック（認証成功時に呼び出す）
 */
export function lockApiKeyInput(): void {
  localStorage.setItem(API_KEY_LOCK_KEY, 'true');
}

/**
 * APIキー入力をアンロック（検証キャッシュもクリア）
 */
export function unlockApiKeyInput(): void {
  localStorage.removeItem(API_KEY_LOCK_KEY);
  clearValidationResult(); // 検証キャッシュも削除
}

/**
 * APIキー入力がロックされているかチェック
 */
export function isApiKeyLocked(): boolean {
  return localStorage.getItem(API_KEY_LOCK_KEY) === 'true';
}

/**
 * 現在のAPIキーが検証済みか確認（軽量・高速）
 * @returns 検証済みならtrue、それ以外はfalse
 */
export async function isCurrentApiKeyValidated(currentApiKey: string | undefined): Promise<boolean> {
  if (!currentApiKey) {
    return false;
  }

  try {
    const stored = localStorage.getItem(VALIDATION_CACHE_KEY);
    if (!stored) {
      return false;
    }

    const result: ValidationResult = JSON.parse(stored);

    // APIキー全体のハッシュ値が一致するかチェック
    const currentHash = await hashApiKey(currentApiKey);
    return result.validated && result.apiKeyHash === currentHash;
  } catch {
    return false;
  }
}

/**
 * ホワイトリスト機能が有効か確認
 */
export async function isWhitelistEnabled(): Promise<boolean> {
  // org-whitelist の実装を参照
  try {
    const stored = localStorage.getItem('org-whitelist');
    if (!stored) return false;
    const entries = JSON.parse(stored);
    return Array.isArray(entries) && entries.length > 0;
  } catch {
    return false;
  }
}

/**
 * APIキーの使用をブロックすべきかチェック（軽量・高速）
 * @returns ブロックすべきならエラーメッセージ、OKならnull
 */
export async function checkApiKeyAccess(apiKey: string | undefined): Promise<string | null> {
  // ホワイトリストが無効なら常に許可
  const whitelistEnabled = await isWhitelistEnabled();
  if (!whitelistEnabled) {
    return null;
  }

  // ホワイトリストが有効な場合、検証済みかチェック
  const isValidated = await isCurrentApiKeyValidated(apiKey);
  if (!isValidated) {
    return 'このAPIキーは組織IDホワイトリスト検証に合格していません。\n\nウェルカム画面で正しいAPIキーを設定してください。';
  }

  return null;
}

/**
 * APIキーロックと検証キャッシュをすべてクリア（DB再作成時に使用）
 */
export function clearAllValidationData(): void {
  localStorage.removeItem(VALIDATION_CACHE_KEY);
  localStorage.removeItem(API_KEY_LOCK_KEY);
  console.log('✅ Validation cache and API key lock cleared');
}
