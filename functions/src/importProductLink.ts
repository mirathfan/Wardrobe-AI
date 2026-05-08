import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import OpenAI from "openai";

import {
  ProductLinkError,
  createDraftItemFromProductLink,
  extractProductFromUrl,
} from "./shared/productLinkExtractor";
import { requireOpenAiApiKey } from "./shared/env";
import { rankProductExtractionImages } from "./shared/auraCandidatePreview";
import {
  RATE_LIMITS,
  assertFunctionRateLimit,
  redactUid,
} from "./shared/rateLimit";
import { redactUrlForLogs } from "./shared/safeFetch";

function messageForError(error: unknown) {
  if (error instanceof ProductLinkError) return error.message;
  if (error instanceof Error) return error.message;
  return "Could not import that product link.";
}

function codeForError(
  error: unknown,
): "invalid-argument" | "failed-precondition" | "internal" {
  if (!(error instanceof ProductLinkError)) return "internal";
  switch (error.code) {
    case "invalid_url":
    case "unsafe_url":
    case "fetch_failed":
      return "invalid-argument";
    case "blocked_store":
    case "no_metadata":
    case "no_images":
      return "failed-precondition";
    case "draft_failed":
    default:
      return "internal";
  }
}

async function markImportFailed(uid: string, itemId: string | null, message: string) {
  if (!itemId) return;
  await getFirestore()
    .collection("users")
    .doc(uid)
    .collection("items")
    .doc(itemId)
    .set(
      {
        draftState: "failed",
        itemLifecycleStatus: "failed",
        ingestionStatus: "failed",
        ingestion: {
          status: "failed",
          lastRunAt: FieldValue.serverTimestamp(),
          error: { message },
        },
        updatedAt: Date.now(),
      },
      { merge: true }
    );
}

export const importProductLink = onCall(
  { secrets: ["OPENAI_API_KEY"] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Please sign in first.");
    }

    const url = String(request.data?.url ?? "").trim();
    if (!url) {
      throw new HttpsError("invalid-argument", "A product link is required.");
    }
    await assertFunctionRateLimit(uid, "productLink", RATE_LIMITS.productLink);
    const itemId = String(request.data?.itemId ?? "").trim() || null;

    try {
      logger.info("[SNAP_DONE_LINK] importing product link", {
        uidHash: redactUid(uid),
        url: redactUrlForLogs(url),
        itemId,
      });
      const client = new OpenAI({
        apiKey: requireOpenAiApiKey(),
      });
      const extraction = await rankProductExtractionImages({
        client,
        extraction: await extractProductFromUrl(url),
      });
      const created = await createDraftItemFromProductLink({
        uid,
        itemId: itemId ?? undefined,
        prompt: "Quick add product link",
        extraction,
      });
      logger.info("[SNAP_DONE_LINK] product draft created", {
        uidHash: redactUid(uid),
        itemId: created.itemId,
        imageCount: created.imageCount,
        domain: created.metadata.domain,
      });
      return { ok: true, itemId: created.itemId, imageCount: created.imageCount };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      const message = messageForError(error);
      logger.error("[SNAP_DONE_LINK] import failed", {
        uidHash: redactUid(uid),
        url: redactUrlForLogs(url),
        itemId,
        code: error instanceof ProductLinkError ? error.code : null,
        error: message,
      });
      await markImportFailed(uid, itemId, message);
      throw new HttpsError(codeForError(error), message);
    }
  }
);
