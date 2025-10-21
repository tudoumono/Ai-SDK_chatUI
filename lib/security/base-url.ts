const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_ALLOWED_HOSTS = ["api.openai.com"] as const;

function readAllowedHostsFromEnv(): string[] {
  if (typeof process === "undefined") {
    return [];
  }
  const raw = process.env.NEXT_PUBLIC_ALLOWED_OPENAI_HOSTS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

const allowedHostsCache = new Set(
  [...DEFAULT_ALLOWED_HOSTS, ...readAllowedHostsFromEnv()].map((value) =>
    value.toLowerCase(),
  ),
);

export function getAllowedHosts(): string[] {
  return Array.from(allowedHostsCache);
}

export type BaseUrlValidationResult =
  | { ok: true; normalized: string }
  | { ok: false; message: string };

function buildNormalizedUrl(url: URL): string {
  const pathname = url.pathname.replace(/\/+$/, "");
  const normalizedPath =
    pathname === "" || pathname === "/" ? "" : pathname;
  return `${url.origin}${normalizedPath}`;
}

function isAllowedHost(hostname: string): boolean {
  return allowedHostsCache.has(hostname.toLowerCase());
}

export function validateBaseUrl(baseUrl: string): BaseUrlValidationResult {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return {
      ok: false,
      message: "ベースURLを入力してください。",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      message: "ベースURLの形式が正しくありません。",
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      message: "認証情報付きのURLは使用できません。",
    };
  }

  if (parsed.protocol !== "https:") {
    return {
      ok: false,
      message: "セキュリティのため HTTPS のURLのみ使用できます。",
    };
  }

  if (!parsed.hostname) {
    return {
      ok: false,
      message: "ホスト名を含む URL を指定してください。",
    };
  }

  if (!isAllowedHost(parsed.hostname)) {
    return {
      ok: false,
      message: `このホストには接続できません。許可済みホスト: ${getAllowedHosts().join(", ")}`,
    };
  }

  if (parsed.search || parsed.hash) {
    return {
      ok: false,
      message: "クエリ文字列やフラグメントを含むURLは使用できません。",
    };
  }

  return {
    ok: true,
    normalized: buildNormalizedUrl(parsed),
  };
}

export function normalizeBaseUrl(baseUrl: string | undefined): string {
  const trimmed = (baseUrl ?? "").trim();
  if (!trimmed) {
    return DEFAULT_BASE_URL;
  }

  const result = validateBaseUrl(trimmed);
  if (!result.ok) {
    throw new Error(result.message);
  }

  return result.normalized;
}
