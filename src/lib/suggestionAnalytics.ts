import { addDoc, collection, serverTimestamp } from "firebase/firestore";

import { db } from "@/src/lib/firebase";
import type { WardrobeSuggestion } from "@/src/lib/wardrobeSuggestions";

export type SuggestionAnalyticsEventName =
  | "suggestion_viewed"
  | "suggestion_clicked"
  | "shop_options_opened"
  | "affiliate_product_clicked"
  | "suggestion_dismissed"
  | "suggestion_saved"
  | "product_search_requested"
  | "product_search_succeeded"
  | "product_search_failed"
  | "product_search_cache_hit"
  | "product_search_cache_miss"
  | "live_product_rendered";

export type SuggestionSourceScreen = "home" | "insights" | "aura_chat" | "outfit_card";

export type TrackSuggestionEventInput = {
  userId?: string | null;
  eventName: SuggestionAnalyticsEventName;
  suggestion: Pick<WardrobeSuggestion, "id" | "itemType" | "category">;
  sourceScreen: SuggestionSourceScreen;
  merchant?: string | null;
  provider?: "serpapi" | null;
  resultCount?: number | null;
  cacheHit?: boolean | null;
  errorCode?: string | null;
  productSource?: "live" | "curated" | null;
  affiliateEligible?: boolean | null;
};

export async function trackSuggestionEvent({
  userId,
  eventName,
  suggestion,
  sourceScreen,
  merchant,
  provider,
  resultCount,
  cacheHit,
  errorCode,
  productSource,
  affiliateEligible,
}: TrackSuggestionEventInput) {
  if (!userId) return;
  const timestamp = Date.now();
  try {
    await addDoc(collection(db, "users", userId, "commerceEvents"), {
      type: eventName,
      eventName,
      userId,
      suggestionId: suggestion.id,
      itemType: suggestion.itemType,
      category: suggestion.category,
      sourceScreen,
      merchant: merchant ?? null,
      provider: provider ?? null,
      resultCount: resultCount ?? null,
      cacheHit: cacheHit ?? null,
      errorCode: errorCode ?? null,
      productSource: productSource ?? null,
      affiliateEligible: affiliateEligible ?? null,
      timestamp,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Analytics must never block styling or shopping flows.
  }
}
