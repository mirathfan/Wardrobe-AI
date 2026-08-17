import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger, setLogContext, tracedHandler } from "../../shared/logger";
import { redactUid } from "../../shared/rateLimit";
import { runAuraStylingAgentGraph } from "./agentGraph";
import { safeRecordAuraMetricEvent } from "./metrics";
import type { AuraAgentDeps } from "./agentNodes";
import type {
  AuraStylingAgentRequest,
  AuraStylingAgentResponse,
} from "./agentTypes";

const LOG_PREFIX = "[AURA_STYLING_AGENT]";

function requireAuthUid(uid: string | undefined): string {
  if (!uid) throw new HttpsError("unauthenticated", "Please sign in first.");
  return uid;
}

function cleanText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value.map(cleanText).filter(Boolean);
  return result.length ? result : undefined;
}

function stringArrayCapped(value: unknown, limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of Array.isArray(value) ? value : []) {
    const text = cleanText(entry).slice(0, 300);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function normalizeConversationContext(value: unknown): AuraStylingAgentRequest["conversationContext"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const recentTurns = Array.isArray(record.recentTurns)
    ? record.recentTurns.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const turn = entry as Record<string, unknown>;
      const role = cleanText(turn.role).toLowerCase();
      const text = cleanText(turn.text).slice(0, 1200);
      if ((role !== "user" && role !== "assistant") || !text) return [];
      return [{ role: role as "user" | "assistant", text }];
    }).slice(-8)
    : [];
  const priorOutfitRefs = Array.isArray(record.priorOutfitRefs)
    ? record.priorOutfitRefs.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const outfit = entry as Record<string, unknown>;
      const itemIds = stringArrayCapped(outfit.itemIds, 8);
      const outfitId = cleanText(outfit.outfitId).slice(0, 180);
      const title = cleanText(outfit.title).slice(0, 120);
      if (!outfitId && !title && !itemIds.length) return [];
      return [{
        ...(outfitId ? { outfitId } : {}),
        ...(cleanText(outfit.sourceMessageId) ? { sourceMessageId: cleanText(outfit.sourceMessageId).slice(0, 180) } : {}),
        ...(Number.isFinite(Number(outfit.index)) ? { index: Number(outfit.index) } : {}),
        ...(title ? { title } : {}),
        ...(cleanText(outfit.occasion) ? { occasion: cleanText(outfit.occasion).slice(0, 80) } : {}),
        ...(cleanText(outfit.formality) ? { formality: cleanText(outfit.formality).slice(0, 80) } : {}),
        ...(cleanText(outfit.vibe) ? { vibe: cleanText(outfit.vibe).slice(0, 160) } : {}),
        itemIds,
        ...(cleanText(outfit.summary) ? { summary: cleanText(outfit.summary).slice(0, 700) } : {}),
      }];
    }).slice(-8)
    : [];
  const selectedOutfitId = cleanText(record.selectedOutfitId).slice(0, 180);
  const selectedItemIds = stringArrayCapped(record.selectedItemIds, 12);
  const feedbackSignals = stringArrayCapped(record.feedbackSignals, 12);
  if (!recentTurns.length && !priorOutfitRefs.length && !selectedOutfitId && !selectedItemIds.length && !feedbackSignals.length) {
    return undefined;
  }
  return {
    recentTurns,
    priorOutfitRefs,
    ...(selectedOutfitId ? { selectedOutfitId } : {}),
    selectedItemIds,
    feedbackSignals,
  };
}

function normalizeRequest(data: unknown): AuraStylingAgentRequest {
  const record = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const previousOutfit = record.previousOutfit && typeof record.previousOutfit === "object" && !Array.isArray(record.previousOutfit)
    ? record.previousOutfit as Record<string, unknown>
    : undefined;
  return {
    query: cleanText(record.query),
    mode: cleanText(record.mode) as AuraStylingAgentRequest["mode"],
    count: Number.isFinite(Number(record.count)) ? Number(record.count) : undefined,
    occasion: cleanText(record.occasion) || undefined,
    weather: cleanText(record.weather) || undefined,
    formality: cleanText(record.formality) as AuraStylingAgentRequest["formality"],
    preferredColors: stringArray(record.preferredColors),
    requiredColors: stringArray(record.requiredColors),
    requiredCategories: stringArray(record.requiredCategories),
    useStyleMemory: record.useStyleMemory !== false,
    includeDiagnostics: record.includeDiagnostics === true,
    previousOutfit,
    outfitId: cleanText(record.outfitId) || undefined,
    feedbackType: cleanText(record.feedbackType) as AuraStylingAgentRequest["feedbackType"],
    selectedItemIds: stringArray(record.selectedItemIds),
    conversationContext: normalizeConversationContext(record.conversationContext),
    note: cleanText(record.note) || undefined,
  };
}

function errorCode(error: unknown): string {
  if (error instanceof HttpsError) return error.code;
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string") {
    return String((error as { code?: unknown }).code);
  }
  return "internal";
}

function responseForClient(
  response: AuraStylingAgentResponse,
  includeDiagnostics: boolean | undefined,
): AuraStylingAgentResponse {
  if (includeDiagnostics) return response;
  const rest = { ...response };
  delete rest.diagnostics;
  return rest;
}

export async function handleRunAuraStylingAgent(
  uid: string | undefined,
  data: unknown,
  deps: AuraAgentDeps = {},
): Promise<AuraStylingAgentResponse> {
  const userId = requireAuthUid(uid);
  return runAuraStylingAgentGraph(userId, normalizeRequest(data), deps);
}

export const runAuraStylingAgent = onCall(
  { secrets: ["OPENAI_API_KEY"], timeoutSeconds: 240 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    logger.info(`${LOG_PREFIX} started`, { uidHash: redactUid(uid) });
    const normalized = normalizeRequest(request.data);
    const startedAt = Date.now();
    try {
      const response = await runAuraStylingAgentGraph(uid, {
        ...normalized,
        includeDiagnostics: true,
      });
      const diagnostics = response.diagnostics;
      await safeRecordAuraMetricEvent(uid, {
        type: "agent_run_completed",
        mode: response.mode,
        durationMs: Date.now() - startedAt,
        runner: diagnostics?.runner,
        nodeTimings: diagnostics?.nodeTimings,
      });
      if (response.outfits?.length) {
        await safeRecordAuraMetricEvent(uid, {
          type: "outfit_generation_completed",
          requestedCount: response.requestedCount ?? normalized.count,
          returnedCount: response.outfits.length,
          averageOutfitScore: response.outfits.reduce((sum, outfit) => sum + Number(outfit.scoreBreakdown?.total ?? 0), 0) / response.outfits.length,
          averageStylePreferenceFit: response.outfits.reduce((sum, outfit) => sum + Number(outfit.scoreBreakdown?.stylePreferenceFit ?? 0), 0) / response.outfits.length,
          validationFailureCount: (diagnostics?.validationErrors?.length ?? 0) + (diagnostics?.validationWarnings?.length ?? 0),
          repaired: diagnostics?.repaired === true,
        });
      }
      logger.info(`${LOG_PREFIX} success`, {
        uidHash: redactUid(uid),
        mode: response.mode,
        outfitCount: response.outfits?.length ?? 0,
      });
      return responseForClient(response, normalized.includeDiagnostics);
    } catch (error) {
      await safeRecordAuraMetricEvent(uid, {
        type: "agent_run_failed",
        mode: normalized.mode === "auto" ? "unknown" : normalized.mode,
        code: errorCode(error),
        timeout: errorCode(error) === "deadline-exceeded",
        fallback: /fallback/i.test(error instanceof Error ? error.message : String(error)),
      });
      logger.error(`${LOG_PREFIX} failed`, {
        uidHash: redactUid(uid),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }),
);
