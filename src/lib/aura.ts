import { getFunctions, httpsCallable } from "firebase/functions";
import { Alert, Platform } from "react-native";

import { auth, app } from "@/src/lib/firebase";
import { getFriendlyErrorMessage, isRateLimitError } from "@/src/lib/errors";
import type { AuraResponse } from "@/src/types/aura";
import type { ChatAttachment } from "@/src/components/ai/chatTypes";

export type ClientProductLinkPreview = {
  sourceUrl: string;
  title?: string | null;
  imageUrl?: string | null;
  imageUrls?: string[];
  description?: string | null;
  brand?: string | null;
  category?: string | null;
  subCategory?: string | null;
  color?: string | null;
  price?: string | null;
  currency?: string | null;
  priceAmount?: number | null;
  priceCurrency?: string | null;
  priceDisplay?: string | null;
  sku?: string | null;
  productId?: string | null;
};

type AskAuraArgs = {
  message: string;
  chatId?: string | null;
  attachments?: ChatAttachment[];
  history?: {
    role: "user" | "assistant";
    text: string;
  }[];
  selectedDate?: string | null;
  occasion?: string | null;
  weather?: {
    tempF?: number | null;
    condition?: string | null;
  } | null;
  clientIntent?: string | null;
  linkPreview?: ClientProductLinkPreview | null;
  clientContext?: {
    minimumCloset?: {
      itemCount: number;
      styleCoreProgress: string;
      nextBestAdd: string | null;
      outfitRange: number;
      nudge: string;
      tone: string;
    };
    outfitDiversity?: {
      shouldAvoidRepeats: boolean;
      reason: "followup" | "multi_look" | "none";
      recentItemIds: string[];
      previousLookItemIds: string[];
      excludedItemIds: string[];
      previousLookSignatures: string[];
      maxOverlap: number;
    };
    requiredItemIds?: string[];
  };
};

const URL_RE = /(?:https?:\/\/|www\d*\.)[^\s<>"']+/i;
const LINK_PREVIEW_TIMEOUT_MS = 9000;
const ENABLE_CLIENT_LINK_PREVIEW =
  process.env.EXPO_PUBLIC_AURA_CLIENT_LINK_PREVIEW === "1" ||
  (Platform.OS !== "web" && process.env.EXPO_PUBLIC_AURA_CLIENT_LINK_PREVIEW !== "0");
const DEBUG_AURA_CLIENT = __DEV__ && process.env.EXPO_PUBLIC_AURA_DEBUG === "1";
const AURA_STREAM_TIMEOUT_MS = 45_000;
const AURA_STREAM_WITH_IMAGE_TIMEOUT_MS = 90_000;

function alertCallableError(error: unknown) {
  if (__DEV__) console.log("[callable error]", error);
  Alert.alert("Hold on", getFriendlyErrorMessage(error));
}

function sanitizeUserInput(input: string): string {
  return input
    .trim()
    .replace(/\0/g, "")
    .slice(0, 2000)
    .replace(/ignore previous instructions/gi, "")
    .replace(/forget everything/gi, "")
    .replace(/you are now/gi, "")
    .replace(/system:/gi, "")
    .replace(/assistant:/gi, "");
}

function sanitizeAuraArgs(args: AskAuraArgs): AskAuraArgs {
  return {
    ...args,
    message: sanitizeUserInput(args.message),
    history: args.history?.map((entry) => ({
      ...entry,
      text: sanitizeUserInput(entry.text),
    })),
    occasion: args.occasion ? sanitizeUserInput(args.occasion).slice(0, 120) : args.occasion,
    clientIntent: args.clientIntent ? sanitizeUserInput(args.clientIntent).slice(0, 120) : args.clientIntent,
    linkPreview: args.linkPreview
      ? {
          ...args.linkPreview,
          title: args.linkPreview.title ? sanitizeUserInput(args.linkPreview.title).slice(0, 220) : args.linkPreview.title,
          description: args.linkPreview.description
            ? sanitizeUserInput(args.linkPreview.description).slice(0, 500)
            : args.linkPreview.description,
        }
      : args.linkPreview,
    clientContext: args.clientContext,
  };
}

function normalizeAuraCandidatePayload(data: AuraResponse): AuraResponse {
  const candidateItems = data.candidateItems ?? data.candidates ?? [];
  if (!candidateItems.length) return data;
  const normalized = {
    ...data,
    presentation: "candidate_preview" as const,
    candidateItems,
    candidates: candidateItems,
  };
  if (DEBUG_AURA_CLIENT) {
    console.log("[AURA_PARSE]", "normalized candidate preview payload", {
      candidateCount: candidateItems.length,
      candidateIds: candidateItems.map((candidate) => candidate.candidateId),
      presentation: normalized.presentation,
      rawKeys: Object.keys(data),
    });
  }
  return normalized;
}

function chatOnlyAuraResponse(reply: string): AuraResponse {
  return {
    presentation: "chat",
    title: "AURA",
    reply,
    reason: "",
    outfitItems: [],
    ownedPieces: [],
    recommendedAdditions: [],
    swapSuggestion: "",
    missingPieces: [],
    upgradeSuggestions: [],
    upgradeSuggestionItems: [],
    chips: [],
    look: null,
    lookOptions: [],
  };
}

export async function askAura(args: AskAuraArgs): Promise<AuraResponse> {
  const safeArgs = sanitizeAuraArgs(args);
  const functions = getFunctions(app);
  logAuraRequest("callable_send", safeArgs);
  const callable = httpsCallable<AskAuraArgs, { ok: boolean; data: AuraResponse }>(
    functions,
    "askAura"
  );
  try {
    const result = await callable(safeArgs);
    return normalizeAuraCandidatePayload(result.data.data);
  } catch (error) {
    alertCallableError(error);
    if (DEBUG_AURA_CLIENT) {
      console.log("[AURA_ERROR]", "callable askAura failed", getFriendlyErrorMessage(error));
    }
    throw error;
  }
}

type AskAuraStreamCallbacks = {
  onStatus?: (status: string) => void;
  onDelta?: (delta: string) => void;
  onFinal?: (data: AuraResponse) => void;
  signal?: AbortSignal | null;
};

const STREAM_CHUNK_DELAY_MS = 34;
const MAX_STREAM_SEGMENT_LENGTH = 12;

function createAuraStreamAbortError() {
  const error = new Error("AURA stream stopped.");
  error.name = "AbortError";
  return error;
}

function createAuraStreamError(message: string, code?: string) {
  const error = new Error(message || "AURA stream failed.") as Error & { code?: string };
  const normalizedMessage = error.message.toLowerCase();
  if (code || normalizedMessage.includes("resource-exhausted") || normalizedMessage.includes("rate limit")) {
    error.code = code ?? "functions/resource-exhausted";
  }
  return error;
}

export function isAuraStreamAbortError(error: unknown) {
  const candidate = error as { name?: unknown; message?: unknown };
  const name = String(candidate?.name ?? "");
  const message = String(candidate?.message ?? "").toLowerCase();
  return name === "AbortError" || message.includes("aura stream stopped") || message.includes("aborted");
}

function getAskAuraStreamUrl() {
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  return `https://us-central1-${projectId}.cloudfunctions.net/askAuraStream`;
}

function logAuraRequest(label: string, args: AskAuraArgs, url?: string) {
  const attachmentCount = args.attachments?.length ?? 0;
  if (!DEBUG_AURA_CLIENT) return;
  console.log("[AURA_STREAM_REQUEST]", label, {
    url: url ?? null,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? null,
    requestKeys: Object.keys(args),
    promptLength: args.message.length,
    attachmentCount,
    streamTimeoutMs: auraStreamTimeoutMs(args),
    attachments: args.attachments?.map((attachment) => ({
      type: attachment.type,
      hasUri: !!attachment.uri,
      hasDownloadURL: /^https?:\/\//i.test(String(attachment.uri ?? "")),
      uriHost: (() => {
        try {
          return new URL(attachment.uri).hostname;
        } catch {
          return null;
        }
      })(),
      mimeType: attachment.mimeType ?? null,
      hasStoragePath: !!attachment.storagePath,
      storagePath: attachment.storagePath ?? null,
      role: attachment.type === "image" ? attachment.role ?? null : null,
      groupId: attachment.type === "image" ? attachment.groupId ?? null : null,
      width: attachment.type === "image" ? attachment.width ?? null : null,
      height: attachment.type === "image" ? attachment.height ?? null : null,
    })),
    clientIntent: args.clientIntent ?? null,
    hasLinkPreview: !!args.linkPreview,
    linkPreviewHasImage: !!args.linkPreview?.imageUrl,
    minimumCloset: args.clientContext?.minimumCloset
      ? {
          itemCount: args.clientContext.minimumCloset.itemCount,
          styleCoreProgress: args.clientContext.minimumCloset.styleCoreProgress,
          nextBestAdd: args.clientContext.minimumCloset.nextBestAdd,
          outfitRange: args.clientContext.minimumCloset.outfitRange,
        }
      : null,
    outfitDiversity: args.clientContext?.outfitDiversity
      ? {
          shouldAvoidRepeats: args.clientContext.outfitDiversity.shouldAvoidRepeats,
          reason: args.clientContext.outfitDiversity.reason,
          previousItemIds: args.clientContext.outfitDiversity.previousLookItemIds,
          excludedItemIds: args.clientContext.outfitDiversity.excludedItemIds,
          recentItemIds: args.clientContext.outfitDiversity.recentItemIds,
          previousLookSignatures: args.clientContext.outfitDiversity.previousLookSignatures,
          maxOverlap: args.clientContext.outfitDiversity.maxOverlap,
        }
      : null,
    requiredItemCount: args.clientContext?.requiredItemIds?.length ?? 0,
  });
}

function auraStreamTimeoutMs(args: AskAuraArgs) {
  return args.attachments?.some((attachment) => attachment.type === "image")
    ? AURA_STREAM_WITH_IMAGE_TIMEOUT_MS
    : AURA_STREAM_TIMEOUT_MS;
}

function firstUrlFromText(text: string) {
  const match = String(text ?? "").match(URL_RE)?.[0];
  if (!match) return null;
  try {
    const raw = match.replace(/[),.;!?]+$/g, "");
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&#(\d+);/g, (_, decimal: string) => {
      const codePoint = Number.parseInt(decimal, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const value = html.match(pattern)?.[1];
    if (value) return decodeHtmlEntities(value).slice(0, 500);
  }
  return null;
}

function titleTag(html: string) {
  const value = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return value ? decodeHtmlEntities(value).slice(0, 220) : null;
}

function normalizePreviewImage(sourceUrl: string, value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.startsWith("data:")) return null;
  try {
    const url = new URL(raw, sourceUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function isHmProductUrl(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);
    return (
      (url.hostname === "hm.com" || url.hostname.endsWith(".hm.com")) &&
      /\/productpage\.\d+\.html$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function hmClientFallbackUrls(sourceUrl: string) {
  if (!isHmProductUrl(sourceUrl)) return [];
  const url = new URL(sourceUrl);
  return [
    new URL(`${url.pathname}/_jcr_content.product.json`, url).toString(),
    new URL(`${url.pathname}/_jcr_content/product.json`, url).toString(),
  ];
}

function hmArticleIdFromUrl(sourceUrl: string) {
  try {
    return new URL(sourceUrl).pathname.match(/\/productpage\.(\d+)\.html$/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

function normalizeJsonLdImages(sourceUrl: string, imageValue: unknown) {
  const values = Array.isArray(imageValue) ? imageValue : [imageValue];
  return values
    .flatMap((image) => {
      if (typeof image === "string") return [image];
      if (image && typeof image === "object") {
        return [
          (image as { url?: string }).url,
          (image as { contentUrl?: string }).contentUrl,
        ];
      }
      return [];
    })
    .map((image) => normalizePreviewImage(sourceUrl, image))
    .filter((image): image is string => !!image);
}

function jsonLdProductNodes(html: string) {
  const nodes: Record<string, unknown>[] = [];
  const append = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(append);
      return;
    }
    const object = value as Record<string, unknown>;
    nodes.push(object);
    append(object["@graph"]);
  };
  const jsonLdRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = jsonLdRe.exec(html))) {
    try {
      append(JSON.parse(String(match[1] ?? "").trim()));
    } catch {
      // Ignore malformed JSON-LD; the generic image scan can still run for non-H&M pages.
    }
  }
  return nodes.filter((node) => {
    const type = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    return type.some((entry) => String(entry).toLowerCase() === "product");
  });
}

function selectedJsonLdProductNode(sourceUrl: string, html: string) {
  const products = jsonLdProductNodes(html);
  if (!products.length) return null;
  const articleId = hmArticleIdFromUrl(sourceUrl);
  if (!articleId) return products[0] ?? null;
  return products.find((node) =>
    [node.sku, node.mpn, node.productID, node.productId, node.url]
      .map((value) => String(value ?? ""))
      .some((value) => value.includes(articleId)),
  ) ?? products[0] ?? null;
}

function cleanClientText(value: unknown, maxLength = 300) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, maxLength) : null;
}

function stringFromJsonLdValue(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return cleanClientText(value, 240);
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return cleanClientText(object.name ?? object.value ?? object.label, 240);
  }
  return null;
}

function firstJsonLdOffer(product: Record<string, unknown> | null) {
  const offers = product?.offers;
  if (Array.isArray(offers)) {
    return offers.find((offer) => offer && typeof offer === "object") as Record<string, unknown> | undefined;
  }
  return offers && typeof offers === "object" ? offers as Record<string, unknown> : null;
}

function priceAmountFromJsonLd(value: unknown) {
  const normalized = String(value ?? "").replace(/[^\d.,]/g, "").replace(/,/g, "");
  if (!normalized) return null;
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function clientProductMetadataFromHtml(sourceUrl: string, html: string): Partial<ClientProductLinkPreview> {
  const product = selectedJsonLdProductNode(sourceUrl, html);
  if (!product) return {};
  const offer = firstJsonLdOffer(product);
  const priceAmount = priceAmountFromJsonLd(offer?.price ?? product.price);
  const currency = cleanClientText(offer?.priceCurrency ?? product.priceCurrency, 12);
  const category = stringFromJsonLdValue(product.category);
  return {
    title: cleanClientText(product.name, 220),
    brand: stringFromJsonLdValue(product.brand),
    color: stringFromJsonLdValue(product.color),
    description: cleanClientText(product.description, 700),
    category,
    priceAmount,
    price: priceAmount != null && currency ? `${currency} ${priceAmount}` : priceAmount != null ? String(priceAmount) : null,
    currency,
    priceCurrency: currency,
    priceDisplay: priceAmount != null && currency ? `${currency} ${priceAmount}` : null,
    sku: cleanClientText(product.sku ?? product.mpn ?? product.productID, 120),
    productId: cleanClientText(product.productID ?? product.productId ?? product.sku, 120),
  };
}

function scopedHmPreviewImages(sourceUrl: string, html: string) {
  if (!isHmProductUrl(sourceUrl)) return null;
  const articleId = hmArticleIdFromUrl(sourceUrl);
  const products = jsonLdProductNodes(html);
  const product = articleId
    ? products.find((node) =>
        [node.sku, node.mpn, node.productID, node.productId, node.url]
          .map((value) => String(value ?? ""))
          .some((value) => value.includes(articleId)),
      )
    : products[0];
  const images = product ? normalizeJsonLdImages(sourceUrl, product.image) : [];
  const seen = new Set<string>();
  const scoped = images.filter((image) => {
    const key = image.toLowerCase().replace(/([?&])(imwidth|width|height|w|h)=\d+/g, "$1");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
  if (DEBUG_AURA_CLIENT) {
    console.log("[LINK_PRODUCT_SCOPE]", "client H&M preview scope", {
      sourceUrl,
      articleId,
      productNodeCount: products.length,
      matchedSku: product?.sku ?? null,
      matchedTitle: product?.name ?? null,
      scopedImageCount: scoped.length,
    });
    console.log("[LINK_IMAGE_CANDIDATES_SCOPED]", "client H&M preview images", {
      sourceUrl,
      articleId,
      candidateCount: scoped.length,
      urls: scoped,
    });
  }
  return scoped.length ? scoped : null;
}

function stablePreviewImages(sourceUrl: string, html: string) {
  const scopedHmImages = scopedHmPreviewImages(sourceUrl, html);
  if (scopedHmImages) return scopedHmImages;

  const urls: string[] = [];
  const push = (value?: string | null) => {
    const normalized = normalizePreviewImage(sourceUrl, value);
    if (normalized) urls.push(normalized);
  };
  push(metaContent(html, "og:image"));
  push(metaContent(html, "og:image:secure_url"));
  push(metaContent(html, "twitter:image"));

  for (const node of jsonLdProductNodes(html)) {
    for (const image of normalizeJsonLdImages(sourceUrl, node.image)) {
      push(image);
    }
  }

  const quotedImageRe = /["']((?:https?:)?\/\/[^\s"']+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"']*)?)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = quotedImageRe.exec(html))) push(match[1]);

  const seen = new Set<string>();
  return urls.filter((url) => {
    const lower = url.toLowerCase();
    if (/(logo|icon|sprite|favicon|placeholder|badge|payment|loader)/.test(lower)) return false;
    if (/\s/.test(url)) return false;
    const key = lower.replace(/([?&])(imwidth|width|height|w|h)=\d+/g, "$1");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 32);
}

async function fetchPreviewHtml(url: string, signal: AbortSignal) {
  const response = await fetch(url, {
    signal,
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "user-agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    },
  });
  const html = await response.text();
  return { response, html };
}

async function bestClientPreviewHtml(sourceUrl: string, signal: AbortSignal) {
  const attempts = [sourceUrl, ...hmClientFallbackUrls(sourceUrl)];
  let best: { url: string; status: number; html: string; imageCount: number } | null = null;
  const isHm = isHmProductUrl(sourceUrl);
  for (const attemptUrl of attempts) {
    try {
      const { response, html } = await fetchPreviewHtml(attemptUrl, signal);
      const scopedHmImages = scopedHmPreviewImages(sourceUrl, html);
      const imageCount = (scopedHmImages ?? stablePreviewImages(sourceUrl, html)).length;
      if (DEBUG_AURA_CLIENT) {
        console.log("[AURA_LINK_PREVIEW]", "client preview html attempt", {
          sourceHost: new URL(sourceUrl).host,
          attemptPath: new URL(attemptUrl).pathname,
          status: response.status,
          htmlLength: html.length,
          imageCount,
          scopedHmImageCount: scopedHmImages?.length ?? 0,
        });
      }
      if (isHm && scopedHmImages?.length) {
        best = { url: attemptUrl, status: response.status, html, imageCount };
        break;
      }
      if (!best || imageCount > best.imageCount || (!best.imageCount && html.length > best.html.length)) {
        best = { url: attemptUrl, status: response.status, html, imageCount };
      }
      if (!isHm && imageCount > 1) break;
    } catch (error) {
      if (DEBUG_AURA_CLIENT) {
        console.log("[AURA_LINK_PREVIEW]", "client preview html attempt failed", {
          sourceHost: new URL(sourceUrl).host,
          attemptPath: new URL(attemptUrl).pathname,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return best;
}

export async function buildClientProductLinkPreview(sourceUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LINK_PREVIEW_TIMEOUT_MS);
  try {
    if (DEBUG_AURA_CLIENT) {
      console.log("[AURA_LINK_PREVIEW]", "client preview fetch start", {
        host: new URL(sourceUrl).host,
      });
    }
    const best = await bestClientPreviewHtml(sourceUrl, controller.signal);
    if (!best) return null;
    const html = best.html;
    const imageUrl = normalizePreviewImage(
      sourceUrl,
      metaContent(html, "og:image") ?? metaContent(html, "twitter:image"),
    );
    const imageUrls = stablePreviewImages(sourceUrl, html);
    const productMetadata = clientProductMetadataFromHtml(sourceUrl, html);
    const preview: ClientProductLinkPreview = {
      sourceUrl,
      ...productMetadata,
      title: productMetadata.title ?? metaContent(html, "og:title") ?? titleTag(html),
      imageUrl: imageUrls[0] ?? imageUrl,
      imageUrls,
      description: productMetadata.description ?? metaContent(html, "og:description") ?? metaContent(html, "description"),
    };
    if (DEBUG_AURA_CLIENT) {
      console.log("[AURA_LINK_PREVIEW]", "client preview fetch complete", {
        host: new URL(sourceUrl).host,
        status: best.status,
        htmlSourcePath: new URL(best.url).pathname,
        htmlLength: html.length,
        hasTitle: !!preview.title,
        hasImageUrl: !!preview.imageUrl,
        imageCount: preview.imageUrls?.length ?? 0,
        hasDescription: !!preview.description,
      });
    }
    return preview.imageUrl || preview.title || preview.description ? preview : null;
  } catch (error) {
    if (DEBUG_AURA_CLIENT) {
      console.log("[AURA_LINK_PREVIEW]", "client preview fetch failed", {
        host: new URL(sourceUrl).host,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function withClientLinkPreview(args: AskAuraArgs): Promise<AskAuraArgs> {
  if (args.linkPreview) return args;
  const sourceUrl = firstUrlFromText(args.message);
  if (!sourceUrl) return args;
  if (!ENABLE_CLIENT_LINK_PREVIEW) {
    if (DEBUG_AURA_CLIENT) {
      console.log("[AURA_LINK_PREVIEW]", "client preview skipped; backend extraction is source of truth", {
        host: new URL(sourceUrl).host,
        clientIntent: args.clientIntent ?? null,
      });
    }
    return args;
  }
  const linkPreview = await buildClientProductLinkPreview(sourceUrl);
  return linkPreview ? { ...args, linkPreview } : args;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitDeltaForDisplay(delta: string) {
  const rawParts = delta.match(/\S+\s*|\s+/g) ?? [delta];
  return rawParts.flatMap((part) => {
    if (part.length <= MAX_STREAM_SEGMENT_LENGTH) return [part];
    const segments: string[] = [];
    for (let index = 0; index < part.length; index += MAX_STREAM_SEGMENT_LENGTH) {
      segments.push(part.slice(index, index + MAX_STREAM_SEGMENT_LENGTH));
    }
    return segments;
  });
}

async function emitDeltaSmoothly(delta: string, onDelta?: (delta: string) => void, signal?: AbortSignal | null) {
  if (!onDelta || !delta) return;
  const parts = splitDeltaForDisplay(delta);
  for (let index = 0; index < parts.length; index += 1) {
    if (signal?.aborted) throw createAuraStreamAbortError();
    onDelta(parts[index]);
    if (index < parts.length - 1) {
      await sleep(STREAM_CHUNK_DELAY_MS);
    }
  }
}

function processEventLines(
  chunk: string,
  callbacks: AskAuraStreamCallbacks,
  setFinalData: (data: AuraResponse) => void
) {
  const lines = chunk.split("\n");
  return lines.reduce<Promise<void>>(async (previous, line) => {
    await previous;
    if (callbacks.signal?.aborted) throw createAuraStreamAbortError();
    const trimmed = line.trim();
    if (!trimmed) return;
    const event = JSON.parse(trimmed) as
      | { type: "status"; status: string }
      | { type: "delta"; delta: string }
      | { type: "final"; data: AuraResponse }
      | { type: "error"; error: string };

    if (event.type === "status") callbacks.onStatus?.(event.status);
    if (event.type === "delta") {
      await emitDeltaSmoothly(event.delta, callbacks.onDelta, callbacks.signal);
    }
    if (event.type === "final") {
      if (DEBUG_AURA_CLIENT) {
        console.log("[AURA_STREAM_RAW]", "raw final stream payload", {
          keys: Object.keys(event.data ?? {}),
          presentation: event.data?.presentation,
          candidateItemsCount: event.data?.candidateItems?.length ?? 0,
          candidatesCount: event.data?.candidates?.length ?? 0,
        });
      }
      const data = normalizeAuraCandidatePayload(event.data);
      if (DEBUG_AURA_CLIENT) {
        console.log("[AURA_STREAM_FINAL]", "parsed final stream payload", {
          presentation: data.presentation,
          hasLook: !!data.look,
          candidateCount: data.candidateItems?.length ?? data.candidates?.length ?? 0,
        });
      }
      setFinalData(data);
      callbacks.onFinal?.(data);
    }
    if (event.type === "error") {
      throw createAuraStreamError(event.error || "AURA stream failed.");
    }
  }, Promise.resolve());
}

async function askAuraStreamWithXhr(
  args: AskAuraArgs,
  token: string,
  callbacks: AskAuraStreamCallbacks
) {
  return new Promise<AuraResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.timeout = auraStreamTimeoutMs(args);
    const signal = callbacks.signal;
    let processedLength = 0;
    let pendingBuffer = "";
    let finalData: AuraResponse | null = null;
    let streamedText = "";
    let isSettled = false;
    let processingQueue = Promise.resolve();
    const trackedCallbacks: AskAuraStreamCallbacks = {
      ...callbacks,
      onDelta: (delta) => {
        streamedText += delta;
        callbacks.onDelta?.(delta);
      },
      onFinal: (data) => {
        callbacks.onFinal?.(data);
      },
    };

    const cleanupAbortListener = () => {
      signal?.removeEventListener("abort", handleAbort);
    };

    const settleSuccess = (data: AuraResponse) => {
      if (isSettled) return;
      isSettled = true;
      cleanupAbortListener();
      resolve(data);
    };

    const settlePartialIfUseful = () => {
      if (finalData) {
        settleSuccess(finalData);
        return true;
      }
      const reply = streamedText.trim();
      if (!reply) return false;
      const data = chatOnlyAuraResponse(reply);
      callbacks.onFinal?.(data);
      settleSuccess(data);
      return true;
    };

    const settleError = (error: unknown) => {
      if (isSettled) return;
      if (!isAuraStreamAbortError(error) && !isRateLimitError(error) && settlePartialIfUseful()) return;
      isSettled = true;
      cleanupAbortListener();
      reject(error instanceof Error ? error : new Error("AURA stream failed."));
    };

    const handleAbort = () => {
      if (isSettled) return;
      isSettled = true;
      cleanupAbortListener();
      try {
        xhr.abort();
      } catch {
        // Ignore platform-specific abort cleanup failures.
      }
      reject(createAuraStreamAbortError());
    };

    if (signal?.aborted) {
      settleError(createAuraStreamAbortError());
      return;
    }
    signal?.addEventListener("abort", handleAbort, { once: true });

    const flushResponseText = () => {
      processingQueue = processingQueue.then(async () => {
        if (signal?.aborted) throw createAuraStreamAbortError();
        const responseText = xhr.responseText ?? "";
        if (responseText.length <= processedLength) return;
        const nextChunk = responseText.slice(processedLength);
        processedLength = responseText.length;
        pendingBuffer += nextChunk;
        const segments = pendingBuffer.split("\n");
        pendingBuffer = segments.pop() ?? "";
        await processEventLines(segments.join("\n"), trackedCallbacks, (data) => {
          finalData = data;
        });
      });
      return processingQueue;
    };

    xhr.open("POST", getAskAuraStreamUrl());
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.onprogress = () => {
      void flushResponseText().catch(settleError);
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        void flushResponseText()
          .then(async () => {
            await processingQueue;
            if (pendingBuffer.trim()) {
              await processEventLines(pendingBuffer, trackedCallbacks, (data) => {
                finalData = data;
              });
              pendingBuffer = "";
            }

            if (xhr.status < 200 || xhr.status >= 300) {
              const code = xhr.status === 429 ? "functions/resource-exhausted" : undefined;
              throw createAuraStreamError(xhr.responseText || "AURA stream failed.", code);
            }

            if (finalData) {
              settleSuccess(finalData);
              return;
            }

            if (settlePartialIfUseful()) return;
            const fallback = await askAura(args);
            callbacks.onFinal?.(fallback);
            settleSuccess(fallback);
          })
          .catch(settleError);
      }
    };

    xhr.onerror = () => settleError(new Error("AURA stream request failed."));
    xhr.ontimeout = () => settleError(new Error("AURA stream request timed out."));
    const body = JSON.stringify({
      ...args,
    });
    logAuraRequest("xhr_send", args, getAskAuraStreamUrl());
    xhr.send(body);
  });
}

export async function askAuraStream(
  args: AskAuraArgs,
  callbacks: AskAuraStreamCallbacks = {}
): Promise<AuraResponse> {
  const enrichedArgs = sanitizeAuraArgs(await withClientLinkPreview(args));
  if (callbacks.signal?.aborted) throw createAuraStreamAbortError();
  const currentUser = auth.currentUser;
  const token = await currentUser?.getIdToken();

  if (!token) {
    if (callbacks.signal?.aborted) throw createAuraStreamAbortError();
    logAuraRequest("callable_fallback_no_token", enrichedArgs);
    return askAura(enrichedArgs);
  }

  if (Platform.OS !== "web") {
    try {
      return await askAuraStreamWithXhr(enrichedArgs, token, callbacks);
    } catch (error) {
      if (isAuraStreamAbortError(error)) throw error;
      if (isRateLimitError(error)) {
        alertCallableError(error);
        throw error;
      }
      if (DEBUG_AURA_CLIENT) {
        console.log("[AURA_STREAM_FALLBACK]", "xhr stream failed, using callable fallback", {
          error: getFriendlyErrorMessage(error),
        });
      }
      const fallback = await askAura(enrichedArgs);
      callbacks.onFinal?.(fallback);
      return fallback;
    }
  }

  const url = getAskAuraStreamUrl();
  logAuraRequest("fetch_send", enrichedArgs, url);
  const body = JSON.stringify(enrichedArgs);
  const streamController = new AbortController();
  let streamTimedOut = false;
  const streamTimeout = setTimeout(() => {
    streamTimedOut = true;
    streamController.abort();
  }, auraStreamTimeoutMs(enrichedArgs));
  const handleExternalAbort = () => streamController.abort();
  callbacks.signal?.addEventListener("abort", handleExternalAbort, { once: true });

  const clearStreamTimeout = () => {
    clearTimeout(streamTimeout);
    callbacks.signal?.removeEventListener("abort", handleExternalAbort);
  };

  let response: Response;
  try {
    if (callbacks.signal?.aborted) throw createAuraStreamAbortError();
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body,
      signal: streamController.signal,
    });
  } catch (error) {
    clearStreamTimeout();
    if (callbacks.signal?.aborted && isAuraStreamAbortError(error)) throw error;
    if (isRateLimitError(error)) {
      alertCallableError(error);
      throw error;
    }
    if (DEBUG_AURA_CLIENT) {
      console.log("[AURA_STREAM_FALLBACK]", "fetch stream failed before response, using callable fallback", {
        error: streamTimedOut ? "AURA stream request timed out." : getFriendlyErrorMessage(error),
      });
    }
    const fallback = await askAura(enrichedArgs);
    callbacks.onFinal?.(fallback);
    return fallback;
  }

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429 || /resource-exhausted|rate limit/i.test(errorText)) {
      clearStreamTimeout();
      const rateLimitError = createAuraStreamError(
        errorText || "Rate limit exceeded. Please wait a moment and try again.",
        "functions/resource-exhausted",
      );
      alertCallableError(rateLimitError);
      throw rateLimitError;
    }
    if (DEBUG_AURA_CLIENT) {
      console.log("[AURA_STREAM_FALLBACK]", "fetch stream returned non-200, using callable fallback", {
        status: response.status,
        errorText,
      });
    }
    const fallback = await askAura(enrichedArgs);
    callbacks.onFinal?.(fallback);
    clearStreamTimeout();
    return fallback;
  }

  if (!response.body || typeof response.body.getReader !== "function") {
    logAuraRequest("callable_fallback_no_reader", args);
    const fallback = await askAura(enrichedArgs);
    callbacks.onFinal?.(fallback);
    clearStreamTimeout();
    return fallback;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalData: AuraResponse | null = null;
  let streamedText = "";
  const trackedCallbacks: AskAuraStreamCallbacks = {
    ...callbacks,
    onDelta: (delta) => {
      streamedText += delta;
      callbacks.onDelta?.(delta);
    },
    onFinal: (data) => {
      callbacks.onFinal?.(data);
    },
  };
  const partialStreamResponse = () => {
    const reply = streamedText.trim();
    return reply ? chatOnlyAuraResponse(reply) : null;
  };

  try {
    while (true) {
      if (callbacks.signal?.aborted) throw createAuraStreamAbortError();
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      await processEventLines(lines.join("\n"), trackedCallbacks, (data) => {
        finalData = data;
      });
    }

    if (buffer.trim()) {
      await processEventLines(buffer, trackedCallbacks, (data) => {
        finalData = data;
      });
    }
  } catch (error) {
    clearStreamTimeout();
    if (callbacks.signal?.aborted && isAuraStreamAbortError(error)) throw error;
    if (finalData) return finalData;
    if (isRateLimitError(error)) {
      alertCallableError(error);
      throw error;
    }
    const partial = partialStreamResponse();
    if (partial) {
      callbacks.onFinal?.(partial);
      return partial;
    }
    if (DEBUG_AURA_CLIENT) {
      console.log("[AURA_STREAM_FALLBACK]", "fetch stream failed while reading, using callable fallback", {
        error: streamTimedOut ? "AURA stream request timed out." : getFriendlyErrorMessage(error),
      });
    }
    const fallback = await askAura(enrichedArgs);
    callbacks.onFinal?.(fallback);
    return fallback;
  }

  clearStreamTimeout();

  if (finalData) return finalData;

  const partial = partialStreamResponse();
  if (partial) {
    callbacks.onFinal?.(partial);
    return partial;
  }

  const fallback = await askAura(enrichedArgs);
  callbacks.onFinal?.(fallback);
  return fallback;
}

export async function transcribeAuraAudio(params: {
  storagePath: string;
  mimeType: string;
  durationMs?: number | null;
}): Promise<string> {
  const functions = getFunctions(app);
  const callable = httpsCallable<
    { storagePath: string; mimeType: string; durationMs?: number | null },
    { transcript: string }
  >(
    functions,
    "transcribeAuraAudio"
  );
  try {
    const result = await callable(params);
    return result.data.transcript;
  } catch (error) {
    alertCallableError(error);
    if (DEBUG_AURA_CLIENT) {
      console.log("[AURA_ERROR]", "transcribeAuraAudio failed", getFriendlyErrorMessage(error));
    }
    throw error;
  }
}

export async function importProductLinkToWardrobe(
  url: string,
  itemId?: string
): Promise<{ itemId: string; imageCount: number }> {
  const functions = getFunctions(app);
  const callable = httpsCallable<
    { url: string; itemId?: string },
    { ok: boolean; itemId: string; imageCount: number }
  >(
    functions,
    "importProductLink"
  );
  try {
    const result = await callable({ url, ...(itemId ? { itemId } : {}) });
    return {
      itemId: result.data.itemId,
      imageCount: result.data.imageCount,
    };
  } catch (error) {
    alertCallableError(error);
    if (DEBUG_AURA_CLIENT) {
      console.log("[AURA_ERROR]", "importProductLink failed", getFriendlyErrorMessage(error));
    }
    throw error;
  }
}
