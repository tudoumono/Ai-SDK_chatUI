export type HeadersParseResult =
  | { headers: Record<string, string> }
  | { error: string };

const ASCII_REGEX = /^[\x00-\x7F]+$/;
const RESERVED_HEADER_NAMES = new Set([
  "authorization",
  "content-length",
  "host",
  "accept-encoding",
]);

function isAscii(value: string) {
  return ASCII_REGEX.test(value);
}

export function parseAdditionalHeaders(input: string): HeadersParseResult {
  if (!input.trim()) {
    return { headers: {} };
  }

  const lines = input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const headers: Record<string, string> = {};

  for (const line of lines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      return { error: `\"${line}\" にコロン区切りがありません` };
    }

    const name = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!name || !value) {
      return { error: `\"${line}\" のヘッダ名または値が空です` };
    }

    if (!isAscii(name) || !isAscii(value)) {
      return {
        error: `追加ヘッダには ASCII のみ使用できます: \"${line}\"`,
      };
    }

    if (RESERVED_HEADER_NAMES.has(name.toLowerCase())) {
      return {
        error: `\"${name}\" ヘッダは設定済みのため追加できません。`,
      };
    }

    headers[name] = value;
  }

  return { headers };
}

export function sanitizeHeaders(headers?: Record<string, string>) {
  if (!headers) return undefined;
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof key !== "string" || typeof value !== "string") {
      continue;
    }
    if (!isAscii(key) || !isAscii(value)) {
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

export function buildRequestHeaders(
  base: Record<string, string>,
  additional?: Record<string, string>,
): Headers {
  const headers = new Headers();
  const baseEntries = Object.entries(base).filter(
    ([key, value]) => typeof key === "string" && typeof value === "string" && isAscii(key) && isAscii(value),
  );
  baseEntries.forEach(([key, value]) => {
    headers.set(key, value);
  });

  const additionalSanitized = sanitizeHeaders(additional);
  if (additionalSanitized) {
    for (const [key, value] of Object.entries(additionalSanitized)) {
      headers.set(key, value);
    }
  }
  return headers;
}
