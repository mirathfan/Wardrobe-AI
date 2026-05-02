import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import OpenAI from "openai";

import { AURA_INSTRUCTIONS, AURA_STREAM_INSTRUCTIONS } from "./shared/auraPrompt";
import {
  candidatePreviewResponse,
  candidatesFromProductExtractions,
  extractImageCandidates,
  fallbackImageCandidates,
  productCategoryHintsFromText,
  rankProductExtractionImages,
  rankProductLinkImages,
  type AuraCandidateItem,
} from "./shared/auraCandidatePreview";
import { classifyAuraLinkIntent, extractUrlsFromText } from "./shared/auraLinkIntent";
import { buildAuraContext } from "./shared/buildAuraContext";
import { loadCompactAuraMemoryContext } from "./shared/auraMemory";
import {
  analyzeOutfitPhoto,
  isOutfitPhotoRequest,
  safeAuraVisionError,
} from "./shared/auraOutfitPhotoAnalysis";
import { dedupeAuraLookAccessories } from "./shared/auraAccessorySelection";
import { type WardrobeGapSuggestion } from "./shared/detectWardrobeGaps";
import { loadAuraUserProfile } from "./shared/loadAuraUserProfile";
import { handleLaundryIntent } from "./shared/laundryIntent";
import { extractProductUrlMetadata } from "./shared/productUrlMetadata";
import {
  ProductLinkError,
  extractProductFromUrl,
} from "./shared/productLinkExtractor";
import { redactUrlForLogs } from "./shared/safeFetch";
import {
  attachmentContextText,
  buildAuraVisionImageInputs,
  imageGroupsForAddIntent,
  parseAuraAttachments,
  safeUrlHost,
} from "./shared/auraStreamAttachments";
import {
  buildCompactAuraContextForSimpleChat,
  buildMultiLookRequestNote,
  parseRequestedLookCount,
  shouldUseSimpleChatPath,
  wantsMultipleLooks,
} from "./shared/auraStreamRouting";
import {
  setupAuraStreamResponse,
  writeError,
  writeFinal,
  writeStatus,
  writeTextDelta,
  type AuraStreamWriter,
} from "./shared/auraStreamSse";

const db = getFirestore();
const AURA_BACKEND_VERSION = "candidate-preview-url-v9-zara-product-api";
const DEBUG_AURA_SPARSE =
  process.env.FUNCTIONS_EMULATOR === "true" || process.env.NODE_ENV !== "production";

function sanitizeUserInput(input: string): string {
  return input
    .trim()
    .replace(/\0/g, "")
    .slice(0, 2000)
    .replace(/ignore previous instructions/gi, "")
    .replace(/forget everything/gi, "")
    .replace(/you are now/gi, "")
    .replace(/system:/gi, "")
    .replace(/assistant:/gi, "");
}

function styleCoreNoteFromClientContext(value: unknown) {
  const context = (value && typeof value === "object"
    ? (value as Record<string, unknown>).minimumCloset
    : null) as Record<string, unknown> | null;
  if (!context || typeof context !== "object") return "";

  const progress = String(context.styleCoreProgress ?? "").trim();
  const nextBestAdd = String(context.nextBestAdd ?? "").trim();
  const outfitRange = Number(context.outfitRange ?? 0);
  const nudge = String(context.nudge ?? "").trim();

  return [
    progress ? `Style core: ${progress}.` : "",
    nextBestAdd ? `Next best add: ${nextBestAdd}.` : "",
    Number.isFinite(outfitRange) && outfitRange > 0 ? `Outfit range signal: ${outfitRange}+ paths.` : "",
    nudge,
    "Use this naturally; do not say minimum closet target, estimated combinations, or missing categories.",
  ].filter(Boolean).join(" ");
}

type AuraResponse = {
  presentation: "chat" | "card" | "candidate_preview" | "outfit_analysis" | "laundry_confirmation";
  title: string;
  reply: string;
  reason: string;
  outfitItems: string[];
  ownedPieces: string[];
  recommendedAdditions: string[];
  swapSuggestion: string;
  missingPieces?: string[];
  upgradeSuggestions?: string[];
  upgradeSuggestionItems?: {
    label: string;
    searchQuery?: string;
  }[];
  chips: string[];
  look: {
    lookTitle: string;
    vibe: string;
    shortExplanation: string;
    stylingNote: string;
    personalizationLabel?: string;
    personalizationNote?: string;
    pieces: {
      role: "top" | "bottom" | "shoes" | "outerwear" | "accessory";
      itemName: string;
      source: "closet" | "suggested";
      itemId: string | null;
      imageUrl: string | null;
    }[];
    fromCloset: string[];
    addToComplete: string[];
    alternates: string[];
    actions: (
      "saveLook" | "planForToday" | "likeLook" | "notMyVibe" | "showMoreLikeThis" | "lessLikeThis" | "shopMissingPieces" | "useOnlyMyCloset" | "makeItDressier"
    )[];
  } | null;
  lookOptions?: {
    lookTitle: string;
    vibe: string;
    shortExplanation: string;
    stylingNote: string;
    personalizationLabel?: string;
    personalizationNote?: string;
    pieces: {
      role: "top" | "bottom" | "shoes" | "outerwear" | "accessory";
      itemName: string;
      source: "closet" | "suggested";
      itemId: string | null;
      imageUrl: string | null;
    }[];
    fromCloset: string[];
    addToComplete: string[];
    alternates: string[];
    actions: (
      "saveLook" | "planForToday" | "likeLook" | "notMyVibe" | "showMoreLikeThis" | "lessLikeThis" | "shopMissingPieces" | "useOnlyMyCloset" | "makeItDressier"
    )[];
  }[];
  candidates?: AuraCandidateItem[];
  candidateItems?: AuraCandidateItem[];
  laundryAction?: {
    targetStatus: "clean" | "needs_wash" | "in_laundry";
    matches: { itemId: string; label: string; subtitle?: string }[];
  };
};

type AuraLinkPreview = {
  sourceUrl: string;
  title: string | null;
  imageUrl: string | null;
  imageUrls?: string[];
  description: string | null;
};

function shortenLookReply(text: string) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return trimmed;
  if (trimmed.length <= 120) return trimmed;
  const sentence = trimmed.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim();
  if (sentence && sentence.length <= 120) return sentence;
  return `${trimmed.slice(0, 117).trimEnd()}...`;
}

function uniqueActions(actions: string[]) {
  return Array.from(new Set(actions.filter(Boolean)));
}

const PERSONALIZATION_BLOCKLIST = [
  /stored preferences?/i,
  /profile data/i,
  /learned memory/i,
  /memory suggests/i,
  /your profile says/i,
  /\bdata suggests\b/i,
];

function cleanPersonalizationText(text: string, maxLength: number) {
  const trimmed = String(text ?? "")
    .replace(/\s+/g, " ")
    .replace(/^["'`\-–—\s]+|["'`\-–—\s]+$/g, "")
    .trim();
  if (!trimmed) return "";
  if (PERSONALIZATION_BLOCKLIST.some((pattern) => pattern.test(trimmed))) {
    return "";
  }
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 3).trimEnd()}...`;
}

function fallbackPersonalization(
  auraContext?: {
    preferenceContext?: {
      explicitProfile?: {
        styleVibes?: string[];
        preferredFits?: string[];
        favoriteColors?: string[];
        experimentationLevel?: "low" | "medium" | "high";
      } | null;
      learnedProfile?: {
        confidence?: number;
        inferredFavoriteColors?: string[];
        inferredFits?: string[];
      } | null;
      session?: {
        currentOccasion?: string;
        vibeForThisSession?: string;
      } | null;
    } | null;
  }
) {
  const explicit = auraContext?.preferenceContext?.explicitProfile;
  const learned = auraContext?.preferenceContext?.learnedProfile;
  const session = auraContext?.preferenceContext?.session;
  const learnedConfidence = learned?.confidence ?? 0;

  if (session?.currentOccasion && session?.vibeForThisSession) {
    return {
      label: `Right for ${session.currentOccasion}`,
      note: `It keeps the ${session.vibeForThisSession} tone, but still feels polished enough for ${session.currentOccasion}.`,
    };
  }

  if (session?.vibeForThisSession) {
    return {
      label: `Set to ${session.vibeForThisSession}`,
      note: `This keeps the mood pointed toward ${session.vibeForThisSession} without losing polish.`,
    };
  }
  if (session?.currentOccasion) {
    return {
      label: `Built for ${session.currentOccasion}`,
      note: `It is shaped around ${session.currentOccasion} first, so it feels right for the moment instead of generic.`,
    };
  }
  if (explicit?.styleVibes?.length && explicit?.favoriteColors?.length) {
    const vibe = explicit.styleVibes[0];
    const color = explicit.favoriteColors[0];
    if (explicit.experimentationLevel === "high") {
      return {
        label: "A touch bolder",
        note: `It still sits inside your ${vibe} lane, just with a slightly bolder ${color}-leaning twist.`,
      };
    }
    return {
      label: `Feels like your ${vibe} side`,
      note: `It stays close to your ${vibe} direction and keeps the palette near shades that already feel easy on you.`,
    };
  }
  if (explicit?.preferredFits?.length) {
    const fit = explicit.preferredFits[0];
    return {
      label: `Leans ${fit} in fit`,
      note: `The proportions stay closer to the ${fit} fit you naturally wear well.`,
    };
  }
  if (explicit?.styleVibes?.length) {
    const vibe = explicit.styleVibes[0];
    if (explicit.experimentationLevel === "high") {
      return {
        label: "A little bolder than usual",
        note: `It still sits inside your ${vibe} lane, just with a slightly more adventurous edge.`,
      };
    }
    if (explicit.experimentationLevel === "low") {
      return {
        label: "Closer to your usual lane",
        note: `This keeps things grounded in the ${vibe} direction you already gravitate toward.`,
      };
    }
    return {
      label: `Works for your ${vibe} style`,
      note: `It stays close to the ${vibe} direction that already feels natural on you.`,
    };
  }
  if (learnedConfidence >= 0.62 && learned?.inferredFavoriteColors?.length) {
    return {
      label: "Closer to your usual palette",
      note: "The palette stays near the colors you seem to keep coming back to, so it still feels familiar in a good way.",
    };
  }
  if (learnedConfidence >= 0.62 && learned?.inferredFits?.length) {
    return {
      label: `Feels more ${learned.inferredFits[0]}`,
      note: "The proportions stay near the shapes you seem to respond to best.",
    };
  }
  if (learnedConfidence >= 0.42 && learned?.inferredFavoriteColors?.length) {
    return {
      label: "Still feels like you",
      note: "This keeps the palette in a range that already seems easy for you to wear.",
    };
  }
  return {label: "", note: ""};
}

function normalizeLookSurface(
  look: NonNullable<AuraResponse["look"]>,
  auraContext?: {
    wardrobe?: {
      footwear?: Record<string, string>[];
    };
    preferenceContext?: {
      explicitProfile?: {
        styleVibes?: string[];
        preferredFits?: string[];
        experimentationLevel?: "low" | "medium" | "high";
        favoriteColors?: string[];
      } | null;
      learnedProfile?: {
        confidence?: number;
        inferredFavoriteColors?: string[];
        inferredFits?: string[];
      } | null;
      session?: {
        currentOccasion?: string;
        vibeForThisSession?: string;
      } | null;
    } | null;
  }
) {
  if (look.stylingNote) {
    look.stylingNote = shortenLookReply(look.stylingNote);
  }

  const accessorySelection = dedupeAuraLookAccessories(
    look,
    auraContext?.preferenceContext ?? null
  );
  look.pieces = accessorySelection.pieces;
  if (DEBUG_AURA_SPARSE && accessorySelection.discarded.length > 0) {
    logger.info("[AURA_ACCESSORY_SLOT]", {
      discarded: accessorySelection.discarded.map((entry) => entry.reason),
    });
  }

  const ownedPieces = look.pieces
    .filter((piece) => piece.source === "closet")
    .map((piece) => piece.itemName)
    .filter(Boolean);
  const suggestedPieces = look.pieces
    .filter((piece) => piece.source === "suggested")
    .map((piece) => piece.itemName)
    .filter(Boolean);

  look.fromCloset = Array.from(new Set(ownedPieces));
  look.addToComplete = Array.from(
    new Set(suggestedPieces.filter((piece) => !look.fromCloset.includes(piece)))
  );
  look.actions = uniqueActions([
    ...(look.actions ?? []),
    "likeLook",
    "notMyVibe",
    "showMoreLikeThis",
    "lessLikeThis",
    "useOnlyMyCloset",
    "makeItDressier",
    "shopMissingPieces",
  ]) as NonNullable<AuraResponse["look"]>["actions"];

  const personalization = fallbackPersonalization(auraContext);
  look.personalizationLabel =
    cleanPersonalizationText(String(look.personalizationLabel ?? ""), 38) ||
    personalization.label;
  look.personalizationNote =
    cleanPersonalizationText(String(look.personalizationNote ?? ""), 150) ||
    personalization.note;

  return {
    ownedPieces: look.fromCloset,
    recommendedAdditions: look.addToComplete,
  };
}

function normalizeAuraResponse(
  response: AuraResponse,
  userMessage?: string,
  auraContext?: {
    wardrobe?: {
      footwear?: Record<string, string>[];
    };
    categoryCounts?: {
      tops: number;
      bottoms: number;
      footwear: number;
      outerwear: number;
      accessories: number;
    };
    isSparseWardrobe?: boolean;
    wardrobeGaps?: {
      missingCore?: { label: string }[];
      weakAreas?: { label: string }[];
      suggestions?: WardrobeGapSuggestion[];
    };
    preferenceContext?: {
      explicitProfile?: {
        styleVibes?: string[];
        preferredFits?: string[];
        experimentationLevel?: "low" | "medium" | "high";
      } | null;
      learnedProfile?: {
        confidence?: number;
        inferredFavoriteColors?: string[];
        inferredFits?: string[];
      } | null;
      session?: {
        currentOccasion?: string;
        vibeForThisSession?: string;
      } | null;
    } | null;
  }
) {
  const multiRequested = wantsMultipleLooks(userMessage ?? "");
  if (response.lookOptions?.length) {
    response.lookOptions = response.lookOptions.slice(0, 3);
  }

  if (response.look || response.lookOptions?.length) {
    response.reply = shortenLookReply(response.reply);
    response.reason = "";
  }

  if (response.look) {
    const normalized = normalizeLookSurface(response.look, auraContext);
    response.ownedPieces = normalized.ownedPieces;
    response.recommendedAdditions = normalized.recommendedAdditions;

    const eligibleFootwear = auraContext?.wardrobe?.footwear ?? [];
    const selectedOwnedFootwear = response.look.pieces.filter(
      (piece) => piece.role === "shoes" && piece.source === "closet"
    );
    const selectedSuggestedFootwear = response.look.pieces.filter(
      (piece) => piece.role === "shoes" && piece.source === "suggested"
    );

    if (eligibleFootwear.length > 0 && selectedOwnedFootwear.length === 0) {
      logger.info("AURA stream footwear mismatch", {
        eligibleFootwear,
        selectedSuggestedFootwear,
        selectedPieces: response.look.pieces,
      });
    }
  }
  if (!response.look && response.lookOptions?.length) {
    response.look = response.lookOptions[0];
  }
  if (response.lookOptions?.length) {
    response.lookOptions = response.lookOptions.map((look) => {
      normalizeLookSurface(look, auraContext);
      return look;
    });
  }
  if (multiRequested && !response.lookOptions?.length && response.look) {
    logger.warn("[AURA_MULTI] stream multi-look request returned only one structured look", {
      requestedCount: parseRequestedLookCount(userMessage ?? ""),
      lookTitle: response.look.lookTitle,
    });
    response.lookOptions = [response.look];
  }
  if (multiRequested && !response.look && !response.lookOptions?.length) {
    logger.warn("[AURA_MULTI] stream multi-look request returned no structured looks", {
      requestedCount: parseRequestedLookCount(userMessage ?? ""),
      title: response.title,
      reply: response.reply,
      ownedPiecesCount: response.ownedPieces?.length ?? 0,
      recommendedAdditionsCount: response.recommendedAdditions?.length ?? 0,
      outfitItemsCount: response.outfitItems?.length ?? 0,
    });
  }

  const gapContext = auraContext?.wardrobeGaps;
  const derivedMissing = uniqueTrimmed([
    ...(response.missingPieces ?? []),
    ...(auraContext?.isSparseWardrobe
      ? [
          ...(gapContext?.missingCore?.map((gap) => gap.label) ?? []),
          ...(gapContext?.weakAreas?.slice(0, 1).map((gap) => gap.label) ?? []),
        ]
      : gapContext?.missingCore?.map((gap) => gap.label) ?? []),
  ]);
  const derivedSuggestions = uniqueTrimmed([
    ...(response.upgradeSuggestions ?? []),
    ...((gapContext?.suggestions ?? []).map((suggestion) => suggestion.label) ?? []),
  ]);

  const maxSuggestionCount = auraContext?.isSparseWardrobe ? 3 : 2;
  response.missingPieces = derivedMissing.slice(0, maxSuggestionCount);
  response.upgradeSuggestions = derivedSuggestions
    .filter((suggestion) => !response.missingPieces?.includes(suggestion))
    .slice(0, maxSuggestionCount);
  response.upgradeSuggestionItems = normalizeSuggestionItems(
    response.upgradeSuggestionItems,
    response.upgradeSuggestions,
    gapContext?.suggestions ?? []
  ).filter((item) => !response.missingPieces?.includes(item.label));

  if (!auraContext?.isSparseWardrobe && !(gapContext?.missingCore?.length ?? 0)) {
    response.missingPieces = response.missingPieces?.slice(0, 1) ?? [];
    response.upgradeSuggestions = response.upgradeSuggestions?.slice(0, 1) ?? [];
    response.upgradeSuggestionItems = response.upgradeSuggestionItems?.slice(0, 1) ?? [];
  }

  if (DEBUG_AURA_SPARSE) {
    logger.info("[AURA_SPARSE_NORMALIZED]", {
      isSparseWardrobe: auraContext?.isSparseWardrobe ?? false,
      categoryCounts: auraContext?.categoryCounts ?? null,
      detectedGaps: {
        missingCore: gapContext?.missingCore?.map((gap) => gap.label) ?? [],
        weakAreas: gapContext?.weakAreas?.map((gap) => gap.label) ?? [],
      },
      missingPieces: response.missingPieces ?? [],
      upgradeSuggestions: response.upgradeSuggestions ?? [],
      upgradeSuggestionItems: response.upgradeSuggestionItems ?? [],
    });
  }

  return response;
}

function fallbackAuraResponse(reply: string): AuraResponse {
  return {
    presentation: "chat",
    title: "AURA",
    reply,
    reason: "",
    outfitItems: [],
    ownedPieces: [],
    recommendedAdditions: [],
    swapSuggestion: "",
    missingPieces: [],
    upgradeSuggestions: [],
    upgradeSuggestionItems: [],
    chips: [],
    look: null,
    lookOptions: [],
  };
}

function uniqueTrimmed(values: string[] | undefined, max = 3) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  ).slice(0, max);
}

function normalizeSuggestionItems(
  items: AuraResponse["upgradeSuggestionItems"] | undefined,
  fallbackSuggestions: string[],
  contextSuggestions: WardrobeGapSuggestion[]
) {
  const entries: [string, { label: string; searchQuery?: string }][] = [];
  for (const item of items ?? []) {
    const label = String(item?.label ?? "").trim();
    if (!label) continue;
    const searchQuery = String(item?.searchQuery ?? "").trim();
    entries.push([label.toLowerCase(), { label, searchQuery: searchQuery || undefined }]);
  }
  const normalizedItems = Array.from(new Map(entries).values());

  if (normalizedItems.length) return normalizedItems.slice(0, 3);

  return fallbackSuggestions
    .map((label) => {
      const match = contextSuggestions.find(
        (suggestion) => suggestion.label.toLowerCase() === label.toLowerCase()
      );
      return {
        label,
        searchQuery: match?.searchQuery,
      };
    })
    .filter((item) => item.label)
    .slice(0, 3);
}

function isHmProductUrl(rawUrl?: string | null) {
  try {
    const url = new URL(String(rawUrl ?? ""));
    const host = url.hostname.toLowerCase();
    return (
      (host === "hm.com" || host.endsWith(".hm.com")) &&
      /\/productpage\.\d+\.html$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function auraLinkErrorMessage(error: unknown) {
  if (error instanceof ProductLinkError) {
    if (error.code === "invalid_url") return "That product link does not look valid.";
    if (error.code === "unsafe_url") return "I cannot fetch that kind of link.";
    if (error.code === "fetch_failed") {
      return "I couldn't read that product link. Try another link or upload a photo.";
    }
    if (error.code === "no_metadata") {
      return "I couldn't find product details on that page. Try another link or upload a photo.";
    }
    if (error.code === "no_images") {
      return "I couldn't find usable product images on that page. Try another link or upload a photo.";
    }
    if (error.code === "draft_failed") {
      return "I found the product, but couldn't create a wardrobe draft.";
    }
  }
  return "I couldn't read that product link. Try another link or upload a photo.";
}

function productContextText(
  products: Awaited<ReturnType<typeof extractProductFromUrl>>[],
) {
  return JSON.stringify(
    products.map((product) => ({
      metadata: product.metadata,
      imageUrls: product.imageUrls.slice(0, 4),
    })),
    null,
    2,
  );
}

function logStreamCandidateEmit(
  uid: string,
  source: "image" | "link",
  data: ReturnType<typeof candidatePreviewResponse>,
) {
  const payload = { type: "final", data };
  const serialized = JSON.stringify(payload);
  logger.info("[AURA_STREAM_EMIT] candidate final payload", {
    uid,
    source,
    dataKeys: Object.keys(data),
    payloadKeys: Object.keys(payload),
    candidateItemsCount: data.candidateItems.length,
    candidatesCount: data.candidates.length,
    presentation: data.presentation,
    serializedLength: serialized.length,
    serializedPreview: serialized.slice(0, 1200),
  });
}

function mergeUrlMetadataIntoCandidate(
  candidate: AuraCandidateItem,
  metadata: Awaited<ReturnType<typeof extractProductUrlMetadata>> | AuraLinkPreview,
): AuraCandidateItem {
  const amount = "priceAmount" in metadata ? metadata.priceAmount ?? null : null;
  const currency =
    "priceCurrency" in metadata
      ? metadata.priceCurrency ?? metadata.currency ?? null
      : null;
  const priceFields =
    typeof amount === "number" && Number.isFinite(amount)
      ? {
          retailPrice: amount,
          purchasePrice: amount,
          estimatedValue: amount,
          currency,
          originalPrice: amount,
          originalCurrency: currency,
          priceSource: "product_link" as const,
          priceDisplay:
            "priceDisplay" in metadata
              ? metadata.priceDisplay ?? metadata.price ?? null
              : null,
        }
      : {};
  return {
    ...candidate,
    candidateId: `url-${Date.now()}-0`,
    imageUrls:
      "imageUrls" in metadata && Array.isArray(metadata.imageUrls) && metadata.imageUrls.length
        ? metadata.imageUrls
        : metadata.imageUrl
          ? [metadata.imageUrl]
          : candidate.imageUrls,
    title: candidate.title ?? metadata.title,
    category: candidate.category ?? ("category" in metadata ? metadata.category ?? null : null),
    subCategory: candidate.subCategory ?? ("subCategory" in metadata ? metadata.subCategory ?? null : null),
    brand: candidate.brand ?? ("brand" in metadata ? metadata.brand ?? null : null),
    confidence: candidate.confidence ?? ("confidence" in metadata ? metadata.confidence ?? null : null),
    ...priceFields,
    sourceType: "link",
    sourceUrl: metadata.sourceUrl,
    status: "status" in metadata && metadata.status === "needs_review"
      ? "needs_review"
      : "awaiting_confirmation",
  };
}

function brandFromSourceUrl(sourceUrl?: string | null) {
  try {
    const host = new URL(String(sourceUrl ?? "")).hostname.replace(/^www\d*\./, "").toLowerCase();
    if (host.endsWith("hm.com")) return "H&M";
    if (host.endsWith("zara.com")) return "Zara";
    if (host.endsWith("nike.com")) return "Nike";
    const domain = host.split(".")[0] ?? "";
    return domain ? domain.charAt(0).toUpperCase() + domain.slice(1) : null;
  } catch {
    return null;
  }
}

function cleanProductTitle(title?: string | null, brand?: string | null) {
  let next = String(title ?? "").replace(/\s+/g, " ").trim();
  next = next
    .replace(/\s*\|\s*H\s*&\s*M(?:\s+[A-Z]{2})?\s*$/i, "")
    .replace(/\s*\|\s*Zara\s*$/i, "")
    .replace(/\s*\|\s*Nike\s*$/i, "")
    .replace(/^Men[’']s\s+/i, "")
    .replace(/^Women[’']s\s+/i, "")
    .replace(/^Ladies[’']?\s+/i, "")
    .trim();
  if (brand) {
    next = next
      .replace(new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "")
      .trim();
  }
  return next || title || null;
}

function cleanPreviewText(value: unknown, maxLength = 500) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizePreviewImage(sourceUrl: URL, value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.startsWith("data:")) return null;
  try {
    const imageUrl = new URL(raw, sourceUrl);
    if (imageUrl.protocol !== "http:" && imageUrl.protocol !== "https:") return null;
    imageUrl.hash = "";
    return imageUrl.toString();
  } catch {
    return null;
  }
}

function clientLinkPreviewFromRequest(value: unknown, detectedUrl: string | null): AuraLinkPreview | null {
  if (!value || typeof value !== "object" || !detectedUrl) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.sourceUrl !== "string") return null;
  try {
    const detected = new URL(detectedUrl);
    const source = new URL(candidate.sourceUrl);
    detected.hash = "";
    source.hash = "";
    if (detected.toString() !== source.toString()) return null;
    const imageUrl = normalizePreviewImage(source, candidate.imageUrl);
    const imageUrls = Array.isArray(candidate.imageUrls)
      ? candidate.imageUrls
          .map((url) => normalizePreviewImage(source, url))
          .filter((url): url is string => !!url)
      : [];
    const preview = {
      sourceUrl: detected.toString(),
      title: cleanPreviewText(candidate.title, 220),
      imageUrl,
      imageUrls: imageUrls.length ? imageUrls : imageUrl ? [imageUrl] : [],
      description: cleanPreviewText(candidate.description, 500),
    };
    return preview.imageUrls.length || preview.title || preview.description ? preview : null;
  } catch {
    return null;
  }
}

function hmSingleImageClientPreview(preview: AuraLinkPreview | null): AuraLinkPreview | null {
  if (!preview || !isHmProductUrl(preview.sourceUrl) || !preview.imageUrl) return null;
  return {
    ...preview,
    imageUrls: [preview.imageUrl],
  };
}

function hmSanitizedClientPreview(preview: AuraLinkPreview | null): AuraLinkPreview | null {
  if (!preview || !isHmProductUrl(preview.sourceUrl)) return null;
  const urls = [
    ...(Array.isArray(preview.imageUrls) ? preview.imageUrls : []),
    preview.imageUrl,
  ]
    .map((url) => String(url ?? "").trim())
    .filter((url) => {
      try {
        const parsed = new URL(url);
        return parsed.hostname.toLowerCase() === "image.hm.com";
      } catch {
        return false;
      }
    });
  const seen = new Set<string>();
  const imageUrls = urls
    .filter((url) => {
      const key = url.toLowerCase().replace(/([?&])(imwidth|width|height|w|h)=\d+/g, "$1");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 24);
  const imageUrl = imageUrls[0] ?? preview.imageUrl;
  return imageUrl
    ? {
        ...preview,
        imageUrl,
        imageUrls,
      }
    : null;
}

async function emitUrlCandidatePreview(params: {
  res: AuraStreamWriter & { end: () => void };
  client: OpenAI;
  uid: string;
  metadata: Awaited<ReturnType<typeof extractProductUrlMetadata>> | AuraLinkPreview;
}) {
  const rawImageUrls = [
    ...("imageUrls" in params.metadata && Array.isArray(params.metadata.imageUrls)
      ? params.metadata.imageUrls
      : []),
    params.metadata.imageUrl,
  ].filter((url): url is string => !!url);
  logger.info("[LINK_IMAGE_SOURCE] URL metadata image source", {
    uid: params.uid,
    sourceUrl: redactUrlForLogs(params.metadata.sourceUrl),
    rawImageCount: rawImageUrls.length,
    rawImageUrls: rawImageUrls.slice(0, 6).map((url) => redactUrlForLogs(url)),
  });
  const rankedImages = await rankProductLinkImages({
    client: params.client,
    imageUrls: rawImageUrls,
    title: params.metadata.title,
    description: params.metadata.description,
    sourceUrl: params.metadata.sourceUrl,
  });
  const rankedImageUrls = rankedImages.map((image) => image.url);
  const primaryImageUrl = rankedImageUrls[0] ?? null;
  const titleHints = productCategoryHintsFromText(params.metadata.title, params.metadata.description);
  logger.info("[LINK_EXTRACTION_TARGET]", {
    uid: params.uid,
    sourceUrl: redactUrlForLogs(params.metadata.sourceUrl),
    title: params.metadata.title,
    description: params.metadata.description,
    hintedCategory: titleHints.category,
    hintedSubCategory: titleHints.subCategory,
    chosenImage: redactUrlForLogs(primaryImageUrl),
    chosenImageReasons: rankedImages[0]?.reasons ?? [],
    rawImageCount: rawImageUrls.length,
    rankedImageCount: rankedImageUrls.length,
  });

  let candidates = primaryImageUrl
    ? await extractImageCandidates({
        client: params.client,
        imageGroups: [[primaryImageUrl]],
      })
    : [];
  if (!candidates.length && primaryImageUrl) {
    candidates = fallbackImageCandidates([[primaryImageUrl]]);
  }
  if (!candidates.length) {
    candidates = [
      {
        candidateId: `url-${Date.now()}-0`,
        imageUrls: [],
        title: params.metadata.title,
        category: null,
        subCategory: null,
        color: null,
        brand: null,
        material: null,
        fit: null,
        pattern: null,
        confidence: null,
        sourceType: "link",
        sourceUrl: params.metadata.sourceUrl,
        status: "awaiting_confirmation",
      },
    ];
  }
  const candidate = mergeUrlMetadataIntoCandidate(candidates[0], params.metadata);
  const needsReview = "status" in params.metadata && params.metadata.status === "needs_review";
  candidate.imageUrls = rankedImageUrls.length ? rankedImageUrls : candidate.imageUrls;
  candidate.primaryImageUrl = candidate.imageUrls[0] ?? null;
  candidate.secondaryImageUrls = candidate.imageUrls.slice(1);
  logger.info("[LINK_IMAGE_REVIEW_SET]", {
    uid: params.uid,
    sourceUrl: redactUrlForLogs(params.metadata.sourceUrl),
    candidateId: candidate.candidateId,
    primaryImageUrl: redactUrlForLogs(candidate.primaryImageUrl),
    imageUrls: candidate.imageUrls.slice(0, 8).map((url) => redactUrlForLogs(url)),
    secondaryImageUrls: candidate.secondaryImageUrls.slice(0, 8).map((url) => redactUrlForLogs(url)),
  });
  if (!needsReview) {
    candidate.category = titleHints.category ?? candidate.category;
    candidate.subCategory = titleHints.subCategory ?? candidate.subCategory;
    candidate.brand = candidate.brand && !/^no brand$/i.test(candidate.brand)
      ? candidate.brand
      : brandFromSourceUrl(params.metadata.sourceUrl);
  } else {
    candidate.category = candidate.category ?? null;
    candidate.subCategory = candidate.subCategory ?? null;
    candidate.brand = candidate.brand ?? null;
  }
  candidate.title = cleanProductTitle(params.metadata.title ?? candidate.title, candidate.brand);
  logger.info("[LINK_BRAND_NORMALIZE] candidate brand/title normalized", {
    uid: params.uid,
    sourceUrl: params.metadata.sourceUrl,
    rawTitle: params.metadata.title,
    savedBrand: candidate.brand,
    savedTitle: candidate.title,
  });
  logger.info("[AURA_URL_TO_CANDIDATE] converted URL metadata to candidate", {
    uid: params.uid,
    sourceUrl: params.metadata.sourceUrl,
    imageUrl: params.metadata.imageUrl,
    title: params.metadata.title,
    candidateId: candidate.candidateId,
    category: candidate.category,
    subCategory: candidate.subCategory,
    color: candidate.color,
    brand: candidate.brand,
  });
  const data = candidatePreviewResponse([candidate]);
  if (needsReview) {
    data.reply = "I couldn’t fully read this item — review before adding";
  }
  logger.info("[AURA_STREAM_PRE_EMIT] URL candidate final object", {
    uid: params.uid,
    branchChosen: "url_candidate_preview",
    finalPayloadKeys: Object.keys(data),
    presentation: data.presentation,
    candidateItemsLength: data.candidateItems.length,
    candidatesLength: data.candidates.length,
  });
  logStreamCandidateEmit(params.uid, "link", data);
  writeTextDelta(params.res, data.reply);
  writeFinal(params.res, data);
  params.res.end();
}

export const askAuraStream = onRequest(
  { cors: true, secrets: ["OPENAI_API_KEY"], timeoutSeconds: 120 },
  async (req, res) => {
    setupAuraStreamResponse(res);

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const authHeader = String(req.headers.authorization ?? "");
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";

    if (!idToken) {
      res.status(401).json({ error: "Missing auth token" });
      return;
    }

    try {
      logger.info("[AURA_BACKEND_VERSION] askAuraStream entry", {
        version: AURA_BACKEND_VERSION,
        method: req.method,
        requestKeys: Object.keys(req.body ?? {}),
        promptLength: typeof req.body?.message === "string" ? req.body.message.length : 0,
        attachmentCount: Array.isArray(req.body?.attachments) ? req.body.attachments.length : 0,
        clientIntent: typeof req.body?.clientIntent === "string" ? req.body.clientIntent : null,
      });
      const decodedToken = await getAuth().verifyIdToken(idToken);
      const uid = decodedToken.uid;
      const userMessage = sanitizeUserInput(String(req.body?.message ?? ""));
      const styleCoreNote = styleCoreNoteFromClientContext(req.body?.clientContext);
      const attachments = await parseAuraAttachments(uid, req.body?.attachments);
      const clientIntent = typeof req.body?.clientIntent === "string" ? req.body.clientIntent : null;
      const linkIntent = classifyAuraLinkIntent(userMessage);
      const detectedUrls = extractUrlsFromText(userMessage);
      const firstDetectedUrl = detectedUrls[0]?.normalized ?? null;
      const rawClientLinkPreview = clientLinkPreviewFromRequest(req.body?.linkPreview, firstDetectedUrl);
      const hmClientFallback = hmSanitizedClientPreview(rawClientLinkPreview) ?? hmSingleImageClientPreview(rawClientLinkPreview);
      const clientLinkPreview = isHmProductUrl(firstDetectedUrl) ? null : rawClientLinkPreview;
      const effectiveClientIntent = firstDetectedUrl ? "add_item_from_url" : clientIntent;
      if (firstDetectedUrl) {
        if (rawClientLinkPreview && !clientLinkPreview) {
          logger.info("[LINK_PRODUCT_SCOPE] ignored client H&M link preview; server scope required", {
            uid,
            urlHost: safeUrlHost(firstDetectedUrl),
            clientImageCount: rawClientLinkPreview.imageUrls?.length ?? 0,
            clientImageUrl: rawClientLinkPreview.imageUrl ?? null,
            sanitizedFallbackImageCount: hmClientFallback?.imageUrls?.length ?? 0,
          });
        }
        logger.info("[AURA_URL_DETECTED] URL detected in AURA message", {
          uid,
          urlHost: safeUrlHost(firstDetectedUrl),
          clientIntent,
          effectiveClientIntent,
          hasClientLinkPreview: !!clientLinkPreview,
          clientLinkPreviewHasImage: !!clientLinkPreview?.imageUrl,
        });
      }
      logger.info("[AURA_STREAM] request received", {
        uid,
        hasAuth: !!uid,
        hasMessage: !!userMessage,
        linkIntent,
        clientIntent: effectiveClientIntent,
        detectedUrlCount: detectedUrls.length,
        detectedDomains: detectedUrls.map((entry) => safeUrlHost(entry.normalized)),
        attachmentCount: attachments.length,
        attachments: attachments.map((attachment) => ({
          type: attachment.type,
          role: attachment.role ?? null,
          groupId: attachment.groupId ?? null,
          mimeType: attachment.mimeType ?? null,
          storagePath: attachment.storagePath ?? null,
          width: attachment.width ?? null,
          height: attachment.height ?? null,
          hasUri: !!attachment.uri,
          uriHost: safeUrlHost(attachment.uri),
        })),
      });
      const history = Array.isArray(req.body?.history)
        ? req.body.history
            .map((entry: unknown) => {
              if (!entry || typeof entry !== "object") return null;
              const candidate = entry as Record<string, unknown>;
              const role =
                candidate.role === "assistant"
                  ? "assistant"
                  : candidate.role === "user"
                    ? "user"
                    : null;
              const text = sanitizeUserInput(String(candidate.text ?? ""));
              if (!role || !text) return null;
              return { role, text };
            })
            .filter(
              (entry: { role: "user" | "assistant"; text: string } | null): entry is { role: "user" | "assistant"; text: string } =>
                !!entry
            )
            .slice(-8)
        : [];

      if (!userMessage && attachments.length === 0) {
        res.status(400).json({ error: "Message or attachment is required." });
        return;
      }

      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      const imageCandidateGroups = imageGroupsForAddIntent(userMessage, attachments, effectiveClientIntent);
      const shouldAnalyzeOutfitPhoto = isOutfitPhotoRequest({
        clientIntent: effectiveClientIntent,
        userMessage,
        attachments,
      });
      logger.info("[AURA_STREAM_INTENT] selected intent", {
        uid,
        selectedIntent: shouldAnalyzeOutfitPhoto
          ? "outfit_photo_analysis"
          : imageCandidateGroups.length > 0
            ? "image_candidate_preview"
            : firstDetectedUrl
              ? "product_link"
              : "general_chat",
        clientIntent,
        effectiveClientIntent,
        attachmentCount: attachments.length,
        imageAttachmentCount: attachments.filter((attachment) => attachment.type === "image").length,
        hasVisionPayload: attachments.some((attachment) => attachment.type === "image" && !!attachment.uri),
      });

      if (shouldAnalyzeOutfitPhoto) {
        writeStatus(res, "analyzing_outfit");
        logger.info("[AURA_OUTFIT_PHOTO] stream outfit analysis intent classified", {
          uid,
          clientIntent,
          effectiveClientIntent,
          attachmentCount: attachments.length,
          attachments: attachments.map((attachment) => ({
            type: attachment.type,
            mimeType: attachment.mimeType ?? null,
            storagePath: attachment.storagePath ?? null,
            uriHost: safeUrlHost(attachment.uri),
            width: attachment.width ?? null,
            height: attachment.height ?? null,
          })),
        });
        let data: ReturnType<typeof fallbackAuraResponse> | Awaited<ReturnType<typeof analyzeOutfitPhoto>>;
        try {
          data = await analyzeOutfitPhoto({ client, attachments, userMessage });
        } catch (error) {
          logger.error("[AURA_OUTFIT_PHOTO] stream vision analysis failed", {
            uid,
            clientIntent,
            effectiveClientIntent,
            attachmentCount: attachments.length,
            error: safeAuraVisionError(error),
          });
          data = fallbackAuraResponse("I couldn't read that image as a supported photo. Try sending it again as a JPEG or PNG.");
        }
        writeFinal(res, data);
        res.end();
        return;
      }

      if (firstDetectedUrl) {
        try {
          const metadata = await extractProductUrlMetadata(firstDetectedUrl);
          if (!metadata.imageUrl) {
            const fallbackPreview = clientLinkPreview ?? hmClientFallback;
            if (fallbackPreview?.imageUrl) {
              logger.info("[AURA_URL_METADATA] using client link preview after missing server image", {
                uid,
                urlHost: safeUrlHost(firstDetectedUrl),
                hasTitle: !!fallbackPreview.title,
                hasImageUrl: !!fallbackPreview.imageUrl,
                imageCount: fallbackPreview.imageUrls?.length ?? 0,
                sanitizedHmFallback: fallbackPreview === hmClientFallback,
              });
              await emitUrlCandidatePreview({
                res,
                client,
                uid,
                metadata: fallbackPreview,
              });
              return;
            }
            logger.warn("[AURA_URL_METADATA] no product image found for URL", {
              uid,
              urlHost: safeUrlHost(firstDetectedUrl),
            });
            const reply = "Couldn't read that link. Try a screenshot.";
            writeTextDelta(res, reply);
            writeFinal(res, fallbackAuraResponse(reply));
            res.end();
            return;
          }

          await emitUrlCandidatePreview({
            res,
            client,
            uid,
            metadata,
          });
          return;
        } catch (error) {
          const fallbackPreview = clientLinkPreview ?? hmClientFallback;
          if (fallbackPreview?.imageUrl) {
            logger.info("[AURA_URL_METADATA] using client link preview after server fetch failure", {
              uid,
              urlHost: safeUrlHost(firstDetectedUrl),
              hasTitle: !!fallbackPreview.title,
              hasImageUrl: !!fallbackPreview.imageUrl,
              imageCount: fallbackPreview.imageUrls?.length ?? 0,
              sanitizedHmFallback: fallbackPreview === hmClientFallback,
            });
            await emitUrlCandidatePreview({
              res,
              client,
              uid,
              metadata: fallbackPreview,
            });
            return;
          }
          logger.error("[AURA_URL_FETCH] failed to read product URL", {
            uid,
            urlHost: safeUrlHost(firstDetectedUrl),
            error,
          });
          const reply = "Couldn't read that link. Try a screenshot.";
          writeTextDelta(res, reply);
          writeFinal(res, fallbackAuraResponse(reply));
          res.end();
          return;
        }
      }

      if (imageCandidateGroups.length > 0) {
        writeStatus(res, "extracting_preview");
        logger.info("[AURA_CANDIDATE] image add intent classified", {
          uid,
          candidateCount: imageCandidateGroups.length,
        });
        try {
          let candidates = await extractImageCandidates({
            client,
            imageGroups: imageCandidateGroups,
          });
          if (!candidates.length) {
            logger.warn("[AURA_CANDIDATE_BACKEND] image extraction returned no candidates; using fallback", {
              uid,
              groupCount: imageCandidateGroups.length,
            });
            candidates = fallbackImageCandidates(imageCandidateGroups);
          }
          const data = candidatePreviewResponse(candidates);
          logger.info("[AURA_CANDIDATE_BACKEND] raw image candidate object before stream", {
            uid,
            keys: Object.keys(data),
            candidateItems: data.candidateItems,
          });
          logger.info("[AURA_STREAM_FINAL] emitting image candidate final", {
            uid,
            clientIntent,
            candidateCount: data.candidateItems.length,
            presentation: data.presentation,
            hasCandidateItems: !!data.candidateItems.length,
          });
          logger.info("[AURA_STREAM_PRE_EMIT] image candidate final object", {
            uid,
            branchChosen: "image_candidate_preview",
            finalPayloadKeys: Object.keys(data),
            presentation: data.presentation,
            candidateItemsLength: data.candidateItems.length,
            candidatesLength: data.candidates.length,
          });
          logStreamCandidateEmit(uid, "image", data);
          writeTextDelta(res, data.reply);
          writeFinal(res, data);
          res.end();
          return;
        } catch (error) {
          logger.error("[AURA_LINK_ERROR] image candidate extraction failed", {
            uid,
            error,
          });
          const reply = "I couldn't read that item photo. Try another photo or add it manually.";
          writeTextDelta(res, reply);
          writeFinal(res, fallbackAuraResponse(reply));
          res.end();
          return;
        }
      }

      if (
        linkIntent === "add_from_link" ||
        linkIntent === "add_from_links_batch" ||
        clientIntent === "add_from_link" ||
        clientIntent === "add_from_links_batch"
      ) {
        if (!detectedUrls.length) {
          writeError(res, "A product link is required.");
          res.end();
          return;
        }

        writeStatus(res, "extracting_preview");
        logger.info("[AURA_LINK] add intent classified", {
          uid,
          linkIntent,
          urlCount: detectedUrls.length,
        });

        try {
          const extractions = [];
          for (const detectedUrl of detectedUrls.slice(0, 5)) {
            const extraction = await extractProductFromUrl(detectedUrl.normalized);
            extractions.push(await rankProductExtractionImages({ client, extraction }));
          }
          const data = candidatePreviewResponse(candidatesFromProductExtractions(extractions));
          logger.info("[AURA_CANDIDATE_BACKEND] raw link candidate object before stream", {
            uid,
            keys: Object.keys(data),
            candidateItems: data.candidateItems,
          });
          logger.info("[AURA_STREAM_FINAL] emitting link candidate final", {
            uid,
            candidateCount: data.candidateItems.length,
            presentation: data.presentation,
            hasCandidateItems: !!data.candidateItems.length,
          });
          logger.info("[AURA_STREAM_PRE_EMIT] link candidate final object", {
            uid,
            branchChosen: "link_candidate_preview",
            finalPayloadKeys: Object.keys(data),
            presentation: data.presentation,
            candidateItemsLength: data.candidateItems.length,
            candidatesLength: data.candidates.length,
          });
          logStreamCandidateEmit(uid, "link", data);
          writeTextDelta(res, data.reply);
          writeFinal(res, data);
          res.end();
          return;
        } catch (error) {
          logger.error("[AURA_LINK_ERROR] add from link failed", {
            uid,
            linkIntent,
            error,
          });
          const reply = auraLinkErrorMessage(error);
          writeTextDelta(res, reply);
          writeFinal(res, fallbackAuraResponse(reply));
          res.end();
          return;
        }
      }

      const useSimpleChatPath = shouldUseSimpleChatPath({
        userMessage,
        attachments,
        detectedUrls,
        clientIntent,
        effectiveClientIntent,
        linkIntent,
      });

      logger.info("[AURA_ROUTE] selected model path", {
        uid,
        path: useSimpleChatPath ? "simple_chat" : "structured",
        contextMode: useSimpleChatPath ? "compact" : "full",
        attachmentCount: attachments.length,
        detectedUrlCount: detectedUrls.length,
        clientIntent,
        effectiveClientIntent,
      });

      if (useSimpleChatPath) {
        const [auraMemory, userProfile] = await Promise.all([
          loadCompactAuraMemoryContext(
            db,
            uid,
            typeof req.body?.chatId === "string" ? req.body.chatId : null
          ),
          loadAuraUserProfile(uid),
        ]);
        const compactAuraContext = buildCompactAuraContextForSimpleChat({
          memory: auraMemory,
          userProfile,
          clientContext: req.body?.clientContext,
          styleCoreNote,
        });
        const requestText =
          `User profile:\n${JSON.stringify(compactAuraContext.userProfile, null, 2)}\n\n` +
          `Aura context:\n${JSON.stringify(compactAuraContext, null, 2)}\n\n` +
          "Stylist brief:\nPersonalize lightly.\n\n" +
          `Style core note:\n${styleCoreNote || "None."}\n\n` +
          `Recent conversation:\n${JSON.stringify(history, null, 2)}\n\n` +
          "Product link context:\nNo product links.\n\n" +
          "Attachments:\nNone.\n\n" +
          `User request:\n${userMessage}`;

        writeStatus(res, "responding");
        logger.info("[AURA_ROUTE] simple chat stream starting", {
          uid,
          path: "simple_chat",
          contextMode: "compact",
          secondModelCall: "skipped",
        });

        let streamedText = "";
        const stream = client.responses.stream({
          model: "gpt-5.4",
          input: [
            {
              role: "developer",
              content: AURA_STREAM_INSTRUCTIONS,
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: requestText,
                },
              ],
            },
          ],
        });

        for await (const event of stream) {
          if (event.type === "response.output_text.delta" && event.delta) {
            streamedText += event.delta;
            writeTextDelta(res, event.delta);
          }
        }

        const finalReply = streamedText.trim();
        const data = fallbackAuraResponse(finalReply || "I'm here - what are we styling?");
        logger.info("[AURA_ROUTE] simple chat stream finished", {
          uid,
          path: "simple_chat",
          contextMode: "compact",
          secondModelCall: "skipped",
          textLength: data.reply.length,
        });
        writeFinal(res, data);
        res.end();
        return;
      }

      const itemsSnap = await db.collection("users").doc(uid).collection("items").get();
      const items = itemsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as (Record<string, unknown> & { id: string })[];

      const laundryResponse = await handleLaundryIntent({ db, uid, message: userMessage, items });
      if (laundryResponse) {
        writeTextDelta(res, laundryResponse.reply);
        writeFinal(res, laundryResponse);
        res.end();
        return;
      }

      const [auraMemory, userProfile] = await Promise.all([
        loadCompactAuraMemoryContext(
          db,
          uid,
          typeof req.body?.chatId === "string" ? req.body.chatId : null
        ),
        loadAuraUserProfile(uid),
      ]);
      const auraContext = buildAuraContext({
        items,
        weather: req.body?.weather || null,
        occasion: req.body?.occasion || null,
        selectedDate: req.body?.selectedDate || null,
        memory: auraMemory,
        userProfile,
      });
      logger.info("AURA stream closet context", {
        counts: auraContext.counts,
        isSparseWardrobe: auraContext.isSparseWardrobe,
        categoryCounts: auraContext.categoryCounts,
        detectedGaps: auraContext.wardrobeGaps,
        footwearAvailable: auraContext.wardrobeDebug?.footwearAvailable ?? [],
        excludedFootwear: auraContext.wardrobeDebug?.excludedFootwear ?? [],
      });
      let linkProductContext = "No product links.";
      if (linkIntent === "analyze_link" && detectedUrls.length > 0) {
        logger.info("[AURA_LINK] analyze intent classified", {
          uid,
          urlCount: detectedUrls.length,
        });
        try {
          const products = [];
          for (const detectedUrl of detectedUrls.slice(0, 3)) {
            products.push(await extractProductFromUrl(detectedUrl.normalized));
          }
          linkProductContext = productContextText(products);
        } catch (error) {
          logger.error("[AURA_LINK_ERROR] analyze link extraction failed", {
            uid,
            error,
          });
          linkProductContext = auraLinkErrorMessage(error);
        }
      }

      const requestText =
        `User profile:\n${JSON.stringify(userProfile, null, 2)}\n\n` +
        `Aura context:\n${JSON.stringify(auraContext, null, 2)}\n\n` +
        `Stylist brief:\n${auraContext.stylistBrief || "Personalize lightly."}\n\n` +
        `Style core note:\n${styleCoreNote || "None."}\n\n` +
        `Recent conversation:\n${JSON.stringify(history, null, 2)}\n\n` +
        `Product link context:\n${linkProductContext}\n\n` +
        `Attachments:\n${attachmentContextText(attachments)}\n\n` +
        `User request:\n${userMessage}` +
        buildMultiLookRequestNote(userMessage);

      writeStatus(res, "responding");
      logger.info("[AURA_STREAM] starting OpenAI stream", {
        uid,
        attachmentCount: attachments.length,
      });

      let streamedText = "";
      const stream = client.responses.stream({
        model: "gpt-5.4",
        input: [
          {
            role: "developer",
            content: AURA_STREAM_INSTRUCTIONS,
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: requestText,
              },
              ...buildAuraVisionImageInputs(attachments),
            ],
          },
        ],
      });

      for await (const event of stream) {
        if (event.type === "response.output_text.delta" && event.delta) {
          streamedText += event.delta;
          writeTextDelta(res, event.delta);
        }
      }

      const finalReply = streamedText.trim();
      logger.info("[AURA_STREAM] OpenAI stream finished", {
        uid,
        textLength: finalReply.length,
      });

      logger.info("[AURA_ROUTE] structured finalizer starting", {
        uid,
        path: "structured",
        contextMode: "full",
        secondModelCall: "used",
        textLength: finalReply.length,
      });
      const structured = await client.responses.create({
        model: "gpt-5.4",
        input: [
          {
            role: "developer",
            content: AURA_INSTRUCTIONS,
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  `${requestText}\n\n` +
                  `Draft assistant reply already shown to the user:\n${finalReply}\n\n` +
                  "Use that draft reply as the final reply unless a tiny cleanup is needed. Do not materially rewrite the response.",
              },
              ...buildAuraVisionImageInputs(attachments),
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "aura_response",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                presentation: { type: "string", enum: ["chat", "card"] },
                title: { type: "string" },
                reply: { type: "string" },
                reason: { type: "string" },
                outfitItems: { type: "array", items: { type: "string" } },
                ownedPieces: { type: "array", items: { type: "string" } },
                recommendedAdditions: { type: "array", items: { type: "string" } },
                swapSuggestion: { type: "string" },
                missingPieces: { type: "array", items: { type: "string" } },
                upgradeSuggestions: { type: "array", items: { type: "string" } },
                upgradeSuggestionItems: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      label: { type: "string" },
                      searchQuery: { type: "string" },
                    },
                    required: ["label"],
                  },
                },
                chips: { type: "array", items: { type: "string" } },
                look: {
                  anyOf: [
                    { type: "null" },
                    {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        lookTitle: { type: "string" },
                        vibe: { type: "string" },
                        shortExplanation: { type: "string" },
                        stylingNote: { type: "string" },
                        personalizationLabel: { type: "string" },
                        personalizationNote: { type: "string" },
                        pieces: {
                          type: "array",
                          items: {
                            type: "object",
                            additionalProperties: false,
                            properties: {
                              role: { type: "string", enum: ["top", "bottom", "shoes", "outerwear", "accessory"] },
                              itemName: { type: "string" },
                              source: { type: "string", enum: ["closet", "suggested"] },
                              itemId: { type: ["string", "null"] },
                              imageUrl: { type: ["string", "null"] },
                            },
                            required: ["role", "itemName", "source", "itemId", "imageUrl"],
                          },
                        },
                        fromCloset: { type: "array", items: { type: "string" } },
                        addToComplete: { type: "array", items: { type: "string" } },
                        alternates: { type: "array", items: { type: "string" } },
                        actions: {
                          type: "array",
                          items: {
                            type: "string",
                            enum: ["saveLook", "planForToday", "likeLook", "notMyVibe", "showMoreLikeThis", "lessLikeThis", "shopMissingPieces", "useOnlyMyCloset", "makeItDressier"],
                          },
                        },
                      },
                      required: ["lookTitle", "vibe", "shortExplanation", "stylingNote", "pieces", "fromCloset", "addToComplete", "alternates", "actions"],
                    },
                  ],
                },
                lookOptions: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      lookTitle: { type: "string" },
                      vibe: { type: "string" },
                      shortExplanation: { type: "string" },
                      stylingNote: { type: "string" },
                      personalizationLabel: { type: "string" },
                      personalizationNote: { type: "string" },
                      pieces: {
                        type: "array",
                        items: {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            role: { type: "string", enum: ["top", "bottom", "shoes", "outerwear", "accessory"] },
                            itemName: { type: "string" },
                            source: { type: "string", enum: ["closet", "suggested"] },
                            itemId: { type: ["string", "null"] },
                            imageUrl: { type: ["string", "null"] },
                          },
                          required: ["role", "itemName", "source", "itemId", "imageUrl"],
                        },
                      },
                      fromCloset: { type: "array", items: { type: "string" } },
                      addToComplete: { type: "array", items: { type: "string" } },
                      alternates: { type: "array", items: { type: "string" } },
                      actions: {
                        type: "array",
                        items: {
                          type: "string",
                          enum: ["saveLook", "planForToday", "likeLook", "notMyVibe", "showMoreLikeThis", "lessLikeThis", "shopMissingPieces", "useOnlyMyCloset", "makeItDressier"],
                        },
                      },
                    },
                    required: ["lookTitle", "vibe", "shortExplanation", "stylingNote", "pieces", "fromCloset", "addToComplete", "alternates", "actions"],
                  },
                },
              },
              required: [
                "presentation",
                "title",
                "reply",
                "reason",
                "outfitItems",
                "ownedPieces",
                "recommendedAdditions",
                "swapSuggestion",
                "missingPieces",
                "upgradeSuggestions",
                "upgradeSuggestionItems",
                "chips",
                "look",
                "lookOptions",
              ],
            },
          },
        },
      });

      let parsed = fallbackAuraResponse(finalReply);
      try {
        parsed = JSON.parse(String(structured.output_text || "{}")) as AuraResponse;
      } catch {
        parsed = fallbackAuraResponse(finalReply);
      }

      parsed.reply = parsed.reply?.trim() ? parsed.reply.trim() : finalReply;
      if (!parsed.reply) parsed.reply = finalReply;
      logger.info("[AURA_MULTI] stream structured response parsed", {
        uid,
        multiRequested: wantsMultipleLooks(userMessage),
        requestedCount: parseRequestedLookCount(userMessage),
        rawPresentation: parsed.presentation,
        rawHasLook: !!parsed.look,
        rawLookOptionsCount: parsed.lookOptions?.length ?? 0,
        rawOwnedPiecesCount: parsed.ownedPieces?.length ?? 0,
        rawOutfitItemsCount: parsed.outfitItems?.length ?? 0,
      });
      parsed = normalizeAuraResponse(parsed, userMessage, auraContext);
      logger.info("[AURA_MULTI] stream structured response normalized", {
        uid,
        multiRequested: wantsMultipleLooks(userMessage),
        normalizedPresentation: parsed.presentation,
        normalizedHasLook: !!parsed.look,
        normalizedLookOptionsCount: parsed.lookOptions?.length ?? 0,
        normalizedOwnedPiecesCount: parsed.ownedPieces?.length ?? 0,
        missingPiecesCount: parsed.missingPieces?.length ?? 0,
        upgradeSuggestionsCount: parsed.upgradeSuggestions?.length ?? 0,
      });
      logger.info("[AURA_RESPONSE_FINAL] stream final response", {
        uid,
        presentation: parsed.presentation,
        hasLook: !!parsed.look,
        lookOptionsCount: parsed.lookOptions?.length ?? 0,
        ownedPiecesCount: parsed.ownedPieces?.length ?? 0,
        recommendedAdditionsCount: parsed.recommendedAdditions?.length ?? 0,
        missingPiecesCount: parsed.missingPieces?.length ?? 0,
        upgradeSuggestionsCount: parsed.upgradeSuggestions?.length ?? 0,
        outfitItemsCount: parsed.outfitItems?.length ?? 0,
        title: parsed.title,
        replyPreview: String(parsed.reply ?? "").slice(0, 160),
      });

      writeFinal(res, parsed);
      logger.info("[AURA_STREAM] final response emitted", {
        uid,
        presentation: parsed.presentation,
        hasLook: !!parsed.look,
        lookOptionsCount: parsed.lookOptions?.length ?? 0,
      });
      res.end();
    } catch (error) {
      logger.error("[AURA_ERROR] askAuraStream failed", error);
      writeError(res, "AURA could not respond right now.");
      res.end();
    }
  }
);
