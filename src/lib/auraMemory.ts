import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";

import { db } from "@/src/lib/firebase";
import type { AuraLook } from "@/src/types/aura";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { WornOutfit } from "@/src/utils/dailyOutfits";
import {
  AURA_MEMORY_VERSION,
  LEARNED_STYLE_MEMORY_DOC_ID,
  SESSION_CONTEXT_DOC_ID,
  STYLE_PROFILE_DOC_ID,
  buildStyleProfileFromLegacyPreferences,
  computeLearnedStyleMemory,
  emptyLearnedStyleMemory,
  normalizeAuraSessionContext,
  normalizeLearnedStyleMemory,
  normalizeStyleEvent,
  normalizeStyleProfile,
  type AuraSessionContext,
  type LearnedStyleMemory,
  type StyleEvent,
  type StyleEventDerivedTraits,
  type StyleEventOutfit,
  type StyleEventType,
  type StyleProfile,
} from "@/shared/auraMemory";

function userDocRef(uid: string) {
  return doc(db, "users", uid);
}

function profileDocRef(uid: string, docId: string) {
  return doc(db, "users", uid, "profile", docId);
}

function sessionContextDocRef(uid: string, chatId: string) {
  return doc(db, "users", uid, "aiChats", chatId, "sessionContext", SESSION_CONTEXT_DOC_ID);
}

function styleEventsCollection(uid: string) {
  return collection(db, "users", uid, "styleEvents");
}

function cleanString(value: unknown) {
  const next = String(value ?? "").trim();
  return next || null;
}

function normalizeToken(value: unknown) {
  return cleanString(value)?.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ") ?? null;
}

function uniqueTokens(values: (string | null | undefined)[], limit = 8) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const token = normalizeToken(value);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    next.push(token);
    if (next.length >= limit) break;
  }
  return next;
}

function itemDocRef(uid: string, itemId: string) {
  return doc(db, "users", uid, "items", itemId);
}

function normalizeCategory(value?: string | null) {
  const token = normalizeToken(value);
  if (!token) return null;

  if (["tee", "t shirt", "tshirt", "shirt", "blouse", "tank", "polo", "sweater", "hoodie"].includes(token)) {
    return token;
  }
  if (["jacket", "coat", "blazer", "outerwear"].includes(token)) return token;
  if (["jeans", "trousers", "pants", "shorts", "skirt", "bottom"].includes(token)) return token;
  if (["sneakers", "sneaker", "boots", "boot", "loafer", "loafers", "heels", "heel", "sandals", "sandal", "shoes", "footwear"].includes(token)) {
    return token;
  }
  return token;
}

function pickItemColor(item: Partial<ClothingItem>) {
  return (
    cleanString(item.aiColorLabel) ||
    cleanString(item.aiColors?.[0]) ||
    cleanString(item.colors?.[0]) ||
    cleanString(item.colorLabel) ||
    cleanString(item.primaryColor)
  );
}

function deriveTraitsFromItems(
  items: ClothingItem[],
  options?: {
    formula?: string | null;
    vibe?: string[] | null;
    occasion?: string | null;
  }
): StyleEventDerivedTraits {
  const colors = uniqueTokens(items.map((item) => pickItemColor(item)), 6);
  const categories = uniqueTokens(
    items.map((item) => normalizeCategory(item.subCategory) ?? normalizeCategory(item.category)),
    6
  );
  const fits = uniqueTokens(
    items.flatMap((item) => [
      normalizeToken(item.fit),
      normalizeToken(item.rise),
      normalizeToken(item.legShape),
    ]),
    6
  );
  const brands = uniqueTokens(items.map((item) => cleanString(item.brand)), 4);
  const vibe = uniqueTokens(options?.vibe ?? [], 4);

  const derivedTraits: StyleEventDerivedTraits = {};
  if (colors.length) derivedTraits.colors = colors;
  if (categories.length) derivedTraits.categories = categories;
  if (fits.length) derivedTraits.fits = fits;
  if (brands.length) derivedTraits.brands = brands;
  if (options?.formula) derivedTraits.formula = normalizeToken(options.formula) ?? undefined;
  if (vibe.length) derivedTraits.vibe = vibe;
  if (options?.occasion) derivedTraits.occasion = normalizeToken(options.occasion) ?? undefined;
  return derivedTraits;
}

function lookFormula(look: AuraLook) {
  const roles = [
    look.pieces.some((piece) => piece.role === "outerwear") ? "outerwear" : null,
    look.pieces.some((piece) => piece.role === "top") ? "top" : null,
    look.pieces.some((piece) => piece.role === "bottom") ? "bottom" : null,
    look.pieces.some((piece) => piece.role === "shoes") ? "shoes" : null,
    look.pieces.some((piece) => piece.role === "accessory") ? "accessory" : null,
  ].filter(Boolean);
  return roles.join(" + ");
}

function buildLookOutfit(look: AuraLook): StyleEventOutfit {
  const firstPieceIdForRole = (role: AuraLook["pieces"][number]["role"]) =>
    look.pieces.find((piece) => piece.role === role && piece.itemId)?.itemId;

  const accessories = look.pieces
    .filter((piece) => piece.role === "accessory" && piece.itemId)
    .map((piece) => piece.itemId as string);

  return {
    top: firstPieceIdForRole("top") ?? undefined,
    outerwear: firstPieceIdForRole("outerwear") ?? undefined,
    bottom: firstPieceIdForRole("bottom") ?? undefined,
    footwear: firstPieceIdForRole("shoes") ?? undefined,
    accessories: accessories.length ? accessories : undefined,
  };
}

async function loadItemsByIds(uid: string, itemIds: string[]) {
  const ids = Array.from(new Set(itemIds.map((id) => String(id ?? "").trim()).filter(Boolean)));
  const snaps = await Promise.all(ids.map((itemId) => getDoc(itemDocRef(uid, itemId))));
  return snaps
    .filter((snap) => snap.exists())
    .map((snap) => ({ ...(snap.data() as ClothingItem), id: snap.id }));
}

function buildSessionPatchFromPrompt(prompt: string) {
  const text = prompt.toLowerCase();
  const currentConstraints = uniqueTokens([
    text.includes("only my closet") || text.includes("use my closet") ? "closet first" : null,
    text.includes("dressier") ? "dressier" : null,
    text.includes("casual") ? "casual" : null,
    text.includes("comfortable") ? "comfortable" : null,
    text.includes("weather") ? "weather aware" : null,
  ], 4);
  const currentOccasion = (() => {
    if (text.includes("date")) return "date night";
    if (text.includes("office") || text.includes("work")) return "work";
    if (text.includes("wedding")) return "wedding";
    if (text.includes("travel")) return "travel";
    if (text.includes("party")) return "party";
    if (text.includes("brunch")) return "brunch";
    if (text.includes("gym")) return "gym";
    return null;
  })();
  const vibeForThisSession = (() => {
    if (text.includes("clean")) return "clean";
    if (text.includes("sharp")) return "sharp";
    if (text.includes("layered")) return "layered";
    if (text.includes("bold")) return "bold";
    if (text.includes("minimal")) return "minimal";
    return null;
  })();

  return {
    ...(currentOccasion ? { currentOccasion } : {}),
    ...(currentConstraints.length ? { currentConstraints } : {}),
    ...(vibeForThisSession ? { vibeForThisSession } : {}),
  };
}

export async function loadStyleProfile(uid: string) {
  const explicitSnap = await getDoc(profileDocRef(uid, STYLE_PROFILE_DOC_ID));
  if (explicitSnap.exists()) {
    return normalizeStyleProfile(explicitSnap.data());
  }

  const userSnap = await getDoc(userDocRef(uid));
  const profilePreferences = userSnap.data()?.profilePreferences;
  return buildStyleProfileFromLegacyPreferences(profilePreferences);
}

export async function saveStyleProfile(uid: string, profile: StyleProfile) {
  const normalized = normalizeStyleProfile(profile, { version: AURA_MEMORY_VERSION });
  const now = Date.now();
  const payload = {
    ...normalized,
    version: AURA_MEMORY_VERSION,
    updatedAt: now,
  } satisfies StyleProfile;
  await setDoc(profileDocRef(uid, STYLE_PROFILE_DOC_ID), payload, { merge: true });
  return payload;
}

export async function loadLearnedStyleMemory(uid: string) {
  const snap = await getDoc(profileDocRef(uid, LEARNED_STYLE_MEMORY_DOC_ID));
  return snap.exists() ? normalizeLearnedStyleMemory(snap.data()) : emptyLearnedStyleMemory();
}

export async function saveLearnedStyleMemory(uid: string, learned: LearnedStyleMemory) {
  const normalized = normalizeLearnedStyleMemory(learned);
  const payload = {
    ...normalized,
    version: AURA_MEMORY_VERSION,
    updatedAt: Date.now(),
  } satisfies LearnedStyleMemory;
  await setDoc(profileDocRef(uid, LEARNED_STYLE_MEMORY_DOC_ID), payload, { merge: true });
  return payload;
}

export async function loadAuraSessionContext(uid: string, chatId: string) {
  const snap = await getDoc(sessionContextDocRef(uid, chatId));
  return snap.exists() ? normalizeAuraSessionContext(snap.data()) : null;
}

export async function saveAuraSessionContext(uid: string, chatId: string, session: AuraSessionContext) {
  const normalized = normalizeAuraSessionContext(session) ?? {
    updatedAt: Date.now(),
  };
  await setDoc(
    sessionContextDocRef(uid, chatId),
    {
      ...normalized,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
  return loadAuraSessionContext(uid, chatId);
}

export async function mergeAuraSessionContext(
  uid: string,
  chatId: string,
  patch: Partial<AuraSessionContext>
) {
  const current = await loadAuraSessionContext(uid, chatId);
  const mergedBase: AuraSessionContext = {
    ...(current ?? { updatedAt: 0 }),
    ...patch,
    updatedAt: Date.now(),
  };
  const merged = normalizeAuraSessionContext({
    ...mergedBase,
    currentConstraints: patch.currentConstraints ?? current?.currentConstraints ?? [],
    selectedItems: patch.selectedItems ?? current?.selectedItems ?? [],
  }) ?? { updatedAt: Date.now() };
  await setDoc(sessionContextDocRef(uid, chatId), merged, { merge: true });
  return merged;
}

export async function updateAuraSessionContextFromPrompt(uid: string, chatId: string, prompt: string) {
  return mergeAuraSessionContext(uid, chatId, {
    ...buildSessionPatchFromPrompt(prompt),
    expiresAt: Date.now() + 1000 * 60 * 60 * 24,
  });
}

export async function recomputeLearnedStyleMemory(uid: string, maxEvents = 200) {
  const snap = await getDocs(
    query(styleEventsCollection(uid), orderBy("createdAt", "desc"), limit(maxEvents))
  );
  const events = snap.docs
    .map((docSnap) => normalizeStyleEvent(docSnap.data()))
    .filter((event): event is StyleEvent => !!event);
  const learned = computeLearnedStyleMemory(events, Date.now());
  await saveLearnedStyleMemory(uid, learned);
  return learned;
}

export async function logStyleEvent(uid: string, event: StyleEvent) {
  const ref = doc(styleEventsCollection(uid));
  const normalized = normalizeStyleEvent({
    ...event,
    createdAt: typeof event.createdAt === "number" ? event.createdAt : Date.now(),
  });
  if (!normalized) {
    throw new Error("Invalid style event");
  }
  await setDoc(ref, normalized);
  await recomputeLearnedStyleMemory(uid);
  return {
    id: ref.id,
    ...normalized,
  };
}

export async function logAuraLookStyleEvent(
  uid: string,
  type: Extract<StyleEventType, "outfit_saved" | "outfit_liked" | "outfit_disliked" | "more_like_this" | "less_like_this">,
  look: AuraLook,
  options?: {
    source?: StyleEvent["source"];
    occasion?: string | null;
  }
) {
  const closetItemIds = look.pieces
    .filter((piece) => piece.source === "closet" && piece.itemId)
    .map((piece) => piece.itemId as string);
  const items = await loadItemsByIds(uid, closetItemIds);
  return logStyleEvent(uid, {
    type,
    itemIds: closetItemIds,
    outfit: buildLookOutfit(look),
    derivedTraits: deriveTraitsFromItems(items, {
      formula: lookFormula(look),
      vibe: look.vibe.split(/[,/]/g).map((entry) => entry.trim()).filter(Boolean),
      occasion: options?.occasion ?? null,
    }),
    source: options?.source ?? "aura",
    createdAt: Date.now(),
  });
}

export async function logWornOutfitStyleEvent(uid: string, wornOutfit: WornOutfit) {
  const itemIds = [
    wornOutfit.itemsByCategory.outerwear,
    wornOutfit.itemsByCategory.top,
    wornOutfit.itemsByCategory.bottom,
    wornOutfit.itemsByCategory.shoes,
  ].filter(Boolean) as string[];
  const items = await loadItemsByIds(uid, itemIds);
  return logStyleEvent(uid, {
    type: "outfit_worn",
    itemIds,
    outfit: {
      outerwear: wornOutfit.itemsByCategory.outerwear,
      top: wornOutfit.itemsByCategory.top,
      bottom: wornOutfit.itemsByCategory.bottom,
      footwear: wornOutfit.itemsByCategory.shoes,
    },
    derivedTraits: deriveTraitsFromItems(items, {
      formula: [
        wornOutfit.itemsByCategory.outerwear ? "outerwear" : null,
        wornOutfit.itemsByCategory.top ? "top" : null,
        wornOutfit.itemsByCategory.bottom ? "bottom" : null,
        wornOutfit.itemsByCategory.shoes ? "shoes" : null,
      ]
        .filter(Boolean)
        .join(" + "),
    }),
    source: "planner",
    createdAt: wornOutfit.wornAt,
  });
}

export async function logItemStyleEvent(
  uid: string,
  type: Extract<StyleEventType, "item_added" | "item_favorited" | "item_worn">,
  item: ClothingItem
) {
  return logStyleEvent(uid, {
    type,
    itemIds: [item.id],
    derivedTraits: deriveTraitsFromItems([item]),
    source: "closet",
    createdAt: Date.now(),
  });
}
