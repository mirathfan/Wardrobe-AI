#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PROJECT_ID = "closet-app-57146";
const DATABASE = "(default)";
const FIREBASE_CLIENT_ID = String(process.env.FIREBASE_CLIENT_ID ?? "").trim();
const FIREBASE_CLIENT_SECRET = String(process.env.FIREBASE_CLIENT_SECRET ?? "").trim();
const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

function parseArgs(argv) {
  const args = {
    uid: "",
    dryRun: false,
    limit: null,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (value === "--uid") {
      args.uid = String(argv[index + 1] ?? "").trim();
      index += 1;
      continue;
    }
    if (value === "--limit") {
      const raw = Number(argv[index + 1] ?? "");
      args.limit = Number.isFinite(raw) && raw > 0 ? raw : null;
      index += 1;
    }
  }

  if (!args.uid) {
    throw new Error("Missing required --uid");
  }

  return args;
}

function configStorePath() {
  return path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
}

async function loadFirebaseAccessToken() {
  if (!FIREBASE_CLIENT_ID || !FIREBASE_CLIENT_SECRET) {
    throw new Error("Missing FIREBASE_CLIENT_ID or FIREBASE_CLIENT_SECRET environment variable.");
  }

  const raw = await readFile(configStorePath(), "utf8");
  const parsed = JSON.parse(raw);
  const refreshToken = String(parsed?.tokens?.refresh_token ?? "").trim();
  if (!refreshToken) {
    throw new Error("Missing Firebase CLI refresh token. Run `firebase login` first.");
  }

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: FIREBASE_CLIENT_ID,
    client_secret: FIREBASE_CLIENT_SECRET,
    grant_type: "refresh_token",
    scope: FIRESTORE_SCOPE,
  });
  const response = await fetch("https://www.googleapis.com/oauth2/v3/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Could not mint Google access token: ${text}`);
  }
  const payload = await response.json();
  const accessToken = String(payload?.access_token ?? "").trim();
  if (!accessToken) {
    throw new Error("Google access token response was missing access_token.");
  }
  return accessToken;
}

async function firestoreRequest(accessToken, url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore request failed (${response.status}): ${text}`);
  }

  return response;
}

function documentBaseUrl(uid) {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE}/documents/users/${uid}/items`;
}

function decodeValue(value) {
  if (value === undefined || value === null) return null;
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) {
    return (value.arrayValue.values ?? []).map(decodeValue);
  }
  if ("mapValue" in value) {
    const result = {};
    for (const [key, fieldValue] of Object.entries(value.mapValue.fields ?? {})) {
      result[key] = decodeValue(fieldValue);
    }
    return result;
  }
  return null;
}

function decodeDocument(document) {
  const result = {
    id: String(document.name ?? "").split("/").pop() ?? "",
  };
  for (const [key, value] of Object.entries(document.fields ?? {})) {
    result[key] = decodeValue(value);
  }
  return result;
}

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((entry) => encodeValue(entry)),
      },
    };
  }
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { nullValue: null };
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (typeof value === "object") {
    const fields = {};
    for (const [key, entry] of Object.entries(value)) {
      fields[key] = encodeValue(entry);
    }
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function encodePatch(update) {
  const fields = {};
  for (const [key, value] of Object.entries(update)) {
    fields[key] = encodeValue(value);
  }
  return { fields };
}

function setPath(target, pathValue, value) {
  const parts = pathValue.split(".");
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    cursor[key] = cursor[key] && typeof cursor[key] === "object" ? cursor[key] : {};
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
}

function getPath(source, pathValue) {
  const parts = pathValue.split(".");
  let cursor = source;
  for (const key of parts) {
    if (!cursor || typeof cursor !== "object" || !(key in cursor)) return undefined;
    cursor = cursor[key];
  }
  return cursor;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

function isValidUrl(value) {
  const url = String(value ?? "").trim();
  return Boolean(url && (/^https?:\/\//i.test(url) || url.startsWith("file://")));
}

function normalizeImageEntry(entry, fallbackPrimary = false) {
  if (!entry || typeof entry !== "object") return null;
  const originalUrl = String(entry.originalUrl ?? entry.url ?? "").trim();
  if (!isValidUrl(originalUrl)) return null;
  const cleanedUrl = String(entry.cleanedUrl ?? "").trim();
  return {
    originalUrl,
    ...(isValidUrl(cleanedUrl) ? { cleanedUrl } : {}),
    isPrimary: Boolean(entry.isPrimary ?? fallbackPrimary),
  };
}

function uniqueUrls(values) {
  const seen = new Set();
  const next = [];
  for (const value of values) {
    const url = String(value ?? "").trim();
    if (!isValidUrl(url) || seen.has(url)) continue;
    seen.add(url);
    next.push(url);
  }
  return next;
}

function buildCanonicalImages(item) {
  const existingEntries = [
    ...(Array.isArray(item.images) ? item.images : []),
    ...(Array.isArray(item.photos?.images) ? item.photos.images : []),
  ]
    .map((entry) => normalizeImageEntry(entry))
    .filter(Boolean);

  const originalPrimaryCandidates = [
    String(item.originalImageUrl ?? "").trim(),
    String(item.photos?.originalUrl ?? "").trim(),
  ].filter(isValidUrl);
  const displayPrimaryCandidates = [
    String(item.photos?.primaryUrl ?? "").trim(),
    String(item.photoUrl ?? "").trim(),
  ].filter(isValidUrl);
  const primaryCandidates =
    originalPrimaryCandidates.length > 0 ? originalPrimaryCandidates : displayPrimaryCandidates;
  const orderedUrls = uniqueUrls([
    ...primaryCandidates,
    ...existingEntries.map((entry) => entry.originalUrl),
    ...(Array.isArray(item.imageUrls) ? item.imageUrls : []),
    ...(Array.isArray(item.photos?.urls) ? item.photos.urls : []),
  ]);

  const preferredPrimary =
    existingEntries.find((entry) => entry.isPrimary)?.originalUrl ??
    primaryCandidates[0] ??
    orderedUrls[0] ??
    null;

  const cleanedPrimary =
    String(item.cleanedImageUrl ?? item.photos?.cleanedUrl ?? item.photos?.cleanedPhotoUrl ?? "").trim() ||
    null;

  const entryMap = new Map();
  for (const entry of existingEntries) {
    const current = entryMap.get(entry.originalUrl) ?? {
      originalUrl: entry.originalUrl,
      cleanedUrl: null,
      isPrimary: false,
    };
    current.cleanedUrl = current.cleanedUrl || entry.cleanedUrl || null;
    current.isPrimary = current.isPrimary || Boolean(entry.isPrimary);
    entryMap.set(entry.originalUrl, current);
  }

  for (const url of orderedUrls) {
    if (!entryMap.has(url)) {
      entryMap.set(url, {
        originalUrl: url,
        cleanedUrl: null,
        isPrimary: url === preferredPrimary,
      });
    }
  }

  const canonicalImages = orderedUrls.map((url, index) => {
    const entry = entryMap.get(url);
    const isPrimary = url === preferredPrimary || (!preferredPrimary && index === 0);
    return {
      originalUrl: entry.originalUrl,
      ...(isPrimary && isValidUrl(cleanedPrimary)
        ? { cleanedUrl: cleanedPrimary }
        : isValidUrl(entry.cleanedUrl)
          ? { cleanedUrl: entry.cleanedUrl }
          : {}),
      isPrimary,
    };
  });

  return {
    images: canonicalImages,
    primaryOriginalUrl: canonicalImages[0]?.originalUrl ?? null,
    primaryDisplayUrl:
      String(item.photoUrl ?? item.photos?.primaryUrl ?? "").trim() ||
      (isValidUrl(cleanedPrimary) ? cleanedPrimary : canonicalImages[0]?.originalUrl ?? null),
    cleanedPrimaryUrl: isValidUrl(cleanedPrimary) ? cleanedPrimary : null,
    normalizedUrl:
      String(item.photos?.normalizedUrl ?? item.normalizedUrl ?? item.photos?.previewUrl ?? "").trim() || null,
  };
}

function getVisualNormalizationDefaults(item) {
  const joined = `${normalizeText(item.category)} ${normalizeText(item.subCategory)} ${normalizeText(item.type)}`;

  if (joined.includes("shirt") || joined.includes("polo")) {
    return { recommendedScale: 1.01, recommendedTranslateY: 5, anchor: "top" };
  }
  if (joined.includes("blouse")) {
    return { recommendedScale: 1.0, recommendedTranslateY: 5, anchor: "top" };
  }
  if (joined.includes("tee") || joined.includes("t-shirt")) {
    return { recommendedScale: 0.99, recommendedTranslateY: 4, anchor: "top" };
  }
  if (
    joined.includes("jacket") ||
    joined.includes("coat") ||
    joined.includes("overshirt") ||
    joined.includes("hoodie")
  ) {
    return { recommendedScale: 1.02, recommendedTranslateY: 2, anchor: "top" };
  }
  if (joined.includes("pants") || joined.includes("jeans") || joined.includes("trousers")) {
    return { recommendedScale: 1.0, recommendedTranslateY: 1, anchor: "waist" };
  }
  if (joined.includes("shoe") || joined.includes("sneaker") || joined.includes("boot")) {
    return { recommendedScale: 0.94, recommendedTranslateY: 2, anchor: "foot" };
  }
  return { recommendedScale: 0.96, recommendedTranslateY: 0, anchor: "center" };
}

function isTopLikeItem(item) {
  const joined = `${normalizeText(item.category)} ${normalizeText(item.subCategory)} ${normalizeText(item.type)}`;
  return /shirt|polo|blouse|tee|t-shirt|top|crop top|sweater|overshirt|hoodie|jacket|coat|outerwear/.test(
    joined
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sanitizeVisualNormalization(item) {
  const current = item.visualNormalization;
  if (!current || typeof current !== "object") {
    return null;
  }

  const defaults = getVisualNormalizationDefaults(item);
  const next = {
    ...current,
    recommendedScale:
      typeof current.recommendedScale === "number"
        ? clamp(current.recommendedScale, defaults.recommendedScale - 0.04, defaults.recommendedScale + 0.04)
        : defaults.recommendedScale,
    recommendedTranslateY:
      typeof current.recommendedTranslateY === "number"
        ? Math.round(clamp(current.recommendedTranslateY, defaults.recommendedTranslateY - 3, defaults.recommendedTranslateY + 3))
        : defaults.recommendedTranslateY,
    anchor: current.anchor ?? defaults.anchor,
  };

  if (current.contentBounds && typeof current.contentBounds === "object" && isTopLikeItem(item)) {
    next.contentBounds = {
      ...current.contentBounds,
      widthPct:
        typeof current.contentBounds.widthPct === "number"
          ? Number(clamp(current.contentBounds.widthPct, 72, 80).toFixed(2))
          : current.contentBounds.widthPct,
      heightPct:
        typeof current.contentBounds.heightPct === "number"
          ? Number(clamp(current.contentBounds.heightPct, 74, 84).toFixed(2))
          : current.contentBounds.heightPct,
    };
    next.contentWidthPct =
      typeof next.contentBounds.widthPct === "number" ? next.contentBounds.widthPct : current.contentWidthPct;
    next.contentHeightPct =
      typeof next.contentBounds.heightPct === "number" ? next.contentBounds.heightPct : current.contentHeightPct;
  }

  return next;
}

function buildUpdate(item) {
  const next = {};
  const canonicalImages = buildCanonicalImages(item);
  const nextImageUrls = canonicalImages.images.map((entry) => entry.originalUrl);

  const desired = {
    images: canonicalImages.images,
    imageUrls: nextImageUrls,
    originalImageUrl: canonicalImages.primaryOriginalUrl,
    photoUrl: canonicalImages.primaryDisplayUrl,
    cleanedImageUrl: canonicalImages.cleanedPrimaryUrl,
    "photos.images": canonicalImages.images,
    "photos.urls": nextImageUrls,
    "photos.originalUrl": canonicalImages.primaryOriginalUrl,
    "photos.primaryUrl": canonicalImages.primaryDisplayUrl,
    "photos.cleanedUrl": canonicalImages.cleanedPrimaryUrl,
    "photos.cleanedPhotoUrl": canonicalImages.cleanedPrimaryUrl,
  };

  if (canonicalImages.normalizedUrl) {
    desired["photos.normalizedUrl"] = canonicalImages.normalizedUrl;
  }

  const normalizedVisual = sanitizeVisualNormalization(item);
  if (normalizedVisual) {
    desired.visualNormalization = normalizedVisual;
  }

  for (const [pathValue, value] of Object.entries(desired)) {
    if (!deepEqual(getPath(item, pathValue), value)) {
      setPath(next, pathValue, value);
    }
  }

  return next;
}

async function listItems(accessToken, uid) {
  let nextPageToken = null;
  const documents = [];

  do {
    const params = new URLSearchParams();
    params.set("pageSize", "200");
    if (nextPageToken) params.set("pageToken", nextPageToken);
    const response = await firestoreRequest(
      accessToken,
      `${documentBaseUrl(uid)}?${params.toString()}`
    );
    const payload = await response.json();
    documents.push(...(payload.documents ?? []));
    nextPageToken = payload.nextPageToken ?? null;
  } while (nextPageToken);

  return documents.map(decodeDocument);
}

async function patchItem(accessToken, uid, itemId, update) {
  const updateMask = [];

  function flatten(prefix, value) {
    for (const [key, entry] of Object.entries(value)) {
      const pathValue = prefix ? `${prefix}.${key}` : key;
      updateMask.push(pathValue);
      if (entry && typeof entry === "object" && !Array.isArray(entry) && !(entry instanceof Date)) {
        flatten(pathValue, entry);
      }
    }
  }

  updateMask.length = 0;
  function collectPaths(prefix, value) {
    for (const [key, entry] of Object.entries(value)) {
      const pathValue = prefix ? `${prefix}.${key}` : key;
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        collectPaths(pathValue, entry);
      } else {
        updateMask.push(pathValue);
      }
    }
  }
  collectPaths("", update);

  const params = new URLSearchParams();
  for (const pathValue of updateMask) {
    params.append("updateMask.fieldPaths", pathValue);
  }

  await firestoreRequest(accessToken, `${documentBaseUrl(uid)}/${itemId}?${params.toString()}`, {
    method: "PATCH",
    body: JSON.stringify(encodePatch(update)),
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const accessToken = await loadFirebaseAccessToken();
  const allItems = await listItems(accessToken, args.uid);
  const items = allItems
    .filter((item) => item.isDraft !== true)
    .slice(0, args.limit ?? undefined);

  let checked = 0;
  let changed = 0;
  const samples = [];

  for (const item of items) {
    checked += 1;
    const update = buildUpdate(item);
    if (!Object.keys(update).length) continue;
    changed += 1;
    if (samples.length < 10) {
      samples.push({
        itemId: item.id,
        name: item.name ?? item.brand ?? item.category ?? "Untitled",
        keys: Object.keys(update),
        imageCountBefore: Array.isArray(item.images) ? item.images.length : Array.isArray(item.photos?.images) ? item.photos.images.length : 0,
        imageCountAfter: Array.isArray(update.images) ? update.images.length : Array.isArray(update.photos?.images) ? update.photos.images.length : null,
      });
    }
    if (!args.dryRun) {
      await patchItem(accessToken, args.uid, item.id, update);
    }
  }

  console.log(
    JSON.stringify(
      {
        uid: args.uid,
        dryRun: args.dryRun,
        checked,
        changed,
        samples,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exit(1);
});
