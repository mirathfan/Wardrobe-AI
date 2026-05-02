import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import OpenAI from "openai";

import {
  ProductLinkError,
  createDraftItemFromProductLink,
  extractProductFromUrl,
} from "./shared/productLinkExtractor";
import { rankProductExtractionImages } from "./shared/auraCandidatePreview";
import { redactUrlForLogs } from "./shared/safeFetch";

function messageForError(error: unknown) {
  if (error instanceof ProductLinkError) return error.message;
  if (error instanceof Error) return error.message;
  return "Could not import that product link.";
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
    const itemId = String(request.data?.itemId ?? "").trim() || null;

    try {
      logger.info("[SNAP_DONE_LINK] importing product link", {
        uid,
        url: redactUrlForLogs(url),
        itemId,
      });
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
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
        uid,
        itemId: created.itemId,
        imageCount: created.imageCount,
        domain: created.metadata.domain,
      });
      return { ok: true, itemId: created.itemId, imageCount: created.imageCount };
    } catch (error) {
      const message = messageForError(error);
      logger.error("[SNAP_DONE_LINK] import failed", {
        uid,
        url: redactUrlForLogs(url),
        itemId,
        error,
      });
      await markImportFailed(uid, itemId, message);
      throw new HttpsError("internal", message);
    }
  }
);
