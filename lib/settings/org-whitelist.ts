/**
 * Organization ID Whitelist Management
 * 組織IDホワイトリストの管理
 */

export interface OrgWhitelistEntry {
  id: string;
  orgId: string;
  orgName: string;
  addedAt: string;
  addedBy?: string;
  notes?: string;
}

const STORAGE_KEY = "org-whitelist";

/**
 * Load organization whitelist from localStorage
 */
export async function loadOrgWhitelist(): Promise<OrgWhitelistEntry[]> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }
    return JSON.parse(stored);
  } catch (error) {
    console.error("Failed to load org whitelist:", error);
    return [];
  }
}

/**
 * Save organization whitelist to localStorage
 */
export async function saveOrgWhitelist(entries: OrgWhitelistEntry[]): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.error("Failed to save org whitelist:", error);
    throw error;
  }
}

/**
 * Add organization to whitelist
 */
export async function addOrgToWhitelist(
  orgId: string,
  orgName: string,
  notes?: string,
): Promise<OrgWhitelistEntry> {
  const entries = await loadOrgWhitelist();

  // Check if already exists
  if (entries.some((entry) => entry.orgId === orgId)) {
    throw new Error(`Organization ID "${orgId}" is already in the whitelist`);
  }

  const newEntry: OrgWhitelistEntry = {
    id: `org-entry-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    orgId,
    orgName,
    addedAt: new Date().toISOString(),
    notes,
  };

  entries.push(newEntry);
  await saveOrgWhitelist(entries);
  return newEntry;
}

/**
 * Remove organization from whitelist
 */
export async function removeOrgFromWhitelist(id: string): Promise<void> {
  const entries = await loadOrgWhitelist();
  const filtered = entries.filter((entry) => entry.id !== id);
  await saveOrgWhitelist(filtered);
}

/**
 * Update organization in whitelist
 */
export async function updateOrgInWhitelist(
  id: string,
  updates: Partial<Pick<OrgWhitelistEntry, "orgName" | "notes">>,
): Promise<OrgWhitelistEntry> {
  const entries = await loadOrgWhitelist();
  const index = entries.findIndex((entry) => entry.id === id);

  if (index === -1) {
    throw new Error(`Organization entry with ID "${id}" not found`);
  }

  entries[index] = {
    ...entries[index],
    ...updates,
  };

  await saveOrgWhitelist(entries);
  return entries[index];
}

/**
 * Check if organization ID is in whitelist
 */
export async function isOrgInWhitelist(orgId: string): Promise<boolean> {
  const entries = await loadOrgWhitelist();
  return entries.some((entry) => entry.orgId === orgId);
}

/**
 * Get all organization IDs from whitelist
 */
export async function getWhitelistedOrgIds(): Promise<string[]> {
  const entries = await loadOrgWhitelist();
  return entries.map((entry) => entry.orgId);
}
