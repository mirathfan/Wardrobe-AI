import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type SafeFetchExpectedKind = "image" | "audio" | "html" | "json";

export class SafeFetchError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "invalid_url"
      | "unsafe_url"
      | "fetch_failed"
      | "too_large"
      | "unsupported_format"
      | "too_many_redirects",
  ) {
    super(message);
  }
}

export type SafeFetchResult = {
  finalUrl: URL;
  status: number;
  ok: boolean;
  headers: Headers;
  contentType: string;
  bytes: Buffer;
  text: string;
};

type SafeFetchOptions = {
  expectedKind: SafeFetchExpectedKind;
  headers?: HeadersInit;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
};

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_REDIRECTS = 3;
const MAX_BYTES_BY_KIND: Record<SafeFetchExpectedKind, number> = {
  image: 10 * 1024 * 1024,
  audio: 10 * 1024 * 1024,
  html: 3 * 1024 * 1024,
  json: 2 * 1024 * 1024,
};

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

export function isPrivateOrInternalIp(address: string) {
  const value = address.toLowerCase();
  const version = isIP(value);
  if (version === 4) return isPrivateIpv4(value);
  if (version !== 6) return false;
  if (value === "::" || value === "::1") return true;

  const mappedIpv4 = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4);

  const firstPart = value.split(":").find((part) => part.length > 0);
  const firstHextet = firstPart ? Number.parseInt(firstPart, 16) : 0;
  if (!Number.isFinite(firstHextet)) return true;
  if (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) return true;
  if (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) return true;
  return false;
}

export function redactUrlForLogs(rawUrl: string | URL | null | undefined) {
  const raw = String(rawUrl ?? "").trim();
  if (!raw) return null;
  try {
    const url = rawUrl instanceof URL ? new URL(rawUrl.toString()) : new URL(raw);
    const path = url.pathname.length > 120 ? `${url.pathname.slice(0, 117)}...` : url.pathname;
    return `${url.protocol}//${url.host}${path}${url.search ? "?[redacted]" : ""}`;
  } catch {
    return raw.length > 160 ? `${raw.slice(0, 157)}...` : raw;
  }
}

function isAllowedContentType(contentType: string, expectedKind: SafeFetchExpectedKind) {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!normalized) return false;
  if (expectedKind === "image") return normalized.startsWith("image/");
  if (expectedKind === "audio") return normalized.startsWith("audio/") || normalized === "video/mp4";
  if (expectedKind === "html") {
    return normalized === "text/html" || normalized === "application/xhtml+xml";
  }
  return normalized === "application/json" || normalized.endsWith("+json") || normalized === "text/plain";
}

export async function validateSafeUrlForFetch(rawUrl: string | URL): Promise<URL> {
  let parsed: URL;
  try {
    parsed = rawUrl instanceof URL ? new URL(rawUrl.toString()) : new URL(String(rawUrl));
  } catch {
    throw new SafeFetchError("Invalid URL.", "invalid_url");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SafeFetchError("Only http and https URLs are supported.", "invalid_url");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new SafeFetchError("URL host is not safe to fetch.", "unsafe_url");
  }

  if (isIP(hostname)) {
    if (isPrivateOrInternalIp(hostname)) {
      throw new SafeFetchError("URL host is not safe to fetch.", "unsafe_url");
    }
  } else {
    const addresses = await lookup(hostname, { all: true, verbatim: true }).catch(() => []);
    if (!addresses.length) {
      throw new SafeFetchError("Could not resolve URL host.", "fetch_failed");
    }
    if (addresses.some((entry) => isPrivateOrInternalIp(entry.address))) {
      throw new SafeFetchError("URL host resolves to an unsafe address.", "unsafe_url");
    }
  }

  parsed.hash = "";
  return parsed;
}

async function readResponseBytes(response: Response, maxBytes: number) {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new SafeFetchError("Response is too large.", "too_large");
  }

  if (!response.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    let doneReading = false;
    while (!doneReading) {
      const { done, value } = await reader.read();
      if (done) {
        doneReading = true;
        continue;
      }
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) {
        throw new SafeFetchError("Response is too large.", "too_large");
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

export async function safeFetch(rawUrl: string | URL, options: SafeFetchOptions): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_BYTES_BY_KIND[options.expectedKind];
  let currentUrl = await validateSafeUrlForFetch(rawUrl);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(currentUrl.toString(), {
        headers: options.headers,
        redirect: "manual",
        signal: controller.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new SafeFetchError("Redirect response did not include a location.", "fetch_failed");
        }
        if (redirectCount >= maxRedirects) {
          throw new SafeFetchError("URL redirected too many times.", "too_many_redirects");
        }
        currentUrl = await validateSafeUrlForFetch(new URL(location, currentUrl));
        continue;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (response.ok && !isAllowedContentType(contentType, options.expectedKind)) {
        throw new SafeFetchError("URL returned an unsupported content type.", "unsupported_format");
      }

      const bytes = await readResponseBytes(response, maxBytes);
      return {
        finalUrl: currentUrl,
        status: response.status,
        ok: response.ok,
        headers: response.headers,
        contentType,
        bytes,
        text: bytes.toString("utf8"),
      };
    } catch (error) {
      if (error instanceof SafeFetchError) throw error;
      throw new SafeFetchError("Could not fetch URL.", "fetch_failed");
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new SafeFetchError("URL redirected too many times.", "too_many_redirects");
}
