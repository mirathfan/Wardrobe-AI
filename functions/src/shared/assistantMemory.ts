import {Firestore} from "firebase-admin/firestore";

export type AssistantProfileMain = {
  preferredColors?: string[];
  dislikedColors?: string[];
  preferredStyles?: string[];
  dislikedStyles?: string[];
  favoriteCategories?: string[];
  avoidedCategories?: string[];
  brandAffinity?: string[];
  notes?: string[];
  mostWornItemIds?: string[];
  leastWornItemIds?: string[];
  recentRejectedSignals?: string[];
  updatedAt?: number;
};

export type AssistantProfileBehavior = {
  colorScores?: Record<string, number>;
  styleScores?: Record<string, number>;
  categoryScores?: Record<string, number>;
  brandScores?: Record<string, number>;
  itemScores?: Record<string, number>;
  notes?: string[];
  recentRejectedSignals?: string[];
  updatedAt?: number;
};

function normalizeList(value: unknown, limit = 6) {
  if (!Array.isArray(value)) return [];
  const next: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const normalized = String(entry ?? "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    next.push(normalized);
    if (next.length >= limit) break;
  }
  return next;
}

export async function loadAssistantProfile(
  db: Firestore,
  uid: string
): Promise<AssistantProfileMain> {
  const snap = await db.collection("users").doc(uid)
    .collection("assistantProfile").doc("main").get();
  return snap.exists ? (snap.data() as AssistantProfileMain) : {};
}

export async function loadBehaviorProfile(
  db: Firestore,
  uid: string
): Promise<AssistantProfileBehavior> {
  const snap = await db.collection("users").doc(uid)
    .collection("assistantProfile").doc("behavior").get();
  return snap.exists ? (snap.data() as AssistantProfileBehavior) : {};
}

export function buildCompactMemorySummary(
  main: AssistantProfileMain | null | undefined,
  behavior?: AssistantProfileBehavior | null
) {
  const value = main ?? {};
  const parts: string[] = [];

  const preferredColors = normalizeList(value.preferredColors, 3);
  const dislikedColors = normalizeList(value.dislikedColors, 2);
  const preferredStyles = normalizeList(value.preferredStyles, 3);
  const favoriteCategories = normalizeList(value.favoriteCategories, 3);
  const brandAffinity = normalizeList(value.brandAffinity, 3);
  const rejectedSignals = normalizeList(value.recentRejectedSignals, 2);

  if (preferredColors.length) parts.push(`leans toward ${preferredColors.join(", ")}`);
  if (dislikedColors.length) parts.push(`tends to avoid ${dislikedColors.join(", ")}`);
  if (preferredStyles.length) parts.push(`usually likes ${preferredStyles.join(", ")} styling`);
  if (favoriteCategories.length) parts.push(`often responds well to ${favoriteCategories.join(", ")}`);
  if (brandAffinity.length) parts.push(`shows affinity for ${brandAffinity.join(", ")}`);
  if (rejectedSignals.length) parts.push(`recently pushed away from ${rejectedSignals.join("; ")}`);

  if (!parts.length && behavior && Object.keys(behavior.itemScores ?? {}).length) {
    parts.push("has emerging preferences from saved, swapped, and worn looks");
  }

  return parts.length ?
    `Assistant memory: user ${parts.join("; ")}.` :
    "Assistant memory: no strong preference signal yet.";
}
