import { doc, getDoc, setDoc } from "firebase/firestore";

import type { ChatOutfit } from "@/src/components/ai/chatTypes";
import { db } from "@/src/lib/firebase";
import type { ClothingItem } from "@/src/types/ClothingItem";

export type AssistantProfileMain = {
  preferredColors: string[];
  dislikedColors: string[];
  preferredStyles: string[];
  dislikedStyles: string[];
  favoriteCategories: string[];
  avoidedCategories: string[];
  brandAffinity: string[];
  notes: string[];
  mostWornItemIds: string[];
  leastWornItemIds: string[];
  recentRejectedSignals: string[];
  updatedAt: number;
};

export type AssistantProfileBehavior = {
  colorScores: Record<string, number>;
  styleScores: Record<string, number>;
  categoryScores: Record<string, number>;
  brandScores: Record<string, number>;
  itemScores: Record<string, number>;
  notes: string[];
  recentRejectedSignals: string[];
  updatedAt: number;
};

export type AssistantMemoryAction =
  | "save_outfit"
  | "wear_item"
  | "more_like_this"
  | "swap_item"
  | "reject";

export type AssistantMemorySignal = {
  positiveColors?: string[];
  negativeColors?: string[];
  positiveStyles?: string[];
  negativeStyles?: string[];
  positiveCategories?: string[];
  negativeCategories?: string[];
  positiveBrands?: string[];
  negativeBrands?: string[];
  positiveItemIds?: string[];
  negativeItemIds?: string[];
  notes?: string[];
  rejectedSignals?: string[];
};

const MAIN_DOC_ID = "main";
const BEHAVIOR_DOC_ID = "behavior";

function profileDocRef(uid: string, docId: string) {
  return doc(db, "users", uid, "assistantProfile", docId);
}

function normalizeToken(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function uniqueStrings(values: unknown[], limit = 8) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const normalized = normalizeToken(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    next.push(normalized);
    if (next.length >= limit) break;
  }
  return next;
}

function uniqueIds(values: unknown[], limit = 8) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    next.push(normalized);
    if (next.length >= limit) break;
  }
  return next;
}

function normalizeNotes(values: unknown[], limit = 8) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    next.push(normalized);
    if (next.length >= limit) break;
  }
  return next;
}

function clampScore(value: number) {
  return Math.max(-12, Math.min(12, value));
}

function normalizeScoreMap(value: unknown) {
  if (!value || typeof value !== "object") return {} as Record<string, number>;
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, raw]) => [normalizeToken(key), Number(raw)] as const)
    .filter(([key, score]) => key && Number.isFinite(score));
  return Object.fromEntries(entries) as Record<string, number>;
}

function normalizeIdScoreMap(value: unknown) {
  if (!value || typeof value !== "object") return {} as Record<string, number>;
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, raw]) => [String(key ?? "").trim(), Number(raw)] as const)
    .filter(([key, score]) => key && Number.isFinite(score));
  return Object.fromEntries(entries) as Record<string, number>;
}

function adjustScores(
  existing: Record<string, number>,
  keys: string[] | undefined,
  delta: number
) {
  return adjustScoresWith(existing, keys, delta, (value) => normalizeToken(value));
}

function adjustScoresWith(
  existing: Record<string, number>,
  keys: string[] | undefined,
  delta: number,
  normalize: (value: string) => string
) {
  const next = {...existing};
  const seen = new Set<string>();
  for (const value of keys ?? []) {
    const key = normalize(String(value ?? "").trim());
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next[key] = clampScore((next[key] ?? 0) + delta);
  }
  return next;
}

function topByScore(
  map: Record<string, number>,
  mode: "positive" | "negative",
  limit = 5
) {
  const entries = Object.entries(map).filter(([, score]) =>
    mode === "positive" ? score > 0 : score < 0
  );
  entries.sort((a, b) =>
    mode === "positive" ? b[1] - a[1] : a[1] - b[1]
  );
  return entries.slice(0, limit).map(([key]) => key);
}

function emptyMain(): AssistantProfileMain {
  return {
    preferredColors: [],
    dislikedColors: [],
    preferredStyles: [],
    dislikedStyles: [],
    favoriteCategories: [],
    avoidedCategories: [],
    brandAffinity: [],
    notes: [],
    mostWornItemIds: [],
    leastWornItemIds: [],
    recentRejectedSignals: [],
    updatedAt: 0,
  };
}

function emptyBehavior(): AssistantProfileBehavior {
  return {
    colorScores: {},
    styleScores: {},
    categoryScores: {},
    brandScores: {},
    itemScores: {},
    notes: [],
    recentRejectedSignals: [],
    updatedAt: 0,
  };
}

function parseMain(value: unknown): AssistantProfileMain {
  if (!value || typeof value !== "object") return emptyMain();
  const raw = value as Record<string, unknown>;
  return {
    preferredColors: uniqueStrings(Array.isArray(raw.preferredColors) ? raw.preferredColors : []),
    dislikedColors: uniqueStrings(Array.isArray(raw.dislikedColors) ? raw.dislikedColors : []),
    preferredStyles: uniqueStrings(Array.isArray(raw.preferredStyles) ? raw.preferredStyles : []),
    dislikedStyles: uniqueStrings(Array.isArray(raw.dislikedStyles) ? raw.dislikedStyles : []),
    favoriteCategories: uniqueStrings(Array.isArray(raw.favoriteCategories) ? raw.favoriteCategories : []),
    avoidedCategories: uniqueStrings(Array.isArray(raw.avoidedCategories) ? raw.avoidedCategories : []),
    brandAffinity: uniqueStrings(Array.isArray(raw.brandAffinity) ? raw.brandAffinity : []),
    notes: normalizeNotes(Array.isArray(raw.notes) ? raw.notes : []),
    mostWornItemIds: uniqueIds(Array.isArray(raw.mostWornItemIds) ? raw.mostWornItemIds : [], 10),
    leastWornItemIds: uniqueIds(Array.isArray(raw.leastWornItemIds) ? raw.leastWornItemIds : [], 10),
    recentRejectedSignals: normalizeNotes(Array.isArray(raw.recentRejectedSignals) ? raw.recentRejectedSignals : []),
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
  };
}

function parseBehavior(value: unknown): AssistantProfileBehavior {
  if (!value || typeof value !== "object") return emptyBehavior();
  const raw = value as Record<string, unknown>;
  return {
    colorScores: normalizeScoreMap(raw.colorScores),
    styleScores: normalizeScoreMap(raw.styleScores),
    categoryScores: normalizeScoreMap(raw.categoryScores),
    brandScores: normalizeScoreMap(raw.brandScores),
    itemScores: normalizeIdScoreMap(raw.itemScores),
    notes: normalizeNotes(Array.isArray(raw.notes) ? raw.notes : []),
    recentRejectedSignals: normalizeNotes(Array.isArray(raw.recentRejectedSignals) ? raw.recentRejectedSignals : []),
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
  };
}

function actionWeight(action: AssistantMemoryAction) {
  switch (action) {
    case "wear_item":
      return {positive: 3, negative: -1};
    case "save_outfit":
      return {positive: 2, negative: -1};
    case "more_like_this":
      return {positive: 1, negative: -1};
    case "swap_item":
      return {positive: 0, negative: -1};
    case "reject":
      return {positive: 0, negative: -2};
    default:
      return {positive: 1, negative: -1};
  }
}

function deriveMainFromBehavior(
  behavior: AssistantProfileBehavior,
  existingMain: AssistantProfileMain
): AssistantProfileMain {
  return {
    preferredColors: topByScore(behavior.colorScores, "positive"),
    dislikedColors: topByScore(behavior.colorScores, "negative"),
    preferredStyles: topByScore(behavior.styleScores, "positive"),
    dislikedStyles: topByScore(behavior.styleScores, "negative"),
    favoriteCategories: topByScore(behavior.categoryScores, "positive"),
    avoidedCategories: topByScore(behavior.categoryScores, "negative"),
    brandAffinity: topByScore(behavior.brandScores, "positive"),
    notes: normalizeNotes([...behavior.notes, ...existingMain.notes]),
    mostWornItemIds: topByScore(behavior.itemScores, "positive", 8),
    leastWornItemIds: topByScore(behavior.itemScores, "negative", 8),
    recentRejectedSignals: normalizeNotes(behavior.recentRejectedSignals, 8),
    updatedAt: Date.now(),
  };
}

function extractColorSignals(item: ClothingItem) {
  return uniqueStrings([
    item.displayColor,
    ...(Array.isArray(item.displayColors) ? item.displayColors : []),
    item.primaryColor,
    ...(Array.isArray(item.colors) ? item.colors : []),
  ]);
}

export function buildSignalFromItem(item: ClothingItem): AssistantMemorySignal {
  return {
    positiveColors: extractColorSignals(item),
    positiveStyles: uniqueStrings([item.style, ...(Array.isArray(item.aestheticTags) ? item.aestheticTags : [])]),
    positiveCategories: uniqueStrings([item.subCategory, item.category, item.type]),
    positiveBrands: uniqueStrings([item.brand]),
    positiveItemIds: uniqueIds([item.id]),
  };
}

export function buildSignalFromOutfit(
  outfit: ChatOutfit,
  itemsById: Map<string, ClothingItem>
): AssistantMemorySignal {
  const items = outfit.picks
    .map((pick) => itemsById.get(pick.itemId))
    .filter((item): item is ClothingItem => !!item);
  return {
    positiveColors: uniqueStrings(items.flatMap((item) => extractColorSignals(item))),
    positiveStyles: uniqueStrings(
      items.flatMap((item) => [item.style, ...(Array.isArray(item.aestheticTags) ? item.aestheticTags : [])])
    ),
    positiveCategories: uniqueStrings(items.flatMap((item) => [item.subCategory, item.category, item.type])),
    positiveBrands: uniqueStrings(items.map((item) => item.brand)),
    positiveItemIds: uniqueIds(items.map((item) => item.id), 12),
    notes: normalizeNotes([outfit.reason], 4),
  };
}

export function buildSwapSignalFromOutfit(
  outfit: ChatOutfit,
  itemsById: Map<string, ClothingItem>,
  slot: string
): AssistantMemorySignal {
  const match = outfit.picks.find((pick) => pick.slot === slot);
  const item = match ? itemsById.get(match.itemId) : null;
  return {
    negativeColors: item ? extractColorSignals(item) : [],
    negativeStyles: item ? uniqueStrings([item.style, ...(Array.isArray(item.aestheticTags) ? item.aestheticTags : [])]) : [],
    negativeCategories: item ? uniqueStrings([slot, item.subCategory, item.category]) : uniqueStrings([slot]),
    negativeBrands: item ? uniqueStrings([item.brand]) : [],
    negativeItemIds: item ? uniqueIds([item.id]) : [],
    rejectedSignals: normalizeNotes([item ? `swap:${slot}:${item.id}` : `swap:${slot}`], 4),
  };
}

export async function loadAssistantProfile(uid: string) {
  const snap = await getDoc(profileDocRef(uid, MAIN_DOC_ID));
  return snap.exists() ? parseMain(snap.data()) : emptyMain();
}

export async function loadBehaviorProfile(uid: string) {
  const snap = await getDoc(profileDocRef(uid, BEHAVIOR_DOC_ID));
  return snap.exists() ? parseBehavior(snap.data()) : emptyBehavior();
}

export function buildCompactMemorySummary(
  main: AssistantProfileMain,
  behavior?: AssistantProfileBehavior | null
) {
  const parts: string[] = [];
  if (main.preferredColors.length) parts.push(`leans toward ${main.preferredColors.slice(0, 3).join(", ")}`);
  if (main.dislikedColors.length) parts.push(`tends to avoid ${main.dislikedColors.slice(0, 2).join(", ")}`);
  if (main.preferredStyles.length) parts.push(`usually likes ${main.preferredStyles.slice(0, 3).join(", ")} styling`);
  if (main.favoriteCategories.length) parts.push(`often responds well to ${main.favoriteCategories.slice(0, 3).join(", ")}`);
  if (main.brandAffinity.length) parts.push(`shows affinity for ${main.brandAffinity.slice(0, 3).join(", ")}`);
  if (main.recentRejectedSignals.length) parts.push(`recently rejected ${main.recentRejectedSignals.slice(0, 2).join("; ")}`);
  if (!parts.length && behavior && Object.keys(behavior.itemScores).length) {
    parts.push("has emerging preferences from saved and worn outfits");
  }
  return parts.length ? `Assistant memory: user ${parts.join("; ")}.` : "Assistant memory: no strong preference signal yet.";
}

function prettyToken(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function buildVisiblePreferenceHint(main: AssistantProfileMain) {
  if (main.preferredColors.length && main.preferredStyles.length) {
    return `You usually lean toward ${main.preferredColors.slice(0, 2).map(prettyToken).join(" and ")} with ${main.preferredStyles
      .slice(0, 2)
      .map(prettyToken)
      .join(" and ")} energy.`;
  }
  if (main.preferredColors.length) {
    return `You usually respond best to ${main.preferredColors.slice(0, 3).map(prettyToken).join(", ")} tones.`;
  }
  if (main.preferredStyles.length) {
    return `You usually prefer ${main.preferredStyles.slice(0, 2).map(prettyToken).join(" and ")} styling.`;
  }
  if (main.favoriteCategories.length) {
    return `You tend to come back to ${main.favoriteCategories.slice(0, 2).map(prettyToken).join(" and ")} pieces.`;
  }
  return null;
}

export function buildActionFeedback(
  action: "save_outfit" | "more_like_this" | "swap_item",
  main: AssistantProfileMain
) {
  const hint = buildVisiblePreferenceHint(main);
  if (action === "save_outfit") {
    return hint
      ? `Saved for today. I’ll treat this as a stronger signal that ${hint.charAt(0).toLowerCase()}${hint.slice(1)}`
      : "Saved for today. I’ll use this as a stronger signal for future styling suggestions.";
  }
  if (action === "more_like_this") {
    return hint
      ? `Noted. I’ll keep the same mood and push it closer to your taste. ${hint}`
      : "Noted. I’ll keep the same mood and refine the next look in that direction.";
  }
  return hint
    ? `Understood. I’ll move away from that piece and rebalance the look around what you usually prefer.`
    : "Understood. I’ll move away from that piece and rebalance the look.";
}

export async function updateAssistantMemoryFromAction(
  uid: string,
  action: AssistantMemoryAction,
  signal: AssistantMemorySignal
) {
  const {positive, negative} = actionWeight(action);
  const [existingMain, existingBehavior] = await Promise.all([
    loadAssistantProfile(uid),
    loadBehaviorProfile(uid),
  ]);

  const nextBehavior: AssistantProfileBehavior = {
    colorScores: {
      ...adjustScores(existingBehavior.colorScores, signal.positiveColors, positive),
      ...adjustScores(existingBehavior.colorScores, signal.negativeColors, negative),
    },
    styleScores: {
      ...adjustScores(existingBehavior.styleScores, signal.positiveStyles, positive),
      ...adjustScores(existingBehavior.styleScores, signal.negativeStyles, negative),
    },
    categoryScores: {
      ...adjustScores(existingBehavior.categoryScores, signal.positiveCategories, positive),
      ...adjustScores(existingBehavior.categoryScores, signal.negativeCategories, negative),
    },
    brandScores: {
      ...adjustScores(existingBehavior.brandScores, signal.positiveBrands, positive),
      ...adjustScores(existingBehavior.brandScores, signal.negativeBrands, negative),
    },
    itemScores: {
      ...adjustScoresWith(existingBehavior.itemScores, signal.positiveItemIds, positive, (value) => value.trim()),
      ...adjustScoresWith(existingBehavior.itemScores, signal.negativeItemIds, negative, (value) => value.trim()),
    },
    notes: normalizeNotes([...(existingBehavior.notes ?? []), ...(signal.notes ?? [])], 10),
    recentRejectedSignals: normalizeNotes(
      [...(existingBehavior.recentRejectedSignals ?? []), ...(signal.rejectedSignals ?? [])],
      10
    ),
    updatedAt: Date.now(),
  };

  const nextMain = deriveMainFromBehavior(nextBehavior, existingMain);
  await Promise.all([
    setDoc(profileDocRef(uid, MAIN_DOC_ID), nextMain, {merge: true}),
    setDoc(profileDocRef(uid, BEHAVIOR_DOC_ID), nextBehavior, {merge: true}),
  ]);
}
