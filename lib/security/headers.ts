const STRICT_FORBIDDEN_HEADERS = [
  "authorization",
  "proxy-authorization",
  "content-length",
  "connection",
  "host",
  "transfer-encoding",
  "te",
  "keep-alive",
  "upgrade",
  "expect",
] as const;

const FORBIDDEN_HEADER_PREFIXES = ["sec-", "proxy-"] as const;

export type HeaderName = string;

export function normalizeHeaderName(name: HeaderName): string {
  return name.trim().toLowerCase();
}

export function isForbiddenHeaderName(name: HeaderName): boolean {
  if (!name) return true;
  const normalized = normalizeHeaderName(name);
  if (!normalized) return true;

  if (STRICT_FORBIDDEN_HEADERS.includes(normalized as typeof STRICT_FORBIDDEN_HEADERS[number])) {
    return true;
  }

  return FORBIDDEN_HEADER_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  );
}

export function filterForbiddenHeaders<T extends Record<string, string> | undefined>(
  headers: T,
  onBlocked?: (name: string) => void,
): Record<string, string> | undefined {
  if (!headers) return undefined;

  const safeEntries = Object.entries(headers).reduce<
    Array<[string, string]>
  >((acc, [key, value]) => {
    if (!isForbiddenHeaderName(key)) {
      acc.push([key, value]);
      return acc;
    }
    onBlocked?.(key);
    return acc;
  }, []);

  if (safeEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(safeEntries);
}
