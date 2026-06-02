import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { parseOutfitIntentFromPrompt } from "./parseOutfitIntent";
import { allowedWebOrigins } from "./shared/cors";
import { setLogContext, tracedHandler } from "./shared/logger";
import { assertFunctionRateLimit, RATE_LIMITS, redactUid } from "./shared/rateLimit";
export { generateOutfitsV1 } from "./generateOutfitsV1";
export { generateAuraSwipeBatch } from "./generateAuraSwipeBatch";
export { outfitChatV1 } from "./outfitChatV1";
export { askAura } from "./askAura";
export { askAuraStream } from "./askAuraStream";
export { transcribeAuraAudio } from "./transcribeAuraAudio";
export { importProductLink } from "./importProductLink";
export { previewProductLink } from "./previewProductLink";
export { polishProductImage } from "./polishProductImage";
export {
  extractOutfitItems,
  polishExtractedAccessory,
  reconstructOutfitLayout,
} from "./extractOutfitItems";
export { ingestItemFromPhotos } from "./ingestItemFromPhotos";
export { deleteAccountData } from "./deleteAccountData";
export { wrapAffiliateLinks } from "./affiliate/affiliateLinks";
export { searchLiveProducts } from "./products/searchLiveProducts";
export {
  reindexClosetItem,
  backfillWardrobeIntelligence,
  backfillWardrobeIntelligenceAll,
  previewClosetItemIntelligence,
  auditClosetDraftItems,
  deleteDraftClosetItem,
  previewAbandonedDraftCleanup,
  bulkDeleteAbandonedDrafts,
} from "./ai/wardrobeIntelligence/callables";
export {
  retrieveWardrobeContext,
} from "./ai/wardrobeIntelligence/retrievalCallables";
export {
  previewOutfitGenerationContext,
  generateOutfitRecommendations,
} from "./ai/wardrobeIntelligence/outfitCallables";
export {
  recordOutfitFeedback,
  retrieveStyleMemoryContext,
  getStyleProfile,
  rebuildStyleProfileFromMemories,
  listStyleMemories,
  deleteStyleMemory,
  softDeleteAllStyleMemories,
} from "./ai/wardrobeIntelligence/styleMemoryCallables";
export {
  runAuraStylingAgent,
} from "./ai/wardrobeIntelligence/agentCallables";
export {
  saveAuraAgentOutfit,
  logAuraAgentOutfitWear,
  planAuraAgentOutfit,
  dislikeAuraAgentOutfit,
} from "./ai/wardrobeIntelligence/agentActionCallables";
export {
  getAuraMetrics,
  refreshAuraMetricsSnapshot,
  getAuraResumeMetrics,
  resetAuraMetrics,
} from "./ai/wardrobeIntelligence/metricsCallables";
export {
  onClosetItemWriteIndexIntelligence,
} from "./ai/wardrobeIntelligence/triggers";
export {
  cleanupAbandonedDraftClosetItems,
} from "./ai/wardrobeIntelligence/scheduledDraftCleanup";
// export { generateCleanedProductImages } from "./generateCleanedProductImages";

if (!getApps().length) {
  initializeApp();
}
getFirestore().settings({ignoreUndefinedProperties: true});

const ALLOWED_ORIGINS = allowedWebOrigins();

export const parseOutfitIntent = onRequest(
  { cors: ALLOWED_ORIGINS, secrets: ["OPENAI_API_KEY"] },
  tracedHandler(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const token = authHeader.split("Bearer ")[1];
    let uid: string;
    try {
      const decoded = await getAuth().verifyIdToken(token);
      uid = decoded.uid;
      setLogContext({ uidHash: redactUid(uid) });
    } catch {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    try {
      await assertFunctionRateLimit(uid, "parseOutfitIntent", RATE_LIMITS.parseOutfitIntent);
    } catch {
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    const prompt = String(req.body?.prompt ?? "").trim();
    if (!prompt) {
      res.status(400).json({ error: "Missing prompt" });
      return;
    }

    const intent = await parseOutfitIntentFromPrompt(prompt);
    res.status(200).json(intent);
  }),
);

export const health = onRequest({ cors: false }, tracedHandler((_req, res) => {
  res.json({ ok: true, ts: Date.now() });
}));
