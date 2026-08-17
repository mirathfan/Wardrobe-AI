import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger, setLogContext, tracedHandler } from "../../shared/logger";
import { redactUid } from "../../shared/rateLimit";
import {
  normalizeOutfitGenerationInput,
  retrieveOutfitGenerationContext,
  type RetrieveOutfitContextDeps,
} from "./outfitContext";
import { generateValidatedOutfitsFromContext } from "./outfitGeneration";
import {
  outfitStyleMemoryContextFromResponse,
  retrieveStyleMemoryContextForUser,
  type RetrieveStyleMemoryDeps,
} from "./styleMemory";
import { safeRecordAuraMetricEvent } from "./metrics";
import type {
  NormalizedOutfitGenerationInput,
  OutfitGenerationContext,
  OutfitRecommendationResponse,
  OutfitValidationWarning,
  ValidatedOutfit,
} from "./outfitTypes";

const LOG_PREFIX = "[AURA_OUTFIT_GENERATION]";

function requireAuthUid(uid: string | undefined): string {
  if (!uid) throw new HttpsError("unauthenticated", "Please sign in first.");
  return uid;
}

export type OutfitCallableDeps = RetrieveOutfitContextDeps & RetrieveStyleMemoryDeps & {
  retrieveContext?: (uid: string, input: NormalizedOutfitGenerationInput) => Promise<OutfitGenerationContext>;
  retrieveStyleMemory?: (uid: string, input: NormalizedOutfitGenerationInput) => Promise<OutfitGenerationContext["styleMemory"]>;
  generateValidatedOutfits?: (args: {
    input: NormalizedOutfitGenerationInput;
    context: OutfitGenerationContext;
  }) => Promise<{
    outfits: ValidatedOutfit[];
    validationErrors: string[];
    validationWarnings: OutfitValidationWarning[];
    repaired: boolean;
  }>;
};

async function contextFor(uid: string, input: NormalizedOutfitGenerationInput, deps: OutfitCallableDeps) {
  return deps.retrieveContext
    ? deps.retrieveContext(uid, input)
    : retrieveOutfitGenerationContext(uid, input, deps);
}

async function styleMemoryFor(uid: string, input: NormalizedOutfitGenerationInput, deps: OutfitCallableDeps) {
  if (!input.useStyleMemory) return null;
  if (deps.retrieveStyleMemory) return deps.retrieveStyleMemory(uid, input);
  const response = await retrieveStyleMemoryContextForUser(uid, {
    query: input.query,
    occasion: input.occasion,
    formality: input.formality,
    limit: 8,
  }, deps);
  return outfitStyleMemoryContextFromResponse(response);
}

function assertMinimumContext(context: OutfitGenerationContext) {
  if (context.diagnostics.missingRequiredRoles.length) {
    throw new HttpsError("failed-precondition", "Not enough ready closet items to generate a complete outfit.", {
      missingRequiredRoles: context.diagnostics.missingRequiredRoles,
      candidateCounts: context.diagnostics.candidateCounts,
    });
  }
}

function averageScore(outfits: ValidatedOutfit[], key: "total" | "stylePreferenceFit") {
  const values = outfits
    .map((outfit) => Number(outfit.scoreBreakdown?.[key] ?? 0))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3));
}

function errorCode(error: unknown) {
  if (error instanceof HttpsError) return error.code;
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string") {
    return String((error as { code?: unknown }).code);
  }
  return "internal";
}

export async function handlePreviewOutfitGenerationContext(
  uid: string | undefined,
  data: unknown,
  deps: OutfitCallableDeps = {},
) {
  const userId = requireAuthUid(uid);
  const input = normalizeOutfitGenerationInput(data);
  const context = await contextFor(userId, input, deps);
  return {
    query: input.query,
    retrievalPlan: context.retrievalPlan,
    candidates: context.candidates,
    diagnostics: context.diagnostics,
  };
}

export async function handleGenerateOutfitRecommendations(
  uid: string | undefined,
  data: unknown,
  deps: OutfitCallableDeps = {},
): Promise<OutfitRecommendationResponse> {
  const userId = requireAuthUid(uid);
  const input = normalizeOutfitGenerationInput(data);
  try {
    const context = await contextFor(userId, input, deps);
    const styleMemory = await styleMemoryFor(userId, input, deps);
    const contextWithMemory = styleMemory ? { ...context, styleMemory } : context;
    assertMinimumContext(context);
    const generated = deps.generateValidatedOutfits
      ? await deps.generateValidatedOutfits({ input, context: contextWithMemory })
      : await generateValidatedOutfitsFromContext(input, contextWithMemory);
    await safeRecordAuraMetricEvent(userId, {
      type: "outfit_generation_completed",
      requestedCount: input.count,
      returnedCount: generated.outfits.length,
      averageOutfitScore: averageScore(generated.outfits, "total"),
      averageStylePreferenceFit: averageScore(generated.outfits, "stylePreferenceFit"),
      validationFailureCount: generated.validationErrors.length + generated.validationWarnings.length,
      repaired: generated.repaired,
    });
    return {
      query: input.query,
      retrievalPlan: contextWithMemory.retrievalPlan,
      outfits: generated.outfits,
      ...(input.includeDiagnostics
        ? {
          diagnostics: {
            context: context.diagnostics,
            styleMemory,
            validationErrors: generated.validationErrors,
            validationWarnings: generated.validationWarnings,
            repaired: generated.repaired,
          },
        }
        : {}),
    };
  } catch (error) {
    await safeRecordAuraMetricEvent(userId, {
      type: "outfit_generation_failed",
      requestedCount: input.count,
      code: errorCode(error),
      zeroValidOutfits: errorCode(error) === "failed-precondition",
      timeout: errorCode(error) === "deadline-exceeded",
    });
    throw error;
  }
}

export const previewOutfitGenerationContext = onCall(
  { secrets: ["OPENAI_API_KEY"], timeoutSeconds: 120 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    logger.info(`${LOG_PREFIX} context preview started`, { uidHash: redactUid(uid) });
    const response = await handlePreviewOutfitGenerationContext(uid, request.data);
    logger.info(`${LOG_PREFIX} context preview success`, {
      uidHash: redactUid(uid),
      query: response.query,
      missingRequiredRoles: response.diagnostics.missingRequiredRoles,
    });
    return response;
  }),
);

export const generateOutfitRecommendations = onCall(
  { secrets: ["OPENAI_API_KEY"], timeoutSeconds: 240 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    logger.info(`${LOG_PREFIX} generation started`, { uidHash: redactUid(uid) });
    const response = await handleGenerateOutfitRecommendations(uid, request.data);
    logger.info(`${LOG_PREFIX} generation success`, {
      uidHash: redactUid(uid),
      query: response.query,
      outfitCount: response.outfits.length,
    });
    return response;
  }),
);
