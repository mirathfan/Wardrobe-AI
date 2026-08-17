import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger, setLogContext, tracedHandler } from "./shared/logger";
import { getStorage } from "firebase-admin/storage";
import OpenAI, { toFile } from "openai";

import {
  RATE_LIMITS,
  assertFunctionRateLimit,
  redactUid,
} from "./shared/rateLimit";
import { requireOpenAiApiKey } from "./shared/env";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

function customError(
  code: "invalid-argument" | "permission-denied" | "resource-exhausted" | "internal" | "unauthenticated",
  customCode: string,
  message: string,
) {
  return new HttpsError(code, message, { code: customCode });
}

function isAllowedAudioContentType(value: string | null | undefined) {
  const contentType = String(value ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return contentType.startsWith("audio/") || contentType === "video/mp4";
}

export const transcribeAuraAudio = onCall(
  { secrets: ["OPENAI_API_KEY"] },
  tracedHandler(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw customError("unauthenticated", "unauthorized", "User must be signed in.");
    }
    await assertFunctionRateLimit(uid, "voiceTranscription", RATE_LIMITS.voiceTranscription);
    const uidHash = redactUid(uid);
    setLogContext({ uidHash });

    const storagePath = String(request.data?.storagePath ?? "").trim();
    const requestedMimeType = String(request.data?.mimeType ?? "").trim() || null;
    const durationMs = Number(request.data?.durationMs ?? request.data?.duration ?? 0);
    const prefix = `users/${uid}/tmp/transcription/`;
    if (!storagePath || !storagePath.startsWith(prefix)) {
      throw customError("invalid-argument", "invalid_path", "Invalid transcription path.");
    }
    const fileName = storagePath.slice(prefix.length);
    if (!/^[A-Za-z0-9._-]+\.m4a$/i.test(fileName)) {
      throw customError("invalid-argument", "invalid_path", "Invalid transcription path.");
    }

    const file = getStorage().bucket().file(storagePath);
    try {
      const [metadata] = await file.getMetadata().catch((error) => {
        logger.warn("[AURA_TRANSCRIBE] temp audio metadata read failed", {
          uidHash,
          hasStoragePath: !!storagePath,
          error: error instanceof Error ? error.message : String(error),
        });
        throw customError("invalid-argument", "invalid_path", "Audio file was not found.");
      });
      const size = Number(metadata.size ?? 0);
      if (!Number.isFinite(size) || size <= 0) {
        throw customError("invalid-argument", "unsupported_format", "Audio file is empty.");
      }
      if (size > MAX_AUDIO_BYTES) {
        throw customError("resource-exhausted", "too_large", "Audio file is too large.");
      }
      const contentType = String(metadata.contentType || requestedMimeType || "");
      if (!isAllowedAudioContentType(contentType)) {
        throw customError("invalid-argument", "unsupported_format", "Audio format is not supported.");
      }

      const [buffer] = await file.download();
      logger.info("[AURA_TRANSCRIBE] temp audio downloaded", {
        uidHash,
        hasStoragePath: !!storagePath,
        size,
        contentType,
        durationMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : null,
      });

      const client = new OpenAI({ apiKey: requireOpenAiApiKey() });
      const transcript = await client.audio.transcriptions.create({
        model: "gpt-4o-mini-transcribe",
        file: await toFile(buffer, "aura-audio.m4a", { type: contentType }),
      });
      const text = String(transcript.text ?? "").trim();
      logger.info("[AURA_TRANSCRIBE] transcription complete", {
        uidHash,
        hasStoragePath: !!storagePath,
        transcriptLength: text.length,
      });

      return { transcript: text };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("[AURA_TRANSCRIBE] transcription failed", {
        uidHash,
        hasStoragePath: !!storagePath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw customError("internal", "transcription_failed", "Unable to transcribe audio.");
    } finally {
      await file.delete().catch((error) => {
        if ((error as { code?: unknown })?.code === 404) return;
        logger.warn("[AURA_TRANSCRIBE] temp audio delete failed", {
          uidHash,
          hasStoragePath: !!storagePath,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }),
);
