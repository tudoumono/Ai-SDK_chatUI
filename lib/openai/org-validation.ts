/**
 * Organization ID Validation for OpenAI API Keys
 * OpenAI API キーの組織ID検証
 */

import { getWhitelistedOrgIds } from "@/lib/settings/org-whitelist";
import { normalizeBaseUrl } from "@/lib/security/base-url";

export interface OrgValidationResult {
  valid: boolean;
  orgIds: string[];
  matchedOrgId?: string;
  error?: string;
}

/**
 * Fetch organization information from OpenAI API /v1/me endpoint
 */
export async function fetchOrgInfo(
  apiKey: string,
  baseUrl: string = "https://api.openai.com/v1",
): Promise<{ orgIds: string[]; error?: string }> {
  try {
    const endpoint = `${normalizeBaseUrl(baseUrl)}/me`;
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        orgIds: [],
        error: `Failed to fetch organization info: HTTP ${response.status}`,
      };
    }

    const data = await response.json();

    // Extract organization IDs from response
    // Response format: { orgs: { data: [{ id: "org-xxx", ... }, ...] } }
    const orgs = data?.orgs?.data || [];
    const orgIds = orgs.map((org: { id: string }) => org.id).filter(Boolean);

    return { orgIds };
  } catch (error) {
    return {
      orgIds: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Validate if API key belongs to whitelisted organization
 */
export async function validateOrgWhitelist(
  apiKey: string,
  baseUrl: string = "https://api.openai.com/v1",
): Promise<OrgValidationResult> {
  // Fetch organization IDs from API
  const { orgIds, error } = await fetchOrgInfo(apiKey, baseUrl);

  if (error) {
    return {
      valid: false,
      orgIds: [],
      error,
    };
  }

  if (orgIds.length === 0) {
    return {
      valid: false,
      orgIds: [],
      error: "No organization found for this API key",
    };
  }

  // Get whitelisted organization IDs
  const whitelistedOrgIds = await getWhitelistedOrgIds();

  // If whitelist is empty, allow all (whitelist feature not configured)
  if (whitelistedOrgIds.length === 0) {
    return {
      valid: true,
      orgIds,
    };
  }

  // Check if any of the API key's orgs are in the whitelist
  const matchedOrgId = orgIds.find((orgId) => whitelistedOrgIds.includes(orgId));

  if (matchedOrgId) {
    return {
      valid: true,
      orgIds,
      matchedOrgId,
    };
  }

  return {
    valid: false,
    orgIds,
    error: `This API key belongs to organizations [${orgIds.join(", ")}], which are not in the whitelist. Please use a company-provided API key.`,
  };
}
