import { HttpsError, onCall } from "firebase-functions/v2/https";
import OpenAI, { toFile } from "openai";

export const transcribeAuraAudio = onCall(
  { secrets: ["OPENAI_API_KEY"] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be signed in.");
    }

    const audioUrl = String(request.data?.audioUrl ?? "").trim();
    if (!audioUrl) {
      throw new HttpsError("invalid-argument", "Audio URL is required.");
    }

    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new HttpsError("invalid-argument", "Unable to read audio attachment.");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const transcript = await client.audio.transcriptions.create({
      model: "gpt-4o-mini-transcribe",
      file: await toFile(buffer, "aura-audio.m4a", { type: "audio/mp4" }),
    });

    return {
      ok: true,
      transcript: String(transcript.text ?? "").trim(),
    };
  }
);
