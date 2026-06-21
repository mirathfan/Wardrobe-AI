import type {
  NormalizedOutfitGenerationInput,
  OutfitCandidate,
  OutfitGenerationContext,
  OutfitRole,
} from "./outfitTypes";

function candidateForPrompt(candidate: OutfitCandidate) {
  return {
    itemId: candidate.itemId,
    name: candidate.name,
    allowedRole: candidate.allowedRole,
    category: candidate.category,
    subcategory: candidate.subcategory ?? null,
    brand: candidate.brand ?? null,
    colors: candidate.colors,
    styleTags: Array.isArray(candidate.aiMetadata.styleTags) ? candidate.aiMetadata.styleTags : [],
    occasionTags: Array.isArray(candidate.aiMetadata.occasionTags) ? candidate.aiMetadata.occasionTags : [],
    formality: candidate.aiMetadata.formality ?? null,
    score: candidate.score,
    reason: candidate.reason,
  };
}

export function flattenOutfitCandidates(context: OutfitGenerationContext): OutfitCandidate[] {
  return [
    ...context.candidates.top,
    ...context.candidates.bottom,
    ...context.candidates.footwear,
    ...context.candidates.outerwear,
    ...context.candidates.accessory,
    ...context.candidates.one_piece,
  ];
}

export function buildOutfitGenerationDeveloperPrompt(): string {
  return [
    "You generate complete outfit recommendations using only the user's real closet candidates.",
    "Return JSON only. No markdown. No prose outside JSON.",
    "Only use itemIds from the provided candidates.",
    "If hardConstraints.requiredItemIds is non-empty, every returned outfit must include every exact required itemId unless no valid outfit is possible.",
    "Never use hardConstraints.avoidItemIds or items matching hardConstraints.avoidTerms.",
    "You must use each item only with its allowedRole. If an item has allowedRole top, use role top. If allowedRole footwear, use role footwear.",
    "Each outfit must be wearable and internally coherent.",
    "Prefer category balance: top + bottom + footwear; optional outerwear/accessory.",
    "A one_piece can replace top + bottom, but footwear is still required.",
    "If an item the user needs is not in candidates, put it in missingItems, not in items.",
    "Do not hallucinate item IDs, names, brands, or colors.",
    "Use style memory as personalization guidance, but never violate the user's current request.",
    "Do not use tank tops, graphic tees, sandals, or athletic/gym shoes for office unless explicitly requested or no alternative exists.",
    "Keep stylingTips actionable and short.",
  ].join(" ");
}

export function buildOutfitGenerationUserPrompt(
  input: NormalizedOutfitGenerationInput,
  context: OutfitGenerationContext,
): string {
  const candidatesByRole: Record<OutfitRole, ReturnType<typeof candidateForPrompt>[]> = {
    top: context.candidates.top.map(candidateForPrompt),
    bottom: context.candidates.bottom.map(candidateForPrompt),
    footwear: context.candidates.footwear.map(candidateForPrompt),
    outerwear: context.candidates.outerwear.map(candidateForPrompt),
    accessory: context.candidates.accessory.map(candidateForPrompt),
    one_piece: context.candidates.one_piece.map(candidateForPrompt),
  };
  return JSON.stringify({
    task: "Generate closet-only outfit recommendations.",
    requestedOutfitCount: input.count,
    userQuery: input.query,
    occasion: input.occasion ?? context.retrievalPlan.intent.occasion ?? null,
    formality: input.formality,
    inferredFormality: context.retrievalPlan.intent.formality,
    weather: input.weather ?? context.retrievalPlan.intent.weather ?? null,
    retrievalPlan: context.retrievalPlan,
    styleMemory: context.styleMemory
      ? {
        profileSummary: context.styleMemory.profileSummary,
        positiveMemories: context.styleMemory.positiveMemories.map((memory) => `User tends to like: ${memory.text}`),
        negativeMemories: context.styleMemory.negativeMemories.map((memory) => `Avoid: ${memory.text}`),
        profileSignals: context.styleMemory.profileSignals,
      }
      : null,
    hardConstraints: {
      requiredItemIds: input.requiredItemIds,
      avoidItemIds: input.avoidItemIds,
      avoidTerms: input.avoidTerms,
    },
    candidatesByRole,
    outputSchema: {
      outfits: [
        {
          title: "string",
          vibe: "string",
          occasion: "string",
          formality: "casual | smart_casual | formal",
          items: [
            {
              itemId: "provided candidate itemId only",
              role: "must exactly match the candidate allowedRole",
              reason: "string",
            },
          ],
          explanation: "string",
          stylingTips: ["string"],
          missingItems: ["string"],
          confidence: "number between 0 and 1",
        },
      ],
    },
  }, null, 2);
}
