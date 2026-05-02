import { getFunctions, httpsCallable } from "firebase/functions";
import { Platform } from "react-native";

import { auth, app } from "@/src/lib/firebase";
import type { AuraResponse } from "@/src/types/aura";
import type { ChatAttachment } from "@/src/components/ai/chatTypes";

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
  linkPreview?: {
    sourceUrl: string;
    title?: string | null;
    imageUrl?: string | null;
    imageUrls?: string[];
    description?: string | null;
  } | null;
  clientContext?: {
    minimumCloset?: {
      itemCount: number;
      styleCoreProgress: string;
      nextBestAdd: string | null;
      outfitRange: number;
      nudge: string;
      tone: string;
    };
  };
};

const URL_RE = /https?:\/\/[^\s<>"']+/i;
const LINK_PREVIEW_TIMEOUT_MS = 9000;
const DEBUG_AURA_CLIENT = __DEV__ && process.env.EXPO_PUBLIC_AURA_DEBUG === "1";
const AURA_STREAM_TIMEOUT_MS = 30_000;
const AURA_STREAM_WITH_IMAGE_TIMEOUT_MS = 90_000;

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

export async function askAura(args: AskAuraArgs): Promise<AuraResponse> {
  const safeArgs = sanitizeAuraArgs(args);
  const functions = getFunctions(app);
  logAuraRequest("callable_send", safeArgs);
  const callable = httpsCallable<AskAuraArgs, { ok: boolean; data: AuraResponse }>(
    functions,
    "askAura"
  );
  const result = await callable(safeArgs);
  return normalizeAuraCandidatePayload(result.data.data);
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
    const url = new URL(match.replace(/[),.;!?]+$/g, ""));
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
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

async function buildClientLinkPreview(sourceUrl: string) {
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
    const preview = {
      sourceUrl,
      title: metaContent(html, "og:title") ?? titleTag(html),
      imageUrl: imageUrls[0] ?? imageUrl,
      imageUrls,
      description: metaContent(html, "og:description") ?? metaContent(html, "description"),
    };
    if (DEBUG_AURA_CLIENT) {
      console.log("[AURA_LINK_PREVIEW]", "client preview fetch complete", {
        host: new URL(sourceUrl).host,
        status: best.status,
        htmlSourcePath: new URL(best.url).pathname,
        htmlLength: html.length,
        hasTitle: !!preview.title,
        hasImageUrl: !!preview.imageUrl,
        imageCount: preview.imageUrls.length,
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
  const linkPreview = await buildClientLinkPreview(sourceUrl);
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
      throw new Error(event.error || "AURA stream failed.");
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
    let isSettled = false;
    let processingQueue = Promise.resolve();

    const cleanupAbortListener = () => {
      signal?.removeEventListener("abort", handleAbort);
    };

    const settleError = (error: unknown) => {
      if (isSettled) return;
      isSettled = true;
      cleanupAbortListener();
      reject(error instanceof Error ? error : new Error("AURA stream failed."));
    };

    const settleSuccess = (data: AuraResponse) => {
      if (isSettled) return;
      isSettled = true;
      cleanupAbortListener();
      resolve(data);
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
        await processEventLines(segments.join("\n"), callbacks, (data) => {
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
              await processEventLines(pendingBuffer, callbacks, (data) => {
                finalData = data;
              });
              pendingBuffer = "";
            }

            if (xhr.status < 200 || xhr.status >= 300) {
              throw new Error(xhr.responseText || "AURA stream failed.");
            }

            if (finalData) {
              settleSuccess(finalData);
              return;
            }

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
      if (DEBUG_AURA_CLIENT) {
        console.log("[AURA_STREAM_FALLBACK]", "xhr stream failed, using callable fallback", {
          error: error instanceof Error ? error.message : String(error),
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
      signal: callbacks.signal ?? undefined,
    });
  } catch (error) {
    if (isAuraStreamAbortError(error)) throw error;
    if (DEBUG_AURA_CLIENT) {
      console.log("[AURA_STREAM_FALLBACK]", "fetch stream failed before response, using callable fallback", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const fallback = await askAura(enrichedArgs);
    callbacks.onFinal?.(fallback);
    return fallback;
  }

  if (!response.ok) {
    const errorText = await response.text();
    if (DEBUG_AURA_CLIENT) {
      console.log("[AURA_STREAM_FALLBACK]", "fetch stream returned non-200, using callable fallback", {
        status: response.status,
        errorText,
      });
    }
    const fallback = await askAura(enrichedArgs);
    callbacks.onFinal?.(fallback);
    return fallback;
  }

  if (!response.body || typeof response.body.getReader !== "function") {
    logAuraRequest("callable_fallback_no_reader", args);
    const fallback = await askAura(enrichedArgs);
    callbacks.onFinal?.(fallback);
    return fallback;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalData: AuraResponse | null = null;

  while (true) {
    if (callbacks.signal?.aborted) throw createAuraStreamAbortError();
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    await processEventLines(lines.join("\n"), callbacks, (data) => {
      finalData = data;
    });
  }

  if (finalData) return finalData;

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
  const result = await callable(params);
  return result.data.transcript;
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
  const result = await callable({ url, ...(itemId ? { itemId } : {}) });
  return {
    itemId: result.data.itemId,
    imageCount: result.data.imageCount,
  };
}
