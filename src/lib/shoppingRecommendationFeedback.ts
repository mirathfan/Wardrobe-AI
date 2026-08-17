import {
  addDoc,
  collection,
  getDocs,
  limit as limitQuery,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "./firebase";
import {
  SHOPPING_RECOMMENDATION_SOURCE_SURFACES,
  isShoppingRecommendationFeedbackAction,
  isShoppingRecommendationFeedbackReason,
  type ShoppingFeedbackRecord,
  type ShoppingProduct,
  type ShoppingRecommendationFeedbackAction,
  type ShoppingRecommendationFeedbackReason,
  type ShoppingRecommendationSourceSurface,
} from "../types/shoppingRecommendations";

export type RecordShoppingRecommendationFeedbackInput = {
  productId: string;
  recommendationId?: string | null;
  action: ShoppingRecommendationFeedbackAction;
  reason?: ShoppingRecommendationFeedbackReason | null;
  sourceSurface?: ShoppingRecommendationSourceSurface | null;
  productSnapshot?: Partial<ShoppingProduct> | null;
};

export type GetShoppingRecommendationFeedbackOptions = {
  limit?: number;
};

export type ShoppingRecommendationFeedbackProductState = {
  savedProductIds: string[];
  dismissedProductIds: string[];
  purchasedProductIds: string[];
};

const DEFAULT_FEEDBACK_LIMIT = 100;
const MAX_FEEDBACK_LIMIT = 250;
const MEANINGFUL_FEEDBACK_ACTIONS = new Set<ShoppingRecommendationFeedbackAction>([
  "saved",
  "dismissed",
  "purchased",
]);

function feedbackCollection(uid: string) {
  return collection(db, "users", uid, "shoppingRecommendationFeedback");
}

function cleanString(value: unknown, maxLength = 240) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function cleanStringList(value: unknown, maxItems = 20, maxLength = 80) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => cleanString(entry, maxLength))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, maxItems);
}

function cleanNumber(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeLimit(value: unknown) {
  const requested = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_FEEDBACK_LIMIT;
  return Math.max(1, Math.min(Math.floor(requested), MAX_FEEDBACK_LIMIT));
}

function isShoppingRecommendationSourceSurface(
  value: unknown
): value is ShoppingRecommendationSourceSurface {
  return (SHOPPING_RECOMMENDATION_SOURCE_SURFACES as readonly unknown[]).includes(value);
}

function cleanProductSnapshot(
  value: Partial<ShoppingProduct> | null | undefined,
  fallbackProductId: string
): Partial<ShoppingProduct> | undefined {
  if (!value || typeof value !== "object") return undefined;

  const snapshot: Partial<ShoppingProduct> = {
    id: cleanString(value.id, 160) ?? fallbackProductId,
  };
  const providerProductId = cleanString(value.providerProductId, 160);
  const retailer = cleanString(value.retailer, 120);
  const title = cleanString(value.title, 240);
  const url = cleanString(value.url, 2000);
  const imageUrl = cleanString(value.imageUrl, 2000);
  const price = cleanNumber(value.price);
  const currency = cleanString(value.currency, 12);
  const brand = cleanString(value.brand, 120);
  const category = cleanString(value.category, 120);
  const subcategory = cleanString(value.subcategory, 120);
  const material = cleanString(value.material, 120);
  const source = cleanString(value.source, 120);

  if (providerProductId) snapshot.providerProductId = providerProductId;
  if (retailer) snapshot.retailer = retailer;
  if (title) snapshot.title = title;
  if (url) snapshot.url = url;
  if (imageUrl) snapshot.imageUrl = imageUrl;
  if (price != null) snapshot.price = price;
  if (currency) snapshot.currency = currency;
  if (brand) snapshot.brand = brand;
  if (category) snapshot.category = category;
  if (subcategory) snapshot.subcategory = subcategory;
  if (material) snapshot.material = material;
  if (source) snapshot.source = source;

  const colours = cleanStringList(value.colours);
  const sizesAvailable = cleanStringList(value.sizesAvailable);
  const styleTags = cleanStringList(value.styleTags);
  const seasonTags = cleanStringList(value.seasonTags);
  const occasionTags = cleanStringList(value.occasionTags);

  if (colours.length) snapshot.colours = colours;
  if (sizesAvailable.length) snapshot.sizesAvailable = sizesAvailable;
  if (styleTags.length) snapshot.styleTags = styleTags;
  if (seasonTags.length) snapshot.seasonTags = seasonTags;
  if (occasionTags.length) snapshot.occasionTags = occasionTags;
  if (typeof value.inStock === "boolean") snapshot.inStock = value.inStock;

  return snapshot;
}

function toFeedbackRecord(
  id: string,
  uid: string,
  data: Record<string, unknown>
): ShoppingFeedbackRecord | null {
  const productId = cleanString(data.productId, 160);
  if (!productId || !isShoppingRecommendationFeedbackAction(data.action)) return null;

  const userId = cleanString(data.userId, 160);
  if (userId && userId !== uid) return null;

  const reason = isShoppingRecommendationFeedbackReason(data.reason)
    ? data.reason
    : undefined;
  const sourceSurface = isShoppingRecommendationSourceSurface(data.sourceSurface)
    ? data.sourceSurface
    : undefined;
  const recommendationId = cleanString(data.recommendationId, 160) ?? undefined;
  const productSnapshot =
    data.productSnapshot && typeof data.productSnapshot === "object"
      ? cleanProductSnapshot(data.productSnapshot as Partial<ShoppingProduct>, productId)
      : undefined;

  return {
    id,
    userId: uid,
    productId,
    recommendationId,
    action: data.action,
    reason,
    sourceSurface,
    productSnapshot,
    createdAt: data.createdAt,
  };
}

function feedbackTimestampValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object") {
    const timestamp = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
    if (typeof timestamp.seconds === "number") {
      return timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds ?? 0) / 1000000);
    }
  }
  return 0;
}

function latestMeaningfulActionsByProduct(records: ShoppingFeedbackRecord[]) {
  const latest = new Map<string, ShoppingRecommendationFeedbackAction>();
  records
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const timeDelta =
        feedbackTimestampValue(right.record.createdAt) -
        feedbackTimestampValue(left.record.createdAt);
      return timeDelta || left.index - right.index;
    })
    .forEach(({ record }) => {
      if (!MEANINGFUL_FEEDBACK_ACTIONS.has(record.action)) return;
      if (!latest.has(record.productId)) {
        latest.set(record.productId, record.action);
      }
    });
  return latest;
}

export function getShoppingRecommendationFeedbackProductState(
  records: ShoppingFeedbackRecord[]
): ShoppingRecommendationFeedbackProductState {
  const latest = latestMeaningfulActionsByProduct(records);
  const savedProductIds: string[] = [];
  const dismissedProductIds: string[] = [];
  const purchasedProductIds: string[] = [];

  latest.forEach((action, productId) => {
    if (action === "saved") savedProductIds.push(productId);
    if (action === "dismissed") dismissedProductIds.push(productId);
    if (action === "purchased") {
      savedProductIds.push(productId);
      purchasedProductIds.push(productId);
    }
  });

  return {
    savedProductIds,
    dismissedProductIds,
    purchasedProductIds,
  };
}

export async function recordShoppingRecommendationFeedback(
  input: RecordShoppingRecommendationFeedbackInput
): Promise<ShoppingFeedbackRecord | null> {
  const uid = auth.currentUser?.uid ?? null;
  if (!uid || !isShoppingRecommendationFeedbackAction(input.action)) return null;

  const productId = cleanString(input.productId, 160);
  if (!productId) return null;

  if (input.reason && !isShoppingRecommendationFeedbackReason(input.reason)) {
    return null;
  }

  if (input.sourceSurface && !isShoppingRecommendationSourceSurface(input.sourceSurface)) {
    return null;
  }

  const recommendationId = cleanString(input.recommendationId, 160);
  const productSnapshot = cleanProductSnapshot(input.productSnapshot, productId);
  const createdAt = serverTimestamp();
  const payload = {
    userId: uid,
    productId,
    action: input.action,
    createdAt,
    ...(recommendationId ? { recommendationId } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.sourceSurface ? { sourceSurface: input.sourceSurface } : {}),
    ...(productSnapshot ? { productSnapshot } : {}),
  };

  const ref = await addDoc(feedbackCollection(uid), payload);
  return {
    id: ref.id,
    ...payload,
  };
}

export async function getShoppingRecommendationFeedback(
  options?: GetShoppingRecommendationFeedbackOptions
): Promise<ShoppingFeedbackRecord[]> {
  const uid = auth.currentUser?.uid ?? null;
  if (!uid) return [];

  const snap = await getDocs(
    query(
      feedbackCollection(uid),
      orderBy("createdAt", "desc"),
      limitQuery(normalizeLimit(options?.limit))
    )
  );

  return snap.docs
    .map((entry) => toFeedbackRecord(entry.id, uid, entry.data() as Record<string, unknown>))
    .filter((entry): entry is ShoppingFeedbackRecord => Boolean(entry));
}

export async function getSavedShoppingProductIds() {
  return getShoppingRecommendationFeedbackProductState(
    await getShoppingRecommendationFeedback()
  ).savedProductIds;
}

export async function getDismissedShoppingProductIds() {
  return getShoppingRecommendationFeedbackProductState(
    await getShoppingRecommendationFeedback()
  ).dismissedProductIds;
}

export async function hasUserDismissedProduct(productId: string) {
  const normalizedProductId = cleanString(productId, 160);
  if (!normalizedProductId) return false;
  const dismissedProductIds = await getDismissedShoppingProductIds();
  return dismissedProductIds.includes(normalizedProductId);
}
