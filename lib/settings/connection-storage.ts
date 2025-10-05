import { decryptJson, encryptJson, type EncryptedPayload } from "@/lib/crypto/aes-gcm";
import { sanitizeHeaders } from "@/lib/settings/header-utils";
import { saveSetting, getSetting, deleteSetting } from "@/lib/storage/indexed-db";

export type StoragePolicy = "none" | "session" | "persistent";
export type ConnectionHeaders = Record<string, string>;

export type ConnectionSettings = {
  baseUrl: string;
  apiKey: string;
  additionalHeaders?: ConnectionHeaders;
  httpProxy?: string;
  httpsProxy?: string;
  storagePolicy: StoragePolicy;
  encryptionEnabled: boolean;
  passphrase?: string;
};

type StoredConnectionV1 = {
  version: 1;
  storagePolicy: StoragePolicy;
  encryptionEnabled: boolean;
  meta: {
    baseUrl: string;
    httpProxy?: string;
    httpsProxy?: string;
    additionalHeaders?: ConnectionHeaders;
  };
  apiKey?: string;
  encryptedKey?: EncryptedPayload;
};

const SESSION_KEY = "ai-sdk-chatui::connection";
const PERSISTENT_KEY = "ai-sdk-chatui::connection:persistent";
const PASSPHRASE_KEY = "encryption-passphrase";
const PASSPHRASE_IO_TIMEOUT_MS = 1500;

let volatileConnection: ConnectionSettings | null = null;
let volatilePassphrase: string | null = null;

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    const timer = setTimeout(() => resolve(undefined), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(undefined);
      });
  });
}

// IndexedDB からパスフレーズを自動読み込み
async function loadPassphraseFromStorage(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const value = await runWithTimeout(
      getSetting(PASSPHRASE_KEY),
      PASSPHRASE_IO_TIMEOUT_MS,
    );
    return value ?? null;
  } catch {
    return null;
  }
}

// IndexedDB にパスフレーズを保存
async function savePassphraseToStorage(passphrase: string | null) {
  if (typeof window === "undefined") return;
  try {
    const operation = passphrase
      ? saveSetting(PASSPHRASE_KEY, passphrase)
      : deleteSetting(PASSPHRASE_KEY);
    await runWithTimeout(operation, PASSPHRASE_IO_TIMEOUT_MS);
  } catch {
    // エラーは無視（IndexedDB が使えない環境）
  }
}

function sanitizeSettings(settings: ConnectionSettings): ConnectionSettings {
  const { passphrase: _passphrase, ...rest } = settings;
  return rest;
}

function writeSession(payload: string | null) {
  if (typeof window === "undefined") return;
  if (payload === null) {
    window.sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  window.sessionStorage.setItem(SESSION_KEY, payload);
}

function writePersistent(payload: string | null) {
  if (typeof window === "undefined") return;
  if (payload === null) {
    window.localStorage.removeItem(PERSISTENT_KEY);
    return;
  }
  window.localStorage.setItem(PERSISTENT_KEY, payload);
}

function readStoredPayload(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return (
    window.sessionStorage.getItem(SESSION_KEY) ??
    window.localStorage.getItem(PERSISTENT_KEY)
  );
}

function parseStored(payload: string | null): StoredConnectionV1 | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as StoredConnectionV1;
    if (parsed.version !== 1) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function buildStoredRecord(
  settings: ConnectionSettings,
  encryptedKey?: EncryptedPayload,
): StoredConnectionV1 {
  return {
    version: 1,
    storagePolicy: settings.storagePolicy,
    encryptionEnabled: settings.encryptionEnabled,
    meta: {
      baseUrl: settings.baseUrl,
      httpProxy: settings.httpProxy,
      httpsProxy: settings.httpsProxy,
      additionalHeaders: settings.additionalHeaders,
    },
    apiKey: settings.encryptionEnabled ? undefined : settings.apiKey,
    encryptedKey,
  };
}

export async function saveConnection(settings: ConnectionSettings) {
  volatileConnection = sanitizeSettings(settings);

  // パスフレーズを IndexedDB に保存
  const passphraseToSave = settings.encryptionEnabled
    ? settings.passphrase?.trim() ?? null
    : null;
  volatilePassphrase = passphraseToSave;
  await savePassphraseToStorage(passphraseToSave);

  if (settings.storagePolicy === "none") {
    writeSession(null);
    writePersistent(null);
    return;
  }

  let encryptedKey: EncryptedPayload | undefined;
  if (settings.encryptionEnabled) {
    const passphrase = settings.passphrase?.trim();
    if (!passphrase) {
      throw new Error("暗号化を有効にする場合はパスフレーズが必要です。");
    }
    encryptedKey = await encryptJson({ apiKey: settings.apiKey }, passphrase);
  }

  const record = buildStoredRecord(settings, encryptedKey);
  const payload = JSON.stringify(record);

  if (settings.storagePolicy === "session") {
    writeSession(payload);
    writePersistent(null);
  } else {
    writeSession(payload);
    writePersistent(payload);
  }
}

export async function loadConnection(): Promise<ConnectionSettings | null> {
  if (volatileConnection) {
    return { ...volatileConnection };
  }

  // IndexedDB からパスフレーズを自動読み込み
  if (!volatilePassphrase) {
    volatilePassphrase = await loadPassphraseFromStorage();
  }

  const stored = parseStored(readStoredPayload());
  if (!stored) {
    return null;
  }

  const base: ConnectionSettings = {
    baseUrl: stored.meta?.baseUrl ?? "",
    apiKey: stored.apiKey ?? "",
    additionalHeaders: sanitizeHeaders(stored.meta?.additionalHeaders),
    httpProxy: stored.meta?.httpProxy,
    httpsProxy: stored.meta?.httpsProxy,
    storagePolicy: stored.storagePolicy,
    encryptionEnabled: stored.encryptionEnabled,
  };

  if (stored.encryptionEnabled && stored.encryptedKey) {
    if (volatilePassphrase) {
      try {
        const decrypted = await decryptJson<{ apiKey: string }>(
          stored.encryptedKey,
          volatilePassphrase,
        );
        base.apiKey = decrypted.apiKey ?? "";
      } catch {
        base.apiKey = "";
      }
    } else {
      base.apiKey = "";
    }
  }

  return base;
}

export function hasStoredConnection() {
  if (typeof window === "undefined") {
    return { session: false, persistent: false, encrypted: false };
  }

  const stored = parseStored(readStoredPayload());

  return {
    session: !!window.sessionStorage.getItem(SESSION_KEY),
    persistent: !!window.localStorage.getItem(PERSISTENT_KEY),
    encrypted: stored?.encryptionEnabled ?? false,
  };
}

export async function clearConnection() {
  volatileConnection = null;
  volatilePassphrase = null;
  writeSession(null);
  writePersistent(null);
  await savePassphraseToStorage(null);
}
