import {
  clampScore,
  itemText,
  normalizedText,
  parseStylingIntent,
  roleForStylingItem,
  uniqueList,
  type StyleIdentityLabel,
  type StyleIdentityResult,
  type StylingIntentInput,
  type StylingItem,
} from "./types";
import { colorFamiliesForItem } from "./colorEngine";

type IdentitySignal = {
  label: StyleIdentityLabel;
  words: RegExp;
  itemWeight: number;
  intentWeight: number;
};

const IDENTITY_SIGNALS: IdentitySignal[] = [
  {
    label: "clean_luxury",
    words: /\b(clean luxury|quiet luxury|cashmere|wool|silk|leather|tailored|loafer|trouser|overcoat|minimal blazer)\b/,
    itemWeight: 4,
    intentWeight: 6,
  },
  {
    label: "streetwear",
    words: /\b(streetwear|street|skate|hoodie|oversized|cargo|graphic|logo|sneaker|sneakers|bomber|baggy)\b/,
    itemWeight: 4,
    intentWeight: 6,
  },
  {
    label: "smart_casual",
    words: /\b(smart casual|blazer|button down|button up|polo|chino|trouser|loafer|clean sneaker|work dinner)\b/,
    itemWeight: 4,
    intentWeight: 6,
  },
  {
    label: "minimal",
    words: /\b(minimal|minimalist|simple|plain|solid|clean|quiet|essential|basic)\b/,
    itemWeight: 3,
    intentWeight: 5,
  },
  {
    label: "sporty",
    words: /\b(sport|sporty|athletic|gym|running|training|performance|jogger|track|sweat)\b/,
    itemWeight: 4,
    intentWeight: 6,
  },
  {
    label: "formal",
    words: /\b(formal|suit|tuxedo|dress shirt|oxford|derby|wedding|black tie|business formal)\b/,
    itemWeight: 5,
    intentWeight: 7,
  },
  {
    label: "date_night",
    words: /\b(date|date night|night out|dinner|sleek|fitted|black leather|silky|heel)\b/,
    itemWeight: 3,
    intentWeight: 7,
  },
  {
    label: "vacation",
    words: /\b(vacation|resort|beach|linen|camp collar|sandal|shorts|travel|pool)\b/,
    itemWeight: 4,
    intentWeight: 7,
  },
  {
    label: "rave_techno",
    words: /\b(rave|techno|club|mesh|metallic|harness|neon|industrial|black cargo)\b/,
    itemWeight: 5,
    intentWeight: 8,
  },
  {
    label: "college_casual",
    words: /\b(college|campus|class|lecture|backpack|hoodie|jeans|sneaker|sneakers)\b/,
    itemWeight: 3,
    intentWeight: 7,
  },
  {
    label: "casual",
    words: /\b(casual|tee|t shirt|jeans|denim|sneaker|sneakers|everyday|errand|relaxed)\b/,
    itemWeight: 2.5,
    intentWeight: 4,
  },
];

const OCCASION_TARGETS: Record<string, StyleIdentityLabel[]> = {
  formal: ["formal", "clean_luxury"],
  work: ["smart_casual", "clean_luxury", "formal"],
  smart_casual: ["smart_casual", "clean_luxury"],
  date: ["date_night", "smart_casual", "clean_luxury"],
  party: ["date_night", "rave_techno", "streetwear"],
  gym: ["sporty"],
  travel: ["vacation", "casual", "sporty"],
  casual: ["casual", "streetwear", "minimal", "college_casual"],
};

function scoreIntentSignals(intentText: string): Map<StyleIdentityLabel, number> {
  const scores = new Map<StyleIdentityLabel, number>();
  if (!intentText) return scores;
  for (const signal of IDENTITY_SIGNALS) {
    if (signal.words.test(intentText)) {
      const explicitLabel = signal.label.replace(/_/g, " ");
      const explicitBoost = intentText.includes(explicitLabel) ? 4 : 0;
      scores.set(
        signal.label,
        (scores.get(signal.label) ?? 0) + signal.intentWeight + explicitBoost,
      );
    }
  }
  return scores;
}

function scoreItemSignals(items: StylingItem[]): Map<StyleIdentityLabel, number> {
  const scores = new Map<StyleIdentityLabel, number>();
  for (const item of items) {
    const text = itemText(item);
    for (const signal of IDENTITY_SIGNALS) {
      if (signal.words.test(text)) {
        scores.set(signal.label, (scores.get(signal.label) ?? 0) + signal.itemWeight);
      }
    }

    const role = roleForStylingItem(item);
    const colors = colorFamiliesForItem(item);
    if (
      colors.length > 0 &&
      colors.every((family) =>
        ["black", "white", "gray", "navy", "beige", "cream", "brown"].includes(family)
      )
    ) {
      scores.set("minimal", (scores.get("minimal") ?? 0) + 1.2);
      scores.set("clean_luxury", (scores.get("clean_luxury") ?? 0) + 0.8);
    }
    if (role === "outerwear" && /\b(blazer|coat|trench)\b/.test(text)) {
      scores.set("smart_casual", (scores.get("smart_casual") ?? 0) + 2);
    }
    if (role === "footwear" && /\b(loafer|oxford|derby)\b/.test(text)) {
      scores.set("formal", (scores.get("formal") ?? 0) + 2);
      scores.set("clean_luxury", (scores.get("clean_luxury") ?? 0) + 1.5);
    }
  }
  return scores;
}

function mergedScores(
  itemScores: Map<StyleIdentityLabel, number>,
  intentScores: Map<StyleIdentityLabel, number>,
): Array<[StyleIdentityLabel, number]> {
  const labels = uniqueList([
    ...Array.from(itemScores.keys()),
    ...Array.from(intentScores.keys()),
  ]);
  return labels
    .map((label) => [label, (itemScores.get(label) ?? 0) + (intentScores.get(label) ?? 0)] as [StyleIdentityLabel, number])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function occasionFitScore(
  identity: StyleIdentityLabel,
  intentText: string,
  occasion?: string | null,
): number {
  const normalizedOccasion = normalizedText(occasion);
  const explicitTargets = OCCASION_TARGETS[normalizedOccasion] ?? [];
  if (explicitTargets.length) {
    if (explicitTargets[0] === identity) return 92;
    if (explicitTargets.includes(identity)) return 82;
    if (
      normalizedOccasion === "formal" &&
      ["streetwear", "sporty", "college_casual"].includes(identity)
    ) {
      return 48;
    }
    if (normalizedOccasion === "gym" && identity !== "sporty") return 54;
    return 68;
  }

  for (const [key, targets] of Object.entries(OCCASION_TARGETS)) {
    if (intentText.includes(key.replace("_", " "))) {
      if (targets[0] === identity) return 92;
      if (targets.includes(identity)) return 82;
      return 66;
    }
  }

  return 74;
}

function bestUseNote(identity: StyleIdentityLabel): string {
  const notes: Record<StyleIdentityLabel, string> = {
    clean_luxury: "polished everyday plans",
    streetwear: "casual streetwear moments",
    smart_casual: "work, dinner, or sharp daytime plans",
    minimal: "simple everyday dressing",
    sporty: "active or casual errands",
    formal: "dressier events",
    date_night: "dinner or night-out plans",
    vacation: "travel and warm-weather plans",
    rave_techno: "club, rave, or techno nights",
    college_casual: "campus and easy daytime wear",
    casual: "everyday casual wear",
    mixed: "flexible styling",
  };
  return notes[identity];
}

export function detectStyleIdentity(
  items: StylingItem[],
  intent?: StylingIntentInput,
): StyleIdentityResult {
  const parsedIntent = parseStylingIntent(intent);
  const intentText = normalizedText([
    parsedIntent.requestText,
    parsedIntent.occasion,
    parsedIntent.vibe,
  ].filter(Boolean).join(" "));
  const itemScores = scoreItemSignals(items);
  const intentScores = scoreIntentSignals(intentText);
  const ranked = mergedScores(itemScores, intentScores);

  if (!items.length) {
    return {
      styleScore: 0,
      styleIdentity: "mixed",
      styleNotes: ["No outfit items were available to score."],
      occasionFit: 0,
      confidence: 0,
    };
  }

  const top = ranked[0];
  const second = ranked[1];
  const rawIdentity = top?.[0] ?? "mixed";
  const rawScore = top?.[1] ?? 0;
  const secondScore = second?.[1] ?? 0;
  const margin = rawScore - secondScore;
  const itemMetadataCount = items.filter((item) => itemText(item).length > 0).length;
  const metadataConfidence = itemMetadataCount / Math.max(1, items.length);
  const confidence = Math.max(
    0.18,
    Math.min(0.94, (rawScore / 18) * 0.62 + (margin / 12) * 0.18 + metadataConfidence * 0.2),
  );
  const identity =
    rawScore < 4 || (ranked.length >= 3 && margin < 1.5)
      ? "mixed"
      : rawIdentity;
  const occasionFit = occasionFitScore(identity, intentText, parsedIntent.occasion);
  const styleScore = clampScore(confidence * 72 + occasionFit * 0.28);
  const notes: string[] = [];

  if (identity === "mixed") {
    notes.push("Style signals are mixed, so AURA should keep the claim broad.");
  } else {
    notes.push(`Reads as ${identity.replace(/_/g, " ")}.`);
  }
  notes.push(`Best for ${bestUseNote(identity)}.`);
  if (confidence < 0.45) {
    notes.push("Confidence is lower because metadata is sparse or split.");
  }

  return {
    styleScore,
    styleIdentity: identity,
    styleNotes: uniqueList(notes).slice(0, 3),
    occasionFit,
    confidence: Math.round(confidence * 100) / 100,
  };
}
