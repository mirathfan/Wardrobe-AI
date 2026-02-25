import { onRequest } from "firebase-functions/v2/https";
import { parseOutfitIntentFromPrompt } from "./parseOutfitIntent";
export { ingestItemFromPhotos } from "./ingestItemFromPhotos";

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
