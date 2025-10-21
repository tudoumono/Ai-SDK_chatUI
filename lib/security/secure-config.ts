import type { OrgWhitelistEntry } from "@/lib/settings/org-whitelist";
import { isTauriEnvironment } from "@/lib/utils/tauri-helpers";

export type SecureConfigPayload = {
  version?: number;
  orgWhitelist?: Array<Partial<OrgWhitelistEntry> & { orgId: string; orgName: string }>;
  adminPasswordHash?: string | null;
  signature?: string | null;
};

export async function loadSecureConfig(): Promise<SecureConfigPayload | null> {
  if (!isTauriEnvironment()) {
    return null;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const response = await invoke<SecureConfigPayload | null>("load_secure_config");
    if (!response) {
      return null;
    }
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

  const config = await loadSecureConfig();
  if (!config) {
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
}
