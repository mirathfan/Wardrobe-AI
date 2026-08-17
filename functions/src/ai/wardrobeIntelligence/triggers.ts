import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger, setLogContext, tracedHandler } from "../../shared/logger";
import { redactUid } from "../../shared/rateLimit";
import { CLOSET_ITEM_DOCUMENT_PATH } from "./config";
import { indexClosetItemIntelligence } from "./indexClosetItem";
import {
  isIndexableClosetItemState,
  shouldSkipIntelligenceIndexing,
} from "./skip";
import type { ClosetItemDocument } from "./types";

function errorReason(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

export const onClosetItemWriteIndexIntelligence = onDocumentWritten(
  {
    document: CLOSET_ITEM_DOCUMENT_PATH,
    secrets: ["OPENAI_API_KEY"],
    timeoutSeconds: 180,
  },
  tracedHandler(async (event) => {
    const uid = String(event.params.uid ?? "");
    const itemId = String(event.params.itemId ?? "");
    setLogContext({ uidHash: redactUid(uid) });
    const before = event.data?.before.data() as ClosetItemDocument | undefined;
    const after = event.data?.after.data() as ClosetItemDocument | undefined;

    if (!after) return;
    if (shouldSkipIntelligenceIndexing(before, after)) return;
    if (!isIndexableClosetItemState(after)) {
      logger.info("[WARDROBE_INTELLIGENCE] skipping non-indexable closet item state", { itemId });
      return;
    }

    try {
      const result = await indexClosetItemIntelligence({
        itemId,
        item: { id: itemId, ...after },
        ref: event.data?.after.ref,
      });
      logger.info("[WARDROBE_INTELLIGENCE] closet item indexing complete", {
        itemId,
        status: result.status,
        reason: result.reason ?? null,
      });
    } catch (error) {
      logger.error("[WARDROBE_INTELLIGENCE] closet item indexing failed", {
        itemId,
        reason: errorReason(error),
      });
    }
  }),
);
