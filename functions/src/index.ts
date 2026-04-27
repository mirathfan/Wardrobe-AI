import { getApps, initializeApp } from "firebase-admin/app";
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
export { ingestItemFromPhotos } from "./ingestItemFromPhotos";
export { generateCleanedProductImages } from "./generateCleanedProductImages";

if (!getApps().length) {
  initializeApp();
}
getFirestore().settings({ignoreUndefinedProperties: true});

export const parseOutfitIntent = onRequest(
  { cors: true, secrets: ["OPENAI_API_KEY"] },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
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
