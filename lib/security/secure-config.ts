import type { OrgWhitelistEntry } from "@/lib/settings/org-whitelist";
import { isTauriEnvironment } from "@/lib/utils/tauri-helpers";
import {
  applyFeatureRestrictionsFromSecureConfig,
  type FeatureRestrictionsInput,
} from "@/lib/settings/feature-restrictions";

export type SecureConfigPayload = {
  version?: number;
  orgWhitelist?: Array<Partial<OrgWhitelistEntry> & { orgId: string; orgName: string }>;
  adminPasswordHash?: string | null;
  features?: SecureFeatureRestrictions | null;
  signature?: string | null;
};

export type SecureFeatureRestrictions = FeatureRestrictionsInput;

export type SecureConfigSearchPath = {
  path: string;
  label: string;
};

type SecureConfigLoadResult = {
  config: SecureConfigPayload | null;
  path: string | null;
  searchedPaths?: SecureConfigSearchPath[];
};

const SECURE_CONFIG_PATH_KEY = "secure-config:last-path";
const SECURE_CONFIG_STATUS_KEY = "secure-config:last-status";
const SECURE_CONFIG_SEARCHED_PATHS_KEY = "secure-config:last-searched";

type SecureConfigStatus = "applied" | "missing" | "error" | "unsupported" | "none";

function recordSecureConfigStatus(
  path: string | null,
  status: SecureConfigStatus,
  searchedPaths: SecureConfigSearchPath[] = [],
) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (path) {
      window.localStorage.setItem(SECURE_CONFIG_PATH_KEY, path);
    } else {
      window.localStorage.removeItem(SECURE_CONFIG_PATH_KEY);
    }
    window.localStorage.setItem(SECURE_CONFIG_STATUS_KEY, status);
    if (searchedPaths.length > 0) {
      window.localStorage.setItem(SECURE_CONFIG_SEARCHED_PATHS_KEY, JSON.stringify(searchedPaths));
    } else {
      window.localStorage.removeItem(SECURE_CONFIG_SEARCHED_PATHS_KEY);
    }
  } catch (error) {
    console.warn("[SecureConfig] Failed to record status:", error);
  }
}

export function getSecureConfigStatus():
  | { path: string | null; status: SecureConfigStatus; searchedPaths: SecureConfigSearchPath[] }
  | null {
  if (!isTauriEnvironment()) {
    return { path: null, status: "unsupported", searchedPaths: [] };
  }
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const path = window.localStorage.getItem(SECURE_CONFIG_PATH_KEY);
    const status =
      (window.localStorage.getItem(SECURE_CONFIG_STATUS_KEY) as SecureConfigStatus | null) ?? "none";
    const rawPaths = window.localStorage.getItem(SECURE_CONFIG_SEARCHED_PATHS_KEY);
    const searchedPaths: SecureConfigSearchPath[] = rawPaths
      ? (() => {
          try {
            const parsed = JSON.parse(rawPaths);
            if (Array.isArray(parsed)) {
              return parsed.filter((item) => typeof item?.path === "string" && typeof item?.label === "string");
            }
          } catch (error) {
            console.warn("[SecureConfig] Failed to parse cached search paths:", error);
          }
          return [];
        })()
      : [];

    return { path, status, searchedPaths };
  } catch {
    return null;
  }
}

export async function loadSecureConfig(): Promise<SecureConfigLoadResult | null> {
  if (!isTauriEnvironment()) {
    return null;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const response = await invoke<SecureConfigLoadResult>("load_secure_config");
    return response;
  } catch (error) {
    console.error("[SecureConfig] Failed to load secure config:", error);
    return null;
  }
}

function normalizeWhitelistEntries(entries: SecureConfigPayload["orgWhitelist"]): OrgWhitelistEntry[] {
  if (!entries || entries.length === 0) {
    return [];
  }

  return entries
    .filter((entry) => Boolean(entry?.orgId) && Boolean(entry?.orgName))
    .map((entry, index) => {
      const orgId = (entry?.orgId ?? "").trim();
      const orgName = (entry?.orgName ?? "").trim();
      const fallbackId = entry?.id ?? `org-entry-${orgId || index}`;

      return {
        id: fallbackId,
        orgId,
        orgName,
        addedAt: entry?.addedAt ?? new Date().toISOString(),
        addedBy: entry?.addedBy ?? "secure-config",
        notes: entry?.notes,
      } satisfies OrgWhitelistEntry;
    });
}

export async function bootstrapSecureConfig(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const result = await loadSecureConfig();
    if (!result) {
      recordSecureConfigStatus(
        null,
        isTauriEnvironment() ? "missing" : "unsupported",
        [],
      );
      return;
    }
    const { config, path, searchedPaths = [] } = result;
    if (config) {
      recordSecureConfigStatus(path ?? null, "applied", searchedPaths);
    } else {
      recordSecureConfigStatus(path ?? null, "missing", searchedPaths);
      return;
    }

    const whitelistEntries = normalizeWhitelistEntries(config.orgWhitelist);
    if (whitelistEntries.length > 0) {
      try {
        localStorage.setItem("org-whitelist", JSON.stringify(whitelistEntries));
        localStorage.setItem("org-whitelist:managed-by-secure-config", "true");
      } catch (error) {
        console.warn("[SecureConfig] Failed to persist whitelist to localStorage:", error);
      }
    }

    if (config.adminPasswordHash) {
      try {
        localStorage.setItem("admin-password-hash", config.adminPasswordHash);
        localStorage.setItem("admin-password:managed-by-secure-config", "true");
      } catch (error) {
        console.warn("[SecureConfig] Failed to persist admin password hash:", error);
      }
    }

    if (config.features) {
      try {
        applyFeatureRestrictionsFromSecureConfig(config.features);
      } catch (error) {
        console.warn("[SecureConfig] Failed to apply feature restrictions:", error);
      }
    }
  } catch (error) {
    console.warn("[SecureConfig] bootstrap error:", error);
    recordSecureConfigStatus(null, "error");
  }
}
