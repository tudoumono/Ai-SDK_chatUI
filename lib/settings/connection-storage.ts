import {
  decryptJson,
  encryptJson,
  type EncryptedPayload,
} from "@/lib/crypto/aes-gcm";

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

let volatileConnection: ConnectionSettings | null = null;
let volatilePassphrase: string | null = null;

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
  volatilePassphrase = settings.encryptionEnabled
    ? settings.passphrase?.trim() ?? null
    : null;

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
  const stored = parseStored(readStoredPayload());
  if (!stored) {
    return null;
  }

  const base: ConnectionSettings = {
    baseUrl: stored.meta?.baseUrl ?? "",
    apiKey: stored.apiKey ?? "",
    additionalHeaders: stored.meta?.additionalHeaders,
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
    return { session: false, persistent: false };
  }
  return {
    session: !!window.sessionStorage.getItem(SESSION_KEY),
    persistent: !!window.localStorage.getItem(PERSISTENT_KEY),
  };
}

export function clearConnection() {
  volatileConnection = null;
  volatilePassphrase = null;
  writeSession(null);
  writePersistent(null);
}
