import type { AuraChatIntent } from "@/src/lib/auraChatHelpers";
import type {
  AuraAgentFeedbackType,
  AuraAgentOutfit,
  AuraAgentOutfitActionState,
  AuraAgentRequest,
  AuraAgentResponse,
  AuraAgentSuggestedAction,
} from "@/src/types/auraAgent";
import type { AuraLook } from "@/src/types/aura";
import { extractRequestedOutfitCount } from "@/src/lib/auraAgentCount";

export { extractRequestedOutfitCount } from "@/src/lib/auraAgentCount";

const VALID_AGENT_MODES = new Set([
  "auto",
  "generate_outfit",
  "refine_outfit",
  "explain_outfit",
  "feedback",
  "unknown",
]);
const VALID_FEEDBACK_TYPES = new Set<AuraAgentFeedbackType>([
  "like",
  "dislike",
  "save",
  "wear",
  "not_my_vibe",
  "more_like_this",
  "less_like_this",
  "too_formal",
  "too_casual",
  "more_formal",
  "more_casual",
  "more_streetwear",
  "less_streetwear",
  "more_color",
  "less_color",
  "prefer_item",
  "avoid_item",
  "manual_note",
]);
const EXPLANATION_RE =
  /\b(?:explain|why|rationale|reason|break\s+down|what\s+makes)\b/i;
const FEEDBACK_RE =
  /\b(?:remember|feedback|liked|loved|disliked|hate|not\s+my\s+vibe|more\s+like\s+this|less\s+like\s+this|save\s+as\s+preference|wore\s+this|wear\s+this)\b/i;

export type AuraAgentActionStateKey =
  | "saved"
  | "worn"
  | "planned"
  | "moreLikeThis"
  | "notMyVibe";

type RouteInput = {
  enabled: boolean;
  prompt: string;
  attachmentCount: number;
  chatIntent: AuraChatIntent;
  hasPreviousOutfit?: boolean;
};

export function shouldRouteToAuraStylingAgent({
  enabled,
  prompt,
  attachmentCount,
  chatIntent,
  hasPreviousOutfit,
}: RouteInput) {
  const text = String(prompt ?? "").trim();
  if (!enabled || !text || attachmentCount > 0) return false;
  if (
    chatIntent === "GENERATE_OUTFIT" ||
    chatIntent === "GENERATE_MORE" ||
    chatIntent === "STYLE_EXISTING" ||
    chatIntent === "MODIFY_OUTFIT"
  ) {
    return true;
  }
  if (hasPreviousOutfit && (EXPLANATION_RE.test(text) || FEEDBACK_RE.test(text))) return true;
  return false;
}

export function firstAuraAgentOutfit(response?: AuraAgentResponse | null) {
  return response?.outfits?.[0] ?? null;
}

export function findAuraAgentOutfitById(
  response: AuraAgentResponse | null | undefined,
  outfitId: string | null | undefined,
) {
  if (!outfitId) return null;
  return response?.outfits?.find((outfit) => outfit.outfitId === outfitId) ?? null;
}

function referencedOutfitIndex(text: string) {
  const normalized = String(text ?? "").toLowerCase();
  const numeric = normalized.match(/\b(?:outfit|look|option|fit)\s*(\d{1,2})\b/);
  if (numeric) return Number(numeric[1]) - 1;
  if (/\b(?:first|1st)\s+(?:one|outfit|look|option|fit)\b|\b(?:outfit|look|option|fit)\s+(?:one|first|1st)\b/.test(normalized)) {
    return 0;
  }
  if (/\b(?:second|2nd)\s+(?:one|outfit|look|option|fit)\b|\b(?:outfit|look|option|fit)\s+(?:two|second|2nd)\b/.test(normalized)) {
    return 1;
  }
  if (/\b(?:third|3rd)\s+(?:one|outfit|look|option|fit)\b|\b(?:outfit|look|option|fit)\s+(?:three|third|3rd)\b/.test(normalized)) {
    return 2;
  }
  return null;
}

export function resolveReferencedOutfit(
  text: string,
  response?: AuraAgentResponse | null,
  selectedOutfit?: AuraAgentOutfit | null,
) {
  const outfits = response?.outfits ?? [];
  const index = referencedOutfitIndex(text);
  if (index != null && index >= 0 && index < outfits.length) return outfits[index] ?? null;
  if (selectedOutfit && outfits.some((outfit) => outfit.outfitId === selectedOutfit.outfitId)) {
    return selectedOutfit;
  }
  return selectedOutfit ?? outfits[0] ?? null;
}

export function auraAgentOutfitItemIds(outfit?: AuraAgentOutfit | null) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of outfit?.items ?? []) {
    const itemId = String(item.itemId ?? "").trim();
    if (!itemId || seen.has(itemId)) continue;
    seen.add(itemId);
    out.push(itemId);
  }
  return out;
}

export function buildAgentPreviousOutfit(outfit: AuraAgentOutfit): Record<string, unknown> {
  return {
    outfitId: outfit.outfitId,
    title: outfit.title,
    vibe: outfit.vibe,
    occasion: outfit.occasion,
    formality: outfit.formality,
    items: outfit.items.map((item) => ({
      itemId: item.itemId,
      name: item.name,
      role: item.role,
      allowedRole: item.allowedRole,
      category: item.category,
      subcategory: item.subcategory,
      colors: item.colors,
      imageUrl: item.imageUrl,
      reason: item.reason,
    })),
    explanation: outfit.explanation,
    stylingTips: outfit.stylingTips,
    missingItems: outfit.missingItems,
  };
}

export function buildAgentPreviousOutfitFromAuraLook(look: AuraLook): Record<string, unknown> {
  return {
    outfitId: look.id ?? undefined,
    title: look.lookTitle,
    vibe: look.vibe,
    occasion: look.occasion ?? undefined,
    items: (look.pieces ?? []).map((piece) => ({
      itemId: piece.itemId ?? undefined,
      name: piece.itemName,
      role: piece.role === "shoes" ? "footwear" : piece.role,
      category: piece.role === "shoes" ? "footwear" : piece.role,
      imageUrl: piece.imageUrl ?? undefined,
      reason: look.shortExplanation || look.stylingNote || "",
    })),
    explanation: look.shortExplanation,
    stylingTips: look.stylingNote ? [look.stylingNote] : [],
    missingItems: look.addToComplete ?? [],
  };
}

function cleanText(value: unknown, fallback = "") {
  return String(value ?? fallback).trim() || fallback;
}

function isAuraAgentMode(value: unknown): value is NonNullable<AuraAgentRequest["mode"]> {
  return VALID_AGENT_MODES.has(cleanText(value).toLowerCase());
}

function isAuraAgentFeedbackType(value: unknown): value is AuraAgentFeedbackType {
  return VALID_FEEDBACK_TYPES.has(cleanText(value).toLowerCase() as AuraAgentFeedbackType);
}

function feedbackTypeFromAction(action: AuraAgentSuggestedAction): AuraAgentFeedbackType | undefined {
  const payloadFeedbackType = action.payload?.feedbackType;
  if (isAuraAgentFeedbackType(payloadFeedbackType)) return payloadFeedbackType;
  const normalized = `${action.id} ${action.label}`.toLowerCase();
  if (/\bwear|wore|worn\b/.test(normalized)) return "wear";
  if (/\bsave|saved|preference\b/.test(normalized)) return "save";
  if (/\bmore\s+like\b/.test(normalized)) return "more_like_this";
  if (/\bless\s+like\b/.test(normalized)) return "less_like_this";
  if (/\bnot\s+my\s+vibe\b/.test(normalized)) return "not_my_vibe";
  if (/\blike|love\b/.test(normalized)) return "like";
  if (/\bdislike|hate\b/.test(normalized)) return "dislike";
  return undefined;
}

export function auraAgentFeedbackTypeFromAction(
  action: AuraAgentSuggestedAction,
): AuraAgentFeedbackType | undefined {
  return feedbackTypeFromAction(action);
}

export function auraAgentActionStateKey(
  action: AuraAgentSuggestedAction,
): AuraAgentActionStateKey | null {
  const feedbackType = feedbackTypeFromAction(action);
  if (action.payload?.action === "plan_outfit") return "planned";
  if (feedbackType === "save") return "saved";
  if (feedbackType === "wear") return "worn";
  if (feedbackType === "more_like_this") return "moreLikeThis";
  if (feedbackType === "not_my_vibe" || feedbackType === "dislike") return "notMyVibe";
  return null;
}

export function auraAgentActionSuccessPatch(
  action: AuraAgentSuggestedAction,
  extra: Partial<AuraAgentOutfitActionState> = {},
): Partial<AuraAgentOutfitActionState> {
  const key = auraAgentActionStateKey(action);
  if (!key) return { updatedAt: Date.now(), ...extra };
  return { [key]: true, updatedAt: Date.now(), ...extra };
}

export function decorateAuraAgentActionForState(
  action: AuraAgentSuggestedAction,
  state?: AuraAgentOutfitActionState | null,
): AuraAgentSuggestedAction {
  if (!state) return action;
  const key = auraAgentActionStateKey(action);
  if (key === "saved" && state.saved) return { ...action, label: "Saved", disabled: true };
  if (key === "worn" && state.worn) return { ...action, label: "Worn", disabled: true };
  if (key === "planned" && state.planned) return { ...action, label: "Planned", disabled: true };
  if (key === "moreLikeThis" && state.moreLikeThis) {
    return { ...action, label: "Preference saved", disabled: true };
  }
  if (key === "notMyVibe" && state.notMyVibe) return { ...action, label: "Noted", disabled: true };
  return action;
}

export function buildAuraAgentActionRequest({
  action,
  outfit,
  fallbackQuery,
}: {
  action: AuraAgentSuggestedAction;
  outfit?: AuraAgentOutfit | null;
  fallbackQuery?: string | null;
}): AuraAgentRequest | null {
  if (action.type === "debug" && !__DEV__) return null;
  const payload = action.payload ?? {};
  const payloadMode = payload.mode;
  const mode = isAuraAgentMode(payloadMode)
    ? payloadMode
    : action.type === "refine"
      ? "refine_outfit"
      : action.type === "explain"
        ? "explain_outfit"
        : action.type === "feedback"
          ? "feedback"
          : action.type === "generate"
            ? "generate_outfit"
            : "auto";
  const query = cleanText(payload.query, cleanText(fallbackQuery, action.label));
  const previousOutfit = outfit ? buildAgentPreviousOutfit(outfit) : undefined;
  const selectedItemIds = auraAgentOutfitItemIds(outfit);
  const feedbackType = mode === "feedback" ? feedbackTypeFromAction(action) : undefined;

  if (mode === "feedback" && (!previousOutfit || !feedbackType)) return null;
  if ((mode === "refine_outfit" || mode === "explain_outfit") && !previousOutfit) return null;

  return {
    mode,
    query,
    previousOutfit,
    outfitId: outfit?.outfitId,
    feedbackType,
    selectedItemIds,
    useStyleMemory: true,
  };
}

export function buildAuraAgentInitialRequest({
  prompt,
  chatIntent,
  previousAgentOutfit,
  previousAuraLook,
  selectedItemIds,
}: {
  prompt: string;
  chatIntent: AuraChatIntent;
  previousAgentOutfit?: AuraAgentOutfit | null;
  previousAuraLook?: AuraLook | null;
  selectedItemIds?: string[];
}): AuraAgentRequest {
  const previousOutfit = previousAgentOutfit
    ? buildAgentPreviousOutfit(previousAgentOutfit)
    : previousAuraLook
      ? buildAgentPreviousOutfitFromAuraLook(previousAuraLook)
      : undefined;
  const text = String(prompt ?? "").trim();
  const requestedCount = extractRequestedOutfitCount(text);
  const mode =
    EXPLANATION_RE.test(text) && previousOutfit
      ? "explain_outfit"
      : FEEDBACK_RE.test(text) && previousOutfit
        ? "feedback"
        : chatIntent === "STYLE_EXISTING" || chatIntent === "MODIFY_OUTFIT" || chatIntent === "GENERATE_MORE"
          ? "refine_outfit"
          : "generate_outfit";

  return {
    mode,
    query: text,
    count: requestedCount ?? (chatIntent === "GENERATE_MORE" ? 3 : 1),
    previousOutfit,
    outfitId:
      previousAgentOutfit?.outfitId ??
      (previousAuraLook?.id ? String(previousAuraLook.id) : undefined),
    feedbackType: mode === "feedback" ? feedbackTypeFromAction({
      id: "prompt-feedback",
      label: text,
      type: "feedback",
    }) ?? "like" : undefined,
    selectedItemIds,
    useStyleMemory: true,
  };
}
