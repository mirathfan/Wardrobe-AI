import { createHash } from "node:crypto";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { setLogContext, tracedHandler } from "../../shared/logger";
import { redactUid } from "../../shared/rateLimit";
import {
  buildOutfitWeatherWarnings,
  dateKeyToDate,
  type AuraOutfitWeatherContext,
  type AuraOutfitWeatherWarning,
} from "../../../../shared/auraOutfitCalendar";
import { safeRecordAuraMetricEvent } from "./metrics";
import { recordStyleMemoryFeedback } from "./styleMemory";
import type { FeedbackType, StyleMemoryFeedbackInput } from "./styleMemoryTypes";

type AgentOutfitItem = {
  itemId: string;
  role: string;
  name: string;
  category: string;
  subcategory?: string;
  brand?: string;
  colors: string[];
  imageUrl: string | null;
};

type AgentOutfitRecord = {
  outfitId: string;
  title: string;
  vibe: string;
  occasion: string;
  formality: string;
  items: AgentOutfitItem[];
  itemIds: string[];
  explanation: string;
  stylingTips: string[];
  missingItems: string[];
  outfitFingerprint: string;
};

type AgentActionInput = {
  outfit: AgentOutfitRecord;
  query?: string;
  agentRunId?: string;
  sourceMessageId?: string;
  dateKey?: string;
  wornAt?: Date;
  weatherContext?: AuraOutfitWeatherContext;
  reasonText?: string;
};

type AgentActionDeps = {
  recordFeedback?: (
    uid: string,
    input: StyleMemoryFeedbackInput,
  ) => Promise<unknown>;
  now?: () => Date;
  getSavedOutfit?: (uid: string, id: string) => Promise<Record<string, unknown> | null>;
  setSavedOutfit?: (uid: string, id: string, payload: Record<string, unknown>) => Promise<void>;
  getWearEvent?: (uid: string, id: string) => Promise<Record<string, unknown> | null>;
  setWearEvent?: (uid: string, id: string, payload: Record<string, unknown>) => Promise<void>;
  getOutfitEvent?: (uid: string, id: string) => Promise<Record<string, unknown> | null>;
  setOutfitEvent?: (uid: string, id: string, payload: Record<string, unknown>) => Promise<void>;
  getDislikedOutfit?: (uid: string, id: string) => Promise<Record<string, unknown> | null>;
  setDislikedOutfit?: (uid: string, id: string, payload: Record<string, unknown>) => Promise<void>;
  setOutfitFeedback?: (uid: string, id: string, payload: Record<string, unknown>) => Promise<void>;
  setDailyOutfit?: (uid: string, dateKey: string, payload: Record<string, unknown>) => Promise<void>;
  updateWearMetadata?: (uid: string, itemIds: string[], date: Date, outfit: AgentOutfitRecord) => Promise<void>;
};

function requireAuthUid(uid: string | undefined): string {
  if (!uid) throw new HttpsError("unauthenticated", "Please sign in first.");
  return uid;
}

function cleanText(value: unknown, maxLength = 500): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanStringArray(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const text = cleanText(entry, 120);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashId(value: string): string {
  return stableHash(value).slice(0, 24);
}

function normalizeRole(role: unknown) {
  const text = cleanText(role, 40).toLowerCase();
  if (text === "shoes") return "footwear";
  return text || "item";
}

function normalizeItem(value: unknown): AgentOutfitItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const itemId = cleanText(record.itemId, 160);
  if (!itemId) return null;
  return {
    itemId,
    role: normalizeRole(record.role),
    name: cleanText(record.name || record.title || record.category || record.role, 180),
    category: cleanText(record.category || record.role, 80),
    ...(cleanText(record.subcategory, 80) ? { subcategory: cleanText(record.subcategory, 80) } : {}),
    ...(cleanText(record.brand, 80) ? { brand: cleanText(record.brand, 80) } : {}),
    colors: cleanStringArray(record.colors, 8),
    imageUrl: cleanText(record.imageUrl, 1000) || null,
  };
}

function normalizeOutfit(value: unknown): AgentOutfitRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "A valid outfit is required.");
  }
  const record = value as Record<string, unknown>;
  const items = Array.isArray(record.items)
    ? record.items.map(normalizeItem).filter((item): item is AgentOutfitItem => !!item)
    : [];
  const itemIds = [...new Set(items.map((item) => item.itemId).filter(Boolean))];
  if (!itemIds.length) {
    throw new HttpsError("invalid-argument", "This outfit has no closet items to save.");
  }
  const title = cleanText(record.title, 180) || "AURA outfit";
  const fingerprint = stableHash(itemIds.slice().sort().join("|")).slice(0, 24);
  return {
    outfitId: cleanText(record.outfitId, 180) || `agent-${fingerprint}`,
    title,
    vibe: cleanText(record.vibe, 120),
    occasion: cleanText(record.occasion, 120),
    formality: cleanText(record.formality, 80),
    items,
    itemIds,
    explanation: cleanText(record.explanation, 1000),
    stylingTips: cleanStringArray(record.stylingTips, 8),
    missingItems: cleanStringArray(record.missingItems, 8),
    outfitFingerprint: fingerprint,
  };
}

function normalizeInput(data: unknown): AgentActionInput {
  const record = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const wornAtValue = record.wornAt;
  const wornAt = wornAtValue ? new Date(String(wornAtValue)) : undefined;
  const dateKeyValue = cleanText(record.dateKey, 40);
  const weatherContext = normalizeWeatherContext(record.weatherContext);
  return {
    outfit: normalizeOutfit(record.outfit),
    query: cleanText(record.query, 500) || undefined,
    agentRunId: cleanText(record.agentRunId, 180) || undefined,
    sourceMessageId: cleanText(record.sourceMessageId, 180) || undefined,
    dateKey: /^\d{4}-\d{2}-\d{2}$/.test(dateKeyValue) ? dateKeyValue : undefined,
    wornAt: wornAt && Number.isFinite(wornAt.getTime()) ? wornAt : undefined,
    weatherContext,
    reasonText: cleanText(record.reasonText, 500) || undefined,
  };
}

function normalizeWeatherContext(value: unknown): AuraOutfitWeatherContext | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const dateKeyValue = cleanText(record.dateKey, 40);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKeyValue)) return undefined;
  const numberValue = (entry: unknown) => {
    const value = Number(entry);
    return Number.isFinite(value) ? value : undefined;
  };
  return {
    dateKey: dateKeyValue,
    locationSource: cleanText(record.locationSource, 80) || undefined,
    temperatureHigh: numberValue(record.temperatureHigh),
    temperatureLow: numberValue(record.temperatureLow),
    condition: cleanText(record.condition, 120) || undefined,
    precipitationChance: numberValue(record.precipitationChance),
    windSpeed: numberValue(record.windSpeed),
    rawSummary: cleanText(record.rawSummary, 240) || undefined,
  };
}

function snapshotRole(role: string) {
  if (role === "footwear") return "shoes";
  return role;
}

function buildLookSnapshot(outfit: AgentOutfitRecord) {
  return {
    lookTitle: outfit.title,
    vibe: outfit.vibe,
    shortExplanation: outfit.explanation,
    stylingNote: outfit.stylingTips[0] ?? "",
    personalizationLabel: outfit.vibe,
    personalizationNote: "",
    fromCloset: outfit.items.map((item) => item.name).filter(Boolean),
    addToComplete: outfit.missingItems,
    alternates: [],
    pieces: outfit.items.map((item) => ({
      role: snapshotRole(item.role),
      itemName: item.name,
      source: "closet",
      itemId: item.itemId,
      imageUrl: item.imageUrl,
    })),
  };
}

function buildLook(outfit: AgentOutfitRecord) {
  const snapshot = buildLookSnapshot(outfit);
  return {
    lookTitle: snapshot.lookTitle,
    vibe: snapshot.vibe,
    shortExplanation: snapshot.shortExplanation,
    stylingNote: snapshot.stylingNote,
    personalizationLabel: snapshot.personalizationLabel,
    personalizationNote: snapshot.personalizationNote,
    pieces: snapshot.pieces,
    fromCloset: snapshot.fromCloset,
    addToComplete: snapshot.addToComplete,
    alternates: [],
    actions: ["saveLook", "planForToday", "likeLook", "notMyVibe"],
  };
}

function buildDailyOutfitSnapshot(outfit: AgentOutfitRecord) {
  const slotForRole = (role: string) => {
    const slot = snapshotRole(role);
    if (
      slot === "outerwear" ||
      slot === "top" ||
      slot === "bottom" ||
      slot === "shoes" ||
      slot === "accessory"
    ) {
      return slot;
    }
    return "other";
  };
  return {
    version: 1,
    title: outfit.title,
    source: "aura",
    itemIds: outfit.itemIds,
    slots: outfit.items.map((item) => ({
      slot: slotForRole(item.role),
      source: "closet",
      itemId: item.itemId,
      label: item.name || item.itemId,
      ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
    })),
    missingPieces: outfit.missingItems,
    stylingNote: outfit.stylingTips.filter(Boolean).join(" ") || outfit.explanation,
  };
}

function itemsByCategory(outfit: AgentOutfitRecord) {
  const result: Record<string, unknown> = {};
  const accessories: string[] = [];
  for (const item of outfit.items) {
    if (item.role === "footwear" && !result.shoes) result.shoes = item.itemId;
    else if (item.role === "outerwear" && !result.outerwear) result.outerwear = item.itemId;
    else if ((item.role === "top" || item.role === "one_piece") && !result.top) result.top = item.itemId;
    else if (item.role === "bottom" && !result.bottom) result.bottom = item.itemId;
    else if (item.role === "accessory") accessories.push(item.itemId);
  }
  if (accessories.length) result.accessories = accessories;
  return result;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateForInput(input: AgentActionInput, fallback: Date) {
  if (input.dateKey) return dateKeyToDate(input.dateKey);
  return input.wornAt ?? fallback;
}

function dateKeyForInput(input: AgentActionInput, date: Date) {
  return input.dateKey ?? dateKey(date);
}

async function defaultGetSavedOutfit(uid: string, id: string) {
  const snap = await getFirestore().collection("users").doc(uid).collection("savedOutfits").doc(id).get();
  return snap.exists ? snap.data() ?? null : null;
}

async function defaultSetSavedOutfit(uid: string, id: string, payload: Record<string, unknown>) {
  await getFirestore().collection("users").doc(uid).collection("savedOutfits").doc(id).set(payload, { merge: true });
}

async function defaultGetWearEvent(uid: string, id: string) {
  const snap = await getFirestore().collection("users").doc(uid).collection("wearEvents").doc(id).get();
  return snap.exists ? snap.data() ?? null : null;
}

async function defaultSetWearEvent(uid: string, id: string, payload: Record<string, unknown>) {
  await getFirestore().collection("users").doc(uid).collection("wearEvents").doc(id).set(payload, { merge: true });
}

async function defaultGetOutfitEvent(uid: string, id: string) {
  const snap = await getFirestore().collection("users").doc(uid).collection("outfitEvents").doc(id).get();
  return snap.exists ? snap.data() ?? null : null;
}

async function defaultSetOutfitEvent(uid: string, id: string, payload: Record<string, unknown>) {
  await getFirestore().collection("users").doc(uid).collection("outfitEvents").doc(id).set(payload, { merge: true });
}

async function defaultGetDislikedOutfit(uid: string, id: string) {
  const snap = await getFirestore().collection("users").doc(uid).collection("dislikedOutfits").doc(id).get();
  return snap.exists ? snap.data() ?? null : null;
}

async function defaultSetDislikedOutfit(uid: string, id: string, payload: Record<string, unknown>) {
  await getFirestore().collection("users").doc(uid).collection("dislikedOutfits").doc(id).set(payload, { merge: true });
}

async function defaultSetOutfitFeedback(uid: string, id: string, payload: Record<string, unknown>) {
  await getFirestore().collection("users").doc(uid).collection("outfitFeedback").doc(id).set(payload, { merge: true });
}

async function defaultSetDailyOutfit(uid: string, dateKeyValue: string, payload: Record<string, unknown>) {
  await getFirestore().collection("users").doc(uid).collection("outfits").doc(dateKeyValue).set(payload, { merge: true });
}

async function defaultUpdateWearMetadata(uid: string, itemIds: string[], date: Date, outfit: AgentOutfitRecord) {
  const db = getFirestore();
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();
  const wornTimestamp = Timestamp.fromDate(date);
  const itemRefs = itemIds.map((itemId) => db.collection("users").doc(uid).collection("items").doc(itemId));
  const itemSnaps = await Promise.all(itemRefs.map((ref) => ref.get()));
  itemSnaps.forEach((snap, index) => {
    if (!snap.exists) return;
    batch.update(itemRefs[index], {
      status: "WORN",
      laundryStatus: "needs_wash",
      wearCountSinceWash: FieldValue.increment(1),
      wearCount: FieldValue.increment(1),
      lastWornDate: wornTimestamp,
      lastWornAt: wornTimestamp,
      laundryUpdatedAt: now,
      updatedAt: Date.now(),
    });
  });
  const key = dateKey(date);
  batch.set(db.collection("users").doc(uid).collection("outfits").doc(key), {
    dateKey: key,
    itemIds,
    planned: false,
    wornOutfit: buildDailyWornOutfit({ outfit }, date),
    wornAtMs: date.getTime(),
    updatedAt: now,
    createdAt: now,
  }, { merge: true });
  await batch.commit();
}

async function recordFeedbackOnce(
  uid: string,
  input: AgentActionInput,
  feedbackType: FeedbackType,
  deps: AgentActionDeps,
) {
  const recordFeedback = deps.recordFeedback ?? recordStyleMemoryFeedback;
  await recordFeedback(uid, {
    query: input.query,
    occasion: input.outfit.occasion,
    formality: input.outfit.formality,
    outfit: input.outfit as unknown as Record<string, unknown>,
    outfitId: input.outfit.outfitId,
    feedbackType,
    selectedItemIds: input.outfit.itemIds,
  });
  await safeRecordAuraMetricEvent(uid, {
    type: "style_feedback_recorded",
    feedbackType,
  });
}

function buildWeatherWarnings(
  outfit: AgentOutfitRecord,
  weatherContext?: AuraOutfitWeatherContext,
): AuraOutfitWeatherWarning[] {
  return buildOutfitWeatherWarnings({
    items: outfit.items,
  }, weatherContext);
}

function buildCalendarEventPayload(params: {
  id: string;
  userId: string;
  type: "worn" | "planned" | "disliked" | "saved";
  status: "planned" | "worn" | "dismissed" | "cancelled";
  dateKey?: string;
  input: AgentActionInput;
  savedOutfitId?: string;
  weatherContext?: AuraOutfitWeatherContext;
  weatherWarnings?: AuraOutfitWeatherWarning[];
}) {
  const { input, weatherContext, weatherWarnings } = params;
  return {
    id: params.id,
    userId: params.userId,
    type: params.type,
    source: "aura_agent",
    ...(params.dateKey ? { dateKey: params.dateKey } : {}),
    ...(params.type === "planned" && params.dateKey ? { scheduledFor: Timestamp.fromDate(dateKeyToDate(params.dateKey)) } : {}),
    ...(params.type === "worn" && params.dateKey ? { wornAt: Timestamp.fromDate(dateKeyToDate(params.dateKey)) } : {}),
    outfitFingerprint: input.outfit.outfitFingerprint,
    outfitId: input.outfit.outfitId,
    savedOutfitId: params.savedOutfitId ?? null,
    sourceQuery: input.query ?? null,
    sourceMessageId: input.sourceMessageId ?? null,
    sourceAgentRunId: input.agentRunId ?? null,
    title: input.outfit.title,
    vibe: input.outfit.vibe,
    occasion: input.outfit.occasion,
    formality: input.outfit.formality,
    itemIds: input.outfit.itemIds,
    items: input.outfit.items,
    explanation: input.outfit.explanation,
    stylingTips: input.outfit.stylingTips,
    ...(weatherContext ? { weatherContext } : {}),
    ...(weatherWarnings?.length ? { weatherWarnings } : {}),
    status: params.status,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function buildDailyPlannedOutfit(
  input: AgentActionInput,
  weatherContext?: AuraOutfitWeatherContext,
  weatherWarnings: AuraOutfitWeatherWarning[] = [],
) {
  return {
    itemsByCategory: itemsByCategory(input.outfit),
    score: Math.round(Math.max(0, Math.min(1, Number(input.outfit.itemIds.length ? 0.88 : 0.75))) * 100),
    reasons: [
      input.outfit.explanation,
      ...input.outfit.stylingTips,
      ...weatherWarnings.map((warning) => warning.message),
    ].filter(Boolean).slice(0, 6),
    createdAt: Date.now(),
    source: "aura_agent",
    title: input.outfit.title,
    outfitId: input.outfit.outfitId,
    outfitFingerprint: input.outfit.outfitFingerprint,
    outfitSnapshot: buildDailyOutfitSnapshot(input.outfit),
    ...(weatherContext ? { weatherContext } : {}),
    ...(weatherWarnings.length ? { weatherWarnings } : {}),
  };
}

function buildDailyWornOutfit(input: AgentActionInput, wornAt: Date) {
  return {
    itemsByCategory: itemsByCategory(input.outfit),
    wornAt: wornAt.getTime(),
    source: "aura_agent",
    title: input.outfit.title,
    outfitId: input.outfit.outfitId,
    outfitFingerprint: input.outfit.outfitFingerprint,
    outfitSnapshot: buildDailyOutfitSnapshot(input.outfit),
  };
}

export async function handleSaveAuraAgentOutfit(
  uid: string | undefined,
  data: unknown,
  deps: AgentActionDeps = {},
) {
  const userId = requireAuthUid(uid);
  const input = normalizeInput(data);
  const id = `aura_agent_${input.outfit.outfitFingerprint}`;
  const existing = await (deps.getSavedOutfit ?? defaultGetSavedOutfit)(userId, id);
  if (existing) {
    await safeRecordAuraMetricEvent(userId, { type: "saved_outfit_duplicate" });
    return {
      saved: true,
      alreadySaved: true,
      savedOutfitId: id,
      message: "Already saved.",
    };
  }

  const timestamp = deps.now?.() ?? new Date();
  const payload = {
    id,
    userId,
    source: "aura_agent",
    sourceQuery: input.query ?? null,
    sourceMessageId: input.sourceMessageId ?? null,
    sourceAgentRunId: input.agentRunId ?? null,
    title: input.outfit.title,
    vibe: input.outfit.vibe,
    occasion: input.outfit.occasion,
    formality: input.outfit.formality,
    itemIds: input.outfit.itemIds,
    items: input.outfit.items,
    explanation: input.outfit.explanation,
    stylingTips: input.outfit.stylingTips,
    missingItems: input.outfit.missingItems,
    outfitFingerprint: input.outfit.outfitFingerprint,
    outfitSnapshot: buildLookSnapshot(input.outfit),
    look: buildLook(input.outfit),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    savedAt: FieldValue.serverTimestamp(),
    savedAtMs: timestamp.getTime(),
  };
  await (deps.setSavedOutfit ?? defaultSetSavedOutfit)(userId, id, payload);
  await (deps.setOutfitEvent ?? defaultSetOutfitEvent)(userId, `saved_${input.outfit.outfitFingerprint}`, buildCalendarEventPayload({
    id: `saved_${input.outfit.outfitFingerprint}`,
    userId,
    type: "saved",
    status: "planned",
    input,
    savedOutfitId: id,
  }));
  await recordFeedbackOnce(userId, input, "save", deps);
  await safeRecordAuraMetricEvent(userId, {
    type: "saved_outfit_created",
    source: "aura_agent",
  });
  return {
    saved: true,
    alreadySaved: false,
    savedOutfitId: id,
    message: "Added to your saved outfits.",
  };
}

export async function handleLogAuraAgentOutfitWear(
  uid: string | undefined,
  data: unknown,
  deps: AgentActionDeps = {},
) {
  const userId = requireAuthUid(uid);
  const input = normalizeInput(data);
  const wornAt = dateForInput(input, deps.now?.() ?? new Date());
  const key = dateKeyForInput(input, wornAt);
  const id = `aura_agent_${key}_${input.outfit.outfitFingerprint}`;
  const existing = await (deps.getWearEvent ?? defaultGetWearEvent)(userId, id);
  if (existing) {
    return {
      logged: true,
      alreadyLogged: true,
      wearEventId: id,
      message: "Already marked worn today.",
    };
  }

  const payload = {
    id,
    userId,
    source: "aura_agent",
    outfitId: input.outfit.outfitId,
    outfitFingerprint: input.outfit.outfitFingerprint,
    query: input.query ?? null,
    sourceMessageId: input.sourceMessageId ?? null,
    sourceAgentRunId: input.agentRunId ?? null,
    wornAt: wornAt.getTime(),
    dateKey: key,
    itemIds: input.outfit.itemIds,
    items: input.outfit.items.map((item) => ({
      itemId: item.itemId,
      role: item.role,
      name: item.name,
      category: item.category,
      imageUrl: item.imageUrl,
    })),
    title: input.outfit.title,
    createdAt: FieldValue.serverTimestamp(),
  };
  await (deps.setWearEvent ?? defaultSetWearEvent)(userId, id, payload);
  await (deps.setOutfitEvent ?? defaultSetOutfitEvent)(userId, `worn_${key}_${input.outfit.outfitFingerprint}`, buildCalendarEventPayload({
    id: `worn_${key}_${input.outfit.outfitFingerprint}`,
    userId,
    type: "worn",
    status: "worn",
    dateKey: key,
    input,
  }));
  await (deps.updateWearMetadata ?? defaultUpdateWearMetadata)(userId, input.outfit.itemIds, wornAt, input.outfit);
  await recordFeedbackOnce(userId, input, "wear", deps);
  await safeRecordAuraMetricEvent(userId, {
    type: "wear_event_created",
    source: "aura_agent",
  });
  return {
    logged: true,
    alreadyLogged: false,
    wearEventId: id,
    dateKey: key,
    message: key === dateKey(new Date()) ? "Marked as worn for today." : `Marked as worn for ${key}.`,
  };
}

export async function handlePlanAuraAgentOutfit(
  uid: string | undefined,
  data: unknown,
  deps: AgentActionDeps = {},
) {
  const userId = requireAuthUid(uid);
  const input = normalizeInput(data);
  if (!input.dateKey) {
    throw new HttpsError("invalid-argument", "A valid dateKey is required to plan an outfit.");
  }
  const id = `planned_${input.dateKey}_${input.outfit.outfitFingerprint}`;
  const existing = await (deps.getOutfitEvent ?? defaultGetOutfitEvent)(userId, id);
  const weatherContext = input.weatherContext
    ? { ...input.weatherContext, dateKey: input.dateKey }
    : undefined;
  const weatherWarnings = buildWeatherWarnings(input.outfit, weatherContext);
  if (existing) {
    return {
      planned: true,
      alreadyPlanned: true,
      eventId: id,
      dateKey: input.dateKey,
      weatherWarnings,
      message: `Already planned for ${input.dateKey}.`,
    };
  }

  const plannedOutfit = buildDailyPlannedOutfit(input, weatherContext, weatherWarnings);
  await (deps.setDailyOutfit ?? defaultSetDailyOutfit)(userId, input.dateKey, {
    dateKey: input.dateKey,
    itemIds: input.outfit.itemIds,
    planned: true,
    plannedSource: "aura_agent",
    plannedOutfit,
    outfitId: input.outfit.outfitId,
    outfitFingerprint: input.outfit.outfitFingerprint,
    title: input.outfit.title,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  });
  await (deps.setOutfitEvent ?? defaultSetOutfitEvent)(userId, id, buildCalendarEventPayload({
    id,
    userId,
    type: "planned",
    status: "planned",
    dateKey: input.dateKey,
    input,
    weatherContext,
    weatherWarnings,
  }));
  await safeRecordAuraMetricEvent(userId, {
    type: "planned_event_created",
    source: "aura_agent",
    weatherWarningsCount: weatherWarnings.length,
  });
  return {
    planned: true,
    alreadyPlanned: false,
    eventId: id,
    dateKey: input.dateKey,
    weatherWarnings,
    message: `Planned for ${input.dateKey}.`,
  };
}

export async function handleDislikeAuraAgentOutfit(
  uid: string | undefined,
  data: unknown,
  deps: AgentActionDeps = {},
) {
  const userId = requireAuthUid(uid);
  const input = normalizeInput(data);
  const id = `aura_agent_${input.outfit.outfitFingerprint}`;
  const existing = await (deps.getDislikedOutfit ?? defaultGetDislikedOutfit)(userId, id);
  if (existing) {
    return {
      disliked: true,
      alreadyDisliked: true,
      dislikedOutfitId: id,
      message: "Already noted.",
    };
  }

  const nowMs = Date.now();
  const look = buildLook(input.outfit);
  const feedbackId = `aura_${hashId(`outfit_disliked|${input.outfit.outfitFingerprint}`)}`;
  const payload = {
    id,
    userId,
    source: "aura_agent",
    type: "disliked",
    outfitFingerprint: input.outfit.outfitFingerprint,
    query: input.query ?? null,
    sourceQuery: input.query ?? null,
    sourceMessageId: input.sourceMessageId ?? null,
    sourceAgentRunId: input.agentRunId ?? null,
    title: input.outfit.title,
    vibe: input.outfit.vibe,
    occasion: input.outfit.occasion,
    formality: input.outfit.formality,
    itemIds: input.outfit.itemIds,
    items: input.outfit.items,
    reasonText: input.reasonText ?? null,
    explanation: input.outfit.explanation,
    stylingTips: input.outfit.stylingTips,
    outfitSnapshot: buildLookSnapshot(input.outfit),
    look,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdAtMs: nowMs,
  };
  await (deps.setDislikedOutfit ?? defaultSetDislikedOutfit)(userId, id, payload);
  await (deps.setOutfitFeedback ?? defaultSetOutfitFeedback)(userId, feedbackId, {
    feedbackType: "outfit_disliked",
    createdAt: nowMs,
    updatedAt: nowMs,
    source: "aura",
    sessionId: null,
    chatId: null,
    messageId: input.sourceMessageId ?? null,
    optionIndex: null,
    optionLabel: "",
    optionId: input.outfit.outfitId,
    batchPosition: null,
    directionLabel: input.reasonText ?? null,
    itemIds: input.outfit.itemIds,
    title: input.outfit.title,
    stylingNote: input.outfit.stylingTips[0] ?? input.outfit.explanation,
    personalizationLabel: input.outfit.vibe,
    personalizationNote: "",
    outfitSnapshot: buildLookSnapshot(input.outfit),
    look,
  });
  await (deps.setOutfitEvent ?? defaultSetOutfitEvent)(userId, `disliked_${input.outfit.outfitFingerprint}`, buildCalendarEventPayload({
    id: `disliked_${input.outfit.outfitFingerprint}`,
    userId,
    type: "disliked",
    status: "dismissed",
    input,
  }));
  await recordFeedbackOnce(userId, input, "not_my_vibe", deps);
  return {
    disliked: true,
    alreadyDisliked: false,
    dislikedOutfitId: id,
    message: "Got it - I'll avoid this vibe.",
  };
}

export const saveAuraAgentOutfit = onCall(
  { secrets: ["OPENAI_API_KEY"], timeoutSeconds: 120 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    return handleSaveAuraAgentOutfit(uid, request.data);
  }),
);

export const logAuraAgentOutfitWear = onCall(
  { secrets: ["OPENAI_API_KEY"], timeoutSeconds: 120 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    return handleLogAuraAgentOutfitWear(uid, request.data);
  }),
);

export const planAuraAgentOutfit = onCall(
  { secrets: ["OPENAI_API_KEY"], timeoutSeconds: 120 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    return handlePlanAuraAgentOutfit(uid, request.data);
  }),
);

export const dislikeAuraAgentOutfit = onCall(
  { secrets: ["OPENAI_API_KEY"], timeoutSeconds: 120 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    return handleDislikeAuraAgentOutfit(uid, request.data);
  }),
);
