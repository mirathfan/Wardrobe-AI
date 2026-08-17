export const AURA_MEMORY_VERSION = 1;

export const STYLE_PROFILE_DOC_ID = "styleProfile";
export const LEARNED_STYLE_MEMORY_DOC_ID = "learnedStyleMemory";
export const SESSION_CONTEXT_DOC_ID = "current";

export type ExperimentationLevel = "low" | "medium" | "high";
export type AuraTone = "concise" | "balanced" | "editorial";

export type StyleAffinityScore = {
  value: string;
  score: number;
};

export type OccasionPattern = {
  occasion: string;
  traits: string[];
  score: number;
};

export type StyleProfile = {
  version: number;
  styleVibes: string[];
  preferredFits: string[];
  experimentationLevel: ExperimentationLevel;
  favoriteColors: string[];
  avoidColors: string[];
  favoriteCategories: string[];
  avoidCategories: string[];
  favoriteBrands?: string[];
  dislikedBrands?: string[];
  dressingGoals: string[];
  priorities: string[];
  commonOccasions: string[];
  climatePreference?: string;
  auraTone?: AuraTone;
  updatedAt: number;
};

export type LearnedStyleMemory = {
  version: number;
  inferredFavoriteColors: StyleAffinityScore[];
  inferredAvoidColors: StyleAffinityScore[];
  inferredFavoriteCategories: StyleAffinityScore[];
  inferredAvoidCategories: StyleAffinityScore[];
  inferredFits: StyleAffinityScore[];
  inferredSilhouettes: StyleAffinityScore[];
  preferredOutfitFormulas: StyleAffinityScore[];
  occasionPatterns: OccasionPattern[];
  summaryShort: string;
  confidence: number;
  sourceStats: {
    outfitsSaved: number;
    outfitsWorn: number;
    likes: number;
    dislikes: number;
    sessionsAnalyzed: number;
  };
  updatedAt: number;
};

export type AuraSessionContext = {
  currentOccasion?: string;
  currentConstraints?: string[];
  selectedItems?: string[];
  vibeForThisSession?: string;
  expiresAt?: number;
  updatedAt: number;
};

export type StyleEventType =
  | "outfit_generated"
  | "outfit_saved"
  | "outfit_worn"
  | "outfit_liked"
  | "outfit_disliked"
  | "more_like_this"
  | "less_like_this"
  | "item_added"
  | "item_favorited"
  | "item_worn";

export type StyleEventSource = "aura" | "closet" | "planner" | "manual";

export type StyleEventOutfit = {
  top?: string;
  outerwear?: string;
  bottom?: string;
  footwear?: string;
  accessories?: string[];
};

export type StyleEventDerivedTraits = {
  colors?: string[];
  categories?: string[];
  fits?: string[];
  brands?: string[];
  formula?: string;
  vibe?: string[];
  occasion?: string;
};

export type StyleEvent = {
  type: StyleEventType;
  itemIds?: string[];
  outfit?: StyleEventOutfit;
  derivedTraits?: StyleEventDerivedTraits;
  source?: StyleEventSource;
  createdAt: number;
};

export type CompactAuraMemoryContext = {
  explicitProfile: {
    styleVibes?: string[];
    preferredFits?: string[];
    favoriteColors?: string[];
    avoidColors?: string[];
    favoriteCategories?: string[];
    avoidCategories?: string[];
    favoriteBrands?: string[];
    dislikedBrands?: string[];
    dressingGoals?: string[];
    priorities?: string[];
    commonOccasions?: string[];
    climatePreference?: string;
    experimentationLevel?: ExperimentationLevel;
    auraTone?: AuraTone;
  } | null;
  learnedProfile: {
    summaryShort: string;
    confidence: number;
    inferredFavoriteColors?: string[];
    inferredAvoidColors?: string[];
    inferredFavoriteCategories?: string[];
    inferredAvoidCategories?: string[];
    inferredFits?: string[];
    preferredOutfitFormulas?: string[];
    occasionPatterns?: Array<{ occasion: string; traits: string[] }>;
  } | null;
  session: {
    currentOccasion?: string;
    currentConstraints?: string[];
    selectedItems?: string[];
    vibeForThisSession?: string;
  } | null;
  stylistBrief: string;
};

const STYLE_EVENT_WEIGHTS: Record<StyleEventType, number> = {
  outfit_generated: 0,
  outfit_saved: 3,
  outfit_worn: 5,
  outfit_liked: 4,
  more_like_this: 4,
  outfit_disliked: -4,
  less_like_this: -4,
  item_added: 0,
  item_favorited: 0,
  item_worn: 0,
};

function cleanString(value: unknown): string | null {
  const next = String(value ?? "").trim();
  return next || null;
}

function normalizeToken(value: unknown): string | null {
  const next = cleanString(value)?.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ") ?? null;
  return next || null;
}

function normalizePreservedList(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const entry of value) {
    const raw = cleanString(entry);
    const key = normalizeToken(entry);
    if (!raw || !key || seen.has(key)) continue;
    seen.add(key);
    next.push(raw);
    if (next.length >= limit) break;
  }
  return next;
}

function normalizeTokenList(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const entry of value) {
    const key = normalizeToken(entry);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(key);
    if (next.length >= limit) break;
  }
  return next;
}

function normalizeNumber(value: unknown, fallback = 0): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function uniqueTokens(values: Array<string | null | undefined>, limit = 8) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const key = normalizeToken(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(key);
    if (next.length >= limit) break;
  }
  return next;
}

function topEntries(
  scores: Record<string, number>,
  predicate: (score: number) => boolean,
  limit = 4
): StyleAffinityScore[] {
  return Object.entries(scores)
    .filter(([, score]) => predicate(score))
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, limit)
    .map(([value, score]) => ({ value, score: Math.round(score * 100) / 100 }));
}

function scoreSummary(entries: StyleAffinityScore[]) {
  return entries.map((entry) => entry.value);
}

export function emptyStyleProfile(updatedAt = 0): StyleProfile {
  return {
    version: AURA_MEMORY_VERSION,
    styleVibes: [],
    preferredFits: [],
    experimentationLevel: "medium",
    favoriteColors: [],
    avoidColors: [],
    favoriteCategories: [],
    avoidCategories: [],
    favoriteBrands: [],
    dislikedBrands: [],
    dressingGoals: [],
    priorities: [],
    commonOccasions: [],
    climatePreference: undefined,
    auraTone: undefined,
    updatedAt,
  };
}

export function emptyLearnedStyleMemory(updatedAt = 0): LearnedStyleMemory {
  return {
    version: AURA_MEMORY_VERSION,
    inferredFavoriteColors: [],
    inferredAvoidColors: [],
    inferredFavoriteCategories: [],
    inferredAvoidCategories: [],
    inferredFits: [],
    inferredSilhouettes: [],
    preferredOutfitFormulas: [],
    occasionPatterns: [],
    summaryShort: "",
    confidence: 0,
    sourceStats: {
      outfitsSaved: 0,
      outfitsWorn: 0,
      likes: 0,
      dislikes: 0,
      sessionsAnalyzed: 0,
    },
    updatedAt,
  };
}

export function normalizeStyleProfile(value: unknown, fallback?: Partial<StyleProfile>): StyleProfile {
  const root = normalizeRecord(value);
  const base = fallback ? { ...emptyStyleProfile(fallback.updatedAt ?? 0), ...fallback } : emptyStyleProfile();
  const experimentationLevel =
    root.experimentationLevel === "low" ||
    root.experimentationLevel === "medium" ||
    root.experimentationLevel === "high"
      ? root.experimentationLevel
      : base.experimentationLevel;
  const auraTone =
    root.auraTone === "concise" || root.auraTone === "balanced" || root.auraTone === "editorial"
      ? root.auraTone
      : base.auraTone;

  return {
    version: AURA_MEMORY_VERSION,
    styleVibes: normalizeTokenList(root.styleVibes ?? base.styleVibes, 6),
    preferredFits: normalizeTokenList(root.preferredFits ?? base.preferredFits, 6),
    experimentationLevel,
    favoriteColors: normalizeTokenList(root.favoriteColors ?? base.favoriteColors, 6),
    avoidColors: normalizeTokenList(root.avoidColors ?? base.avoidColors, 6),
    favoriteCategories: normalizeTokenList(root.favoriteCategories ?? base.favoriteCategories, 6),
    avoidCategories: normalizeTokenList(root.avoidCategories ?? base.avoidCategories, 6),
    favoriteBrands: normalizeTokenList(root.favoriteBrands ?? base.favoriteBrands, 6),
    dislikedBrands: normalizeTokenList(root.dislikedBrands ?? base.dislikedBrands, 6),
    dressingGoals: normalizeTokenList(root.dressingGoals ?? base.dressingGoals, 6),
    priorities: normalizeTokenList(root.priorities ?? base.priorities, 6),
    commonOccasions: normalizeTokenList(root.commonOccasions ?? base.commonOccasions, 6),
    climatePreference: normalizeToken(root.climatePreference) ?? base.climatePreference,
    auraTone,
    updatedAt: normalizeNumber(root.updatedAt, base.updatedAt ?? 0),
  };
}

export function normalizeLearnedStyleMemory(value: unknown): LearnedStyleMemory {
  const root = normalizeRecord(value);
  const normalizeAffinityList = (input: unknown, limit = 4): StyleAffinityScore[] => {
    if (!Array.isArray(input)) return [];
    return input
      .map((entry) => {
        const candidate = normalizeRecord(entry);
        const token = normalizeToken(candidate.value);
        if (!token) return null;
        return {
          value: token,
          score: normalizeNumber(candidate.score),
        };
      })
      .filter((entry): entry is StyleAffinityScore => !!entry)
      .slice(0, limit);
  };

  const occasionPatterns = Array.isArray(root.occasionPatterns)
    ? root.occasionPatterns
        .map((entry) => {
          const candidate = normalizeRecord(entry);
          const occasion = normalizeToken(candidate.occasion);
          if (!occasion) return null;
          return {
            occasion,
            traits: normalizeTokenList(candidate.traits, 4),
            score: normalizeNumber(candidate.score),
          };
        })
        .filter((entry): entry is OccasionPattern => !!entry)
        .slice(0, 3)
    : [];

  const sourceStats = normalizeRecord(root.sourceStats);

  return {
    version: AURA_MEMORY_VERSION,
    inferredFavoriteColors: normalizeAffinityList(root.inferredFavoriteColors),
    inferredAvoidColors: normalizeAffinityList(root.inferredAvoidColors, 3),
    inferredFavoriteCategories: normalizeAffinityList(root.inferredFavoriteCategories),
    inferredAvoidCategories: normalizeAffinityList(root.inferredAvoidCategories, 3),
    inferredFits: normalizeAffinityList(root.inferredFits),
    inferredSilhouettes: normalizeAffinityList(root.inferredSilhouettes),
    preferredOutfitFormulas: normalizeAffinityList(root.preferredOutfitFormulas, 3),
    occasionPatterns,
    summaryShort: cleanString(root.summaryShort) ?? "",
    confidence: clamp(normalizeNumber(root.confidence), 0, 1),
    sourceStats: {
      outfitsSaved: normalizeNumber(sourceStats.outfitsSaved),
      outfitsWorn: normalizeNumber(sourceStats.outfitsWorn),
      likes: normalizeNumber(sourceStats.likes),
      dislikes: normalizeNumber(sourceStats.dislikes),
      sessionsAnalyzed: normalizeNumber(sourceStats.sessionsAnalyzed),
    },
    updatedAt: normalizeNumber(root.updatedAt),
  };
}

export function normalizeAuraSessionContext(value: unknown): AuraSessionContext | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  const next: AuraSessionContext = {
    updatedAt: normalizeNumber(root.updatedAt),
  };
  const currentOccasion = normalizeToken(root.currentOccasion);
  const currentConstraints = normalizeTokenList(root.currentConstraints, 6);
  const selectedItems = normalizePreservedList(root.selectedItems, 6);
  const vibeForThisSession = normalizeToken(root.vibeForThisSession);
  const expiresAt = normalizeNumber(root.expiresAt, NaN);

  if (currentOccasion) next.currentOccasion = currentOccasion;
  if (currentConstraints.length) next.currentConstraints = currentConstraints;
  if (selectedItems.length) next.selectedItems = selectedItems;
  if (vibeForThisSession) next.vibeForThisSession = vibeForThisSession;
  if (Number.isFinite(expiresAt)) next.expiresAt = expiresAt;

  return next;
}

export function normalizeStyleEvent(value: unknown): StyleEvent | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  const type = cleanString(root.type) as StyleEventType | null;
  if (!type || !(type in STYLE_EVENT_WEIGHTS)) return null;

  const outfitRoot = normalizeRecord(root.outfit);
  const derivedRoot = normalizeRecord(root.derivedTraits);
  const source = cleanString(root.source) as StyleEventSource | null;
  const outfit: StyleEventOutfit = {};
  const accessories = normalizePreservedList(outfitRoot.accessories, 6);

  const top = cleanString(outfitRoot.top);
  const outerwear = cleanString(outfitRoot.outerwear);
  const bottom = cleanString(outfitRoot.bottom);
  const footwear = cleanString(outfitRoot.footwear);

  if (top) outfit.top = top;
  if (outerwear) outfit.outerwear = outerwear;
  if (bottom) outfit.bottom = bottom;
  if (footwear) outfit.footwear = footwear;
  if (accessories.length) outfit.accessories = accessories;

  const derivedTraits: StyleEventDerivedTraits = {};
  const colors = normalizeTokenList(derivedRoot.colors, 8);
  const categories = normalizeTokenList(derivedRoot.categories, 8);
  const fits = normalizeTokenList(derivedRoot.fits, 8);
  const brands = normalizeTokenList(derivedRoot.brands, 8);
  const formula = normalizeToken(derivedRoot.formula);
  const vibe = normalizeTokenList(derivedRoot.vibe, 6);
  const occasion = normalizeToken(derivedRoot.occasion);

  if (colors.length) derivedTraits.colors = colors;
  if (categories.length) derivedTraits.categories = categories;
  if (fits.length) derivedTraits.fits = fits;
  if (brands.length) derivedTraits.brands = brands;
  if (formula) derivedTraits.formula = formula;
  if (vibe.length) derivedTraits.vibe = vibe;
  if (occasion) derivedTraits.occasion = occasion;

  return {
    type,
    itemIds: normalizePreservedList(root.itemIds, 8),
    outfit: Object.keys(outfit).length ? outfit : undefined,
    derivedTraits: Object.keys(derivedTraits).length ? derivedTraits : undefined,
    source:
      source === "aura" || source === "closet" || source === "planner" || source === "manual"
        ? source
        : undefined,
    createdAt: normalizeNumber(root.createdAt, Date.now()),
  };
}

export function buildStyleProfileFromLegacyPreferences(value: unknown): StyleProfile {
  const root = normalizeRecord(value);
  const stylePreferences = normalizeRecord(root.stylePreferences);
  const fitPreferences = normalizeRecord(root.fitPreferences);

  return normalizeStyleProfile({
    version: AURA_MEMORY_VERSION,
    styleVibes: root.styleAesthetics ?? stylePreferences.preferredStyles,
    preferredFits: uniqueTokens([
      cleanString(root.preferredFit),
      cleanString(fitPreferences.tops),
      cleanString(fitPreferences.outerwear),
      cleanString(fitPreferences.bottomsLeg),
    ]),
    experimentationLevel: "medium",
    favoriteColors: root.favoriteColors ?? stylePreferences.favoriteColors,
    avoidColors: root.avoidedColors ?? stylePreferences.avoidedColors,
    favoriteCategories: root.selectedCategories,
    avoidCategories: [],
    favoriteBrands: stylePreferences.preferredBrands,
    dislikedBrands: [],
    dressingGoals: root.goals,
    priorities: root.occasionPriority,
    commonOccasions: root.occasionPriority,
    updatedAt: normalizeNumber(root.updatedAt),
  });
}

function pushWeightedScores(
  scores: Record<string, number>,
  tokens: string[] | undefined,
  delta: number
) {
  if (!tokens?.length || delta === 0) return;
  for (const token of tokens) {
    scores[token] = (scores[token] ?? 0) + delta;
  }
}

function buildOccasionTraits(event: StyleEvent): string[] {
  const derived = event.derivedTraits;
  if (!derived) return [];
  return uniqueTokens([
    ...(derived.colors ?? []).slice(0, 2),
    ...(derived.categories ?? []).slice(0, 2),
    ...(derived.fits ?? []).slice(0, 1),
    derived.formula,
    ...(derived.vibe ?? []).slice(0, 2),
  ], 5);
}

export function computeLearnedStyleMemory(events: StyleEvent[], now = Date.now()): LearnedStyleMemory {
  const normalizedEvents = events
    .map((event) => normalizeStyleEvent(event))
    .filter((event): event is StyleEvent => !!event)
    .sort((a, b) => a.createdAt - b.createdAt);

  const colorScores: Record<string, number> = {};
  const categoryScores: Record<string, number> = {};
  const fitScores: Record<string, number> = {};
  const silhouetteScores: Record<string, number> = {};
  const formulaScores: Record<string, number> = {};
  const occasionTraitScores: Record<string, Record<string, number>> = {};
  const stats = {
    outfitsSaved: 0,
    outfitsWorn: 0,
    likes: 0,
    dislikes: 0,
    sessionsAnalyzed: 0,
  };
  const sessionDays = new Set<string>();

  for (const event of normalizedEvents) {
    const weight = STYLE_EVENT_WEIGHTS[event.type] ?? 0;
    const derived = event.derivedTraits;
    const dayKey = new Date(event.createdAt).toISOString().slice(0, 10);
    sessionDays.add(dayKey);

    if (event.type === "outfit_saved") stats.outfitsSaved += 1;
    if (event.type === "outfit_worn") stats.outfitsWorn += 1;
    if (event.type === "outfit_liked" || event.type === "more_like_this") stats.likes += 1;
    if (event.type === "outfit_disliked" || event.type === "less_like_this") stats.dislikes += 1;

    if (!derived || weight === 0) continue;

    pushWeightedScores(colorScores, derived.colors, weight);
    pushWeightedScores(categoryScores, derived.categories, weight);
    pushWeightedScores(fitScores, derived.fits, weight);
    pushWeightedScores(silhouetteScores, derived.vibe, weight);
    pushWeightedScores(formulaScores, derived.formula ? [derived.formula] : [], weight);

    const occasion = normalizeToken(derived.occasion);
    if (occasion) {
      const scoreMap = (occasionTraitScores[occasion] ??= {});
      for (const trait of buildOccasionTraits(event)) {
        scoreMap[trait] = (scoreMap[trait] ?? 0) + weight;
      }
    }
  }

  stats.sessionsAnalyzed = sessionDays.size;

  const inferredFavoriteColors = topEntries(colorScores, (score) => score > 0, 4);
  const inferredAvoidColors = topEntries(colorScores, (score) => score < 0, 3);
  const inferredFavoriteCategories = topEntries(categoryScores, (score) => score > 0, 4);
  const inferredAvoidCategories = topEntries(categoryScores, (score) => score < 0, 3);
  const inferredFits = topEntries(fitScores, (score) => score > 0, 4);
  const inferredSilhouettes = topEntries(silhouetteScores, (score) => score > 0, 3);
  const preferredOutfitFormulas = topEntries(formulaScores, (score) => score > 0, 3);

  const occasionPatterns = Object.entries(occasionTraitScores)
    .map(([occasion, scores]) => ({
      occasion,
      traits: Object.entries(scores)
        .filter(([, score]) => score > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([trait]) => trait),
      score: Math.round(Object.values(scores).reduce((sum, value) => sum + Math.max(value, 0), 0) * 100) / 100,
    }))
    .filter((entry) => entry.traits.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const weightedSignals =
    inferredFavoriteColors.length +
    inferredFavoriteCategories.length +
    inferredFits.length +
    preferredOutfitFormulas.length +
    inferredAvoidColors.length +
    inferredAvoidCategories.length;
  const eventSignalCount = normalizedEvents.filter((event) => Math.abs(STYLE_EVENT_WEIGHTS[event.type] ?? 0) > 0).length;
  const confidence = clamp(
    Math.round((Math.min(1, eventSignalCount / 10) * 0.6 + Math.min(1, weightedSignals / 10) * 0.4) * 100) / 100,
    0,
    1
  );

  const summaryShort = buildLearnedSummary({
    confidence,
    inferredFavoriteColors,
    inferredAvoidColors,
    inferredFavoriteCategories,
    inferredFits,
    preferredOutfitFormulas,
    occasionPatterns,
  });

  return {
    version: AURA_MEMORY_VERSION,
    inferredFavoriteColors,
    inferredAvoidColors,
    inferredFavoriteCategories,
    inferredAvoidCategories,
    inferredFits,
    inferredSilhouettes,
    preferredOutfitFormulas,
    occasionPatterns,
    summaryShort,
    confidence,
    sourceStats: stats,
    updatedAt: now,
  };
}

function buildLearnedSummary(input: {
  confidence: number;
  inferredFavoriteColors: StyleAffinityScore[];
  inferredAvoidColors: StyleAffinityScore[];
  inferredFavoriteCategories: StyleAffinityScore[];
  inferredFits: StyleAffinityScore[];
  preferredOutfitFormulas: StyleAffinityScore[];
  occasionPatterns: OccasionPattern[];
}) {
  if (input.confidence < 0.2) {
    return "Early signal only; personalize lightly and keep recommendations flexible.";
  }

  const parts: string[] = [];
  const colors = scoreSummary(input.inferredFavoriteColors).slice(0, 2);
  const avoids = scoreSummary(input.inferredAvoidColors).slice(0, 2);
  const categories = scoreSummary(input.inferredFavoriteCategories).slice(0, 2);
  const fits = scoreSummary(input.inferredFits).slice(0, 2);
  const formulas = scoreSummary(input.preferredOutfitFormulas).slice(0, 1);
  const occasion = input.occasionPatterns[0];

  if (colors.length) parts.push(`gravitates toward ${colors.join(" and ")}`);
  if (categories.length) parts.push(`repeats ${categories.join(" and ")}`);
  if (fits.length) parts.push(`leans ${fits.join(" and ")} in fit`);
  if (formulas.length) parts.push(`responds well to ${formulas.join(" ")}`);
  if (occasion?.occasion && occasion.traits.length) {
    parts.push(`${occasion.occasion} looks skew ${occasion.traits.slice(0, 2).join(" and ")}`);
  }
  if (avoids.length) parts.push(`pull back from ${avoids.join(" and ")}`);

  return parts.length
    ? `${parts.join("; ")}.`
    : "There is some emerging taste signal, but it is still light.";
}

export function buildCompactAuraMemoryContext(args: {
  explicitProfile?: StyleProfile | null;
  learnedProfile?: LearnedStyleMemory | null;
  session?: AuraSessionContext | null;
}): CompactAuraMemoryContext {
  const explicitProfile = args.explicitProfile ? normalizeStyleProfile(args.explicitProfile) : null;
  const learnedProfile = args.learnedProfile ? normalizeLearnedStyleMemory(args.learnedProfile) : null;
  const rawSession = args.session ? normalizeAuraSessionContext(args.session) : null;
  const session =
    rawSession && (!rawSession.expiresAt || rawSession.expiresAt > Date.now())
      ? rawSession
      : null;

  const explicit =
    explicitProfile && hasExplicitProfileSignal(explicitProfile)
      ? {
          styleVibes: explicitProfile.styleVibes.slice(0, 3),
          preferredFits: explicitProfile.preferredFits.slice(0, 3),
          favoriteColors: explicitProfile.favoriteColors.slice(0, 3),
          avoidColors: explicitProfile.avoidColors.slice(0, 2),
          favoriteCategories: explicitProfile.favoriteCategories.slice(0, 3),
          avoidCategories: explicitProfile.avoidCategories.slice(0, 2),
          favoriteBrands: explicitProfile.favoriteBrands?.slice(0, 2),
          dislikedBrands: explicitProfile.dislikedBrands?.slice(0, 2),
          dressingGoals: explicitProfile.dressingGoals.slice(0, 3),
          priorities: explicitProfile.priorities.slice(0, 3),
          commonOccasions: explicitProfile.commonOccasions.slice(0, 3),
          climatePreference: explicitProfile.climatePreference,
          experimentationLevel: explicitProfile.experimentationLevel,
          auraTone: explicitProfile.auraTone,
        }
      : null;

  const learned =
    learnedProfile && (learnedProfile.summaryShort || learnedProfile.confidence > 0)
      ? {
          summaryShort: learnedProfile.summaryShort,
          confidence: learnedProfile.confidence,
          inferredFavoriteColors: scoreSummary(learnedProfile.inferredFavoriteColors).slice(0, 3),
          inferredAvoidColors: scoreSummary(learnedProfile.inferredAvoidColors).slice(0, 2),
          inferredFavoriteCategories: scoreSummary(learnedProfile.inferredFavoriteCategories).slice(0, 3),
          inferredAvoidCategories: scoreSummary(learnedProfile.inferredAvoidCategories).slice(0, 2),
          inferredFits: scoreSummary(learnedProfile.inferredFits).slice(0, 3),
          preferredOutfitFormulas: scoreSummary(learnedProfile.preferredOutfitFormulas).slice(0, 2),
          occasionPatterns: learnedProfile.occasionPatterns.slice(0, 2).map((entry) => ({
            occasion: entry.occasion,
            traits: entry.traits.slice(0, 3),
          })),
        }
      : null;

  const compactSession = session
    ? {
        currentOccasion: session.currentOccasion,
        currentConstraints: session.currentConstraints?.slice(0, 4),
        selectedItems: session.selectedItems?.slice(0, 4),
        vibeForThisSession: session.vibeForThisSession,
      }
    : null;

  return {
    explicitProfile: explicit,
    learnedProfile: learned,
    session: compactSession,
    stylistBrief: buildStylistBrief({
      explicitProfile: explicitProfile ?? null,
      learnedProfile: learnedProfile ?? null,
      session,
    }),
  };
}

function hasExplicitProfileSignal(profile: StyleProfile) {
  return [
    profile.styleVibes.length,
    profile.preferredFits.length,
    profile.favoriteColors.length,
    profile.avoidColors.length,
    profile.favoriteCategories.length,
    profile.dressingGoals.length,
    profile.commonOccasions.length,
  ].some((count) => count > 0);
}

export function buildStylistBrief(args: {
  explicitProfile?: StyleProfile | null;
  learnedProfile?: LearnedStyleMemory | null;
  session?: AuraSessionContext | null;
}) {
  const explicitProfile = args.explicitProfile ? normalizeStyleProfile(args.explicitProfile) : null;
  const learnedProfile = args.learnedProfile ? normalizeLearnedStyleMemory(args.learnedProfile) : null;
  const session = args.session ? normalizeAuraSessionContext(args.session) : null;

  const parts: string[] = [];

  if (explicitProfile && hasExplicitProfileSignal(explicitProfile)) {
    if (explicitProfile.styleVibes.length) {
      parts.push(`Style lane: ${explicitProfile.styleVibes.slice(0, 3).join(", ")}.`);
    }
    if (explicitProfile.preferredFits.length) {
      parts.push(`Preferred fits: ${explicitProfile.preferredFits.slice(0, 2).join(", ")}.`);
    }
    if (explicitProfile.favoriteColors.length || explicitProfile.avoidColors.length) {
      const colorParts: string[] = [];
      if (explicitProfile.favoriteColors.length) {
        colorParts.push(`leans into ${explicitProfile.favoriteColors.slice(0, 3).join(", ")}`);
      }
      if (explicitProfile.avoidColors.length) {
        colorParts.push(`avoids ${explicitProfile.avoidColors.slice(0, 2).join(", ")}`);
      }
      parts.push(`Color direction: ${colorParts.join("; ")}.`);
    }
    if (explicitProfile.favoriteCategories.length) {
      parts.push(`Go-to categories: ${explicitProfile.favoriteCategories.slice(0, 3).join(", ")}.`);
    }
  }

  if (learnedProfile && learnedProfile.confidence >= 0.2 && learnedProfile.summaryShort) {
    const confidencePrefix = learnedProfile.confidence < 0.45 ? "Light learned signal" : "Learned signal";
    parts.push(`${confidencePrefix}: ${learnedProfile.summaryShort}`);
  }

  if (session && (!session.expiresAt || session.expiresAt > Date.now())) {
    const sessionParts: string[] = [];
    if (session.currentOccasion) sessionParts.push(`occasion is ${session.currentOccasion}`);
    if (session.vibeForThisSession) sessionParts.push(`vibe is ${session.vibeForThisSession}`);
    if (session.currentConstraints?.length) {
      sessionParts.push(`constraints: ${session.currentConstraints.slice(0, 3).join(", ")}`);
    }
    if (session.selectedItems?.length) {
      sessionParts.push(`anchor item ids: ${session.selectedItems.slice(0, 3).join(", ")}`);
    }
    if (sessionParts.length) {
      parts.push(`Current session: ${sessionParts.join("; ")}.`);
    }
  }

  return parts.length
    ? parts.join(" ")
    : "Personalize lightly. Use the wardrobe naturally and avoid overstating preference certainty.";
}
