import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { parseOutfitIntentFromPrompt } from "./parseOutfitIntent";
export { generateOutfitsV1 } from "./generateOutfitsV1";
export { generateAuraSwipeBatch } from "./generateAuraSwipeBatch";
export { outfitChatV1 } from "./outfitChatV1";
export { askAura } from "./askAura";
export { askAuraStream } from "./askAuraStream";
export { transcribeAuraAudio } from "./transcribeAuraAudio";
export { importProductLink } from "./importProductLink";
export { previewProductLink } from "./previewProductLink";
export { ingestItemFromPhotos } from "./ingestItemFromPhotos";
export { deleteAccountData } from "./deleteAccountData";
// export { generateCleanedProductImages } from "./generateCleanedProductImages";

if (!getApps().length) {
  initializeApp();
}
getFirestore().settings({ignoreUndefinedProperties: true});

async function assertParseOutfitIntentRateLimit(uid: string) {
  const db = getFirestore();
  const ref = db
    .collection("functionRateLimits")
    .doc("parseOutfitIntent")
    .collection("users")
    .doc(uid);
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 20;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() as { windowStart?: number; count?: number } | undefined;
    const windowStart =
      typeof data?.windowStart === "number" && now - data.windowStart < windowMs
        ? data.windowStart
        : now;
    const count = windowStart === data?.windowStart ? Number(data?.count ?? 0) + 1 : 1;
    if (count > maxRequests) {
      throw new Error("rate_limited");
    }
    transaction.set(ref, { windowStart, count, updatedAt: now }, { merge: true });
  });
}

export const parseOutfitIntent = onRequest(
  { cors: true, secrets: ["OPENAI_API_KEY"] },
  async (req, res) => {
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
    } catch {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    try {
      await assertParseOutfitIntentRateLimit(uid);
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
  },
);
