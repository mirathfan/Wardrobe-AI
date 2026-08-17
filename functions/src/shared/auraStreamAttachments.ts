import { logger } from "./logger";

import { redactUid } from "./rateLimit";
import { redactUrlForLogs, validateSafeUrlForFetch } from "./safeFetch";

export type AuraAttachment = {
  type?: "image";
  uri?: string;
  role?: string | null;
  groupId?: string | null;
  mimeType?: string | null;
  storagePath?: string | null;
  width?: number | null;
  height?: number | null;
};

export type ClientAuraIntent =
  | "add_item"
  | "add_items_batch"
  | "add_item_from_url"
  | "add_from_link"
  | "add_from_links_batch"
  | string
  | null;

const ADD_IMAGE_RE =
  /\b(add|save|store|put|upload|log)\b[\s\S]{0,80}\b(closet|wardrobe|item|items|these|this|all)\b|\b(add|save)\s+(this|these|all|item|items)\b/i;
const BATCH_IMAGE_RE = /\b(these|all|each|separate|multiple|items)\b/i;

export async function parseAuraAttachments(uid: string, input: unknown): Promise<AuraAttachment[]> {
  if (!Array.isArray(input)) return [];
  const out: AuraAttachment[] = [];
  for (const entry of input.slice(0, 8)) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as Record<string, unknown>;
    if (candidate.type !== "image") continue;
    const uri = String(candidate.uri ?? "").trim();
    if (!uri) continue;
    const storagePath = String(candidate.storagePath ?? "").trim() || null;
    if (storagePath && !storagePath.startsWith(`users/${uid}/auraAttachments/`)) {
      logger.warn("[AURA_STREAM_ATTACHMENTS] rejected foreign image attachment", {
        uidHash: redactUid(uid),
        hasStoragePath: !!storagePath,
      });
      continue;
    }
    try {
      await validateSafeUrlForFetch(uri);
    } catch (error) {
      logger.warn("[AURA_STREAM_ATTACHMENTS] rejected unsafe image attachment URL", {
        uidHash: redactUid(uid),
        uri: redactUrlForLogs(uri),
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    logger.info("[AURA_STREAM_ATTACHMENTS] accepted image attachment", {
      uidHash: redactUid(uid),
      kind: "image",
      mimeType: typeof candidate.mimeType === "string" ? candidate.mimeType : null,
      hasStoragePath: !!storagePath,
      hasDownloadURL: /^https?:\/\//i.test(uri),
      uriHost: safeUrlHost(uri),
      validatedMediaSource: storagePath ? "owned_storage_download_url" : "validated_remote_url",
      width: typeof candidate.width === "number" ? candidate.width : null,
      height: typeof candidate.height === "number" ? candidate.height : null,
    });
    out.push({
      type: "image",
      uri,
      role: typeof candidate.role === "string" ? candidate.role : null,
      groupId: typeof candidate.groupId === "string" ? candidate.groupId : null,
      mimeType: typeof candidate.mimeType === "string" ? candidate.mimeType : null,
      storagePath,
      width: typeof candidate.width === "number" ? candidate.width : null,
      height: typeof candidate.height === "number" ? candidate.height : null,
    });
  }
  return out;
}

export function attachmentContextText(attachments: AuraAttachment[]) {
  if (!attachments.length) return "No attachments.";
  return JSON.stringify(
    attachments.map((attachment, index) => ({
      index,
      type: attachment.type,
      role: attachment.role ?? null,
      groupId: attachment.groupId ?? null,
      mimeType: attachment.mimeType ?? null,
      storagePath: attachment.storagePath ?? null,
      width: attachment.width ?? null,
      height: attachment.height ?? null,
      uri: redactUrlForLogs(attachment.uri),
    })),
    null,
    2
  );
}

export function safeUrlHost(uri: string | undefined) {
  if (!uri) return null;
  try {
    return new URL(uri).host;
  } catch {
    return null;
  }
}

export function imageGroupsForAddIntent(
  text: string,
  attachments: AuraAttachment[],
  clientIntent?: ClientAuraIntent,
) {
  const images = attachments.filter(
    (attachment): attachment is AuraAttachment & { uri: string } =>
      attachment.type === "image" && !!attachment.uri,
  );
  const forceAdd =
    clientIntent === "add_item" || clientIntent === "add_items_batch";
  if (!images.length || (!forceAdd && !ADD_IMAGE_RE.test(text))) return [];
  const shouldSplit =
    images.length > 1 &&
    (clientIntent === "add_items_batch" ||
      images[0]?.role === "separate_items" ||
      BATCH_IMAGE_RE.test(text));
  return shouldSplit ? images.map((image) => [image.uri]) : [images.map((image) => image.uri)];
}

export function buildAuraVisionImageInputs(attachments: AuraAttachment[]) {
  return attachments
    .filter((attachment) => attachment.type === "image")
    .slice(0, 2)
    .map((attachment) => ({
      type: "input_image" as const,
      image_url: attachment.uri ?? "",
      detail: "low" as const,
    }));
}
