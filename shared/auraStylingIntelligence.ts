export type AuraStylingIntentName =
  | "generate_outfit"
  | "outfit_iteration"
  | "outfit_feedback"
  | "occasion_change"
  | "vibe_shift"
  | "replace_piece"
  | "improve_fit"
  | "closet_query"
  | "style_advice_only"
  | "non_styling_chat";

export type AuraOccasion =
  | "first_date"
  | "date_night"
  | "coffee_date"
  | "fancy_dinner"
  | "wedding"
  | "club"
  | "rave"
  | "interview"
  | "business_casual"
  | "formal"
  | "casual"
  | "streetwear"
  | "airport"
  | "gym"
  | "lounge"
  | "beach"
  | "winter"
  | "summer";

export type AuraIntentResult = {
  intent: AuraStylingIntentName;
  shouldGenerateOutfit: boolean;
  shouldRenderOutfitCard: boolean;
  occasion?: AuraOccasion;
  vibe?: string;
  requestedChanges: string[];
  targetItemCategory?: string;
  excludedColors: string[];
  excludedCategories: string[];
  requiredItems: string[];
  explicitSportsContext: boolean;
  confidence: number;
};

export type AuraIntentConversationState = {
  hasPreviousOutfit?: boolean;
  previousOccasion?: string | null;
  previousVibe?: string | null;
};

export type AuraOccasionRule = {
  occasion: AuraOccasion;
  preferredFormality: [number, number];
  allowedCategories: string[];
  penalizedCategories: string[];
  bannedCategories: string[];
  preferredVibes: string[];
  seasonWeather?: string[];
  minimumStandards: string[];
};

export type NormalizedAuraItem = {
  id?: string | null;
  name: string;
  category: string;
  subCategory?: string | null;
  color?: string | null;
  brand?: string | null;
  text: string;
  tags: string[];
  formality: number;
  sportiness: number;
  graphicIntensity: number;
  dressiness: number;
  isJersey: boolean;
  isTeamSportswear: boolean;
  isSlides: boolean;
  isGymShorts: boolean;
  isCargo: boolean;
  isDistressed: boolean;
  isOwned: boolean;
};

export type AuraScoredItem = {
  item: unknown;
  normalized: NormalizedAuraItem;
  score: number;
  penalties: string[];
  warnings: string[];
};

export type AuraOutfitCandidateLike<TItem = unknown> = {
  id?: string;
  items: TItem[];
  score?: number;
};

export type AuraOutfitScore = {
  score: number;
  occasionScore: number;
  formalityScore: number;
  colorScore: number;
  silhouetteScore: number;
  vibeScore: number;
  userPreferenceScore: number;
  closetAvailabilityScore: number;
  noveltyScore: number;
  incompatibilityPenalty: number;
  warnings: string[];
  rejectedItems: Array<{ name: string; reason: string }>;
};

export type AuraCardTag =
  | "CASUAL"
  | "DATE NIGHT"
  | "COFFEE DATE"
  | "FIRST DATE"
  | "FANCY DINNER"
  | "UPSCALE DATE"
  | "OFFICE CASUAL"
  | "BUSINESS CASUAL"
  | "SMART CASUAL"
  | "CREATIVE OFFICE"
  | "VACATION"
  | "STREETWEAR"
  | "ELEVATED CASUAL"
  | "POLISHED"
  | "MINIMAL"
  | "CLEAN"
  | "WARM WEATHER"
  | "COLD WEATHER"
  | "RAVE"
  | "CLUB"
  | "INTERVIEW"
  | "FORMAL";

export type AuraOutfitQualityScore = {
  qualityScore: number;
  intentionalElementCount: number;
  signals: string[];
  penalties: string[];
};

type AuraLookCardMetadataLike = {
  lookTitle?: string | null;
  occasion?: string | null;
  vibe?: string | null;
  shortExplanation?: string | null;
  stylingNote?: string | null;
  personalizationLabel?: string | null;
  pieces?: Array<{ role?: string | null; itemName?: string | null; source?: string | null }>;
};

const OUTFIT_WORTHY_INTENTS = new Set<AuraStylingIntentName>([
  "generate_outfit",
  "outfit_iteration",
  "outfit_feedback",
  "occasion_change",
  "vibe_shift",
  "replace_piece",
  "improve_fit",
]);

const COLOR_WORDS = [
  "black",
  "white",
  "grey",
  "gray",
  "navy",
  "blue",
  "brown",
  "tan",
  "beige",
  "cream",
  "red",
  "green",
  "olive",
  "yellow",
  "orange",
  "pink",
  "purple",
  "silver",
  "gold",
];

export const AURA_ALLOWED_CARD_TAGS: AuraCardTag[] = [
  "CASUAL",
  "DATE NIGHT",
  "COFFEE DATE",
  "FIRST DATE",
  "FANCY DINNER",
  "UPSCALE DATE",
  "OFFICE CASUAL",
  "BUSINESS CASUAL",
  "SMART CASUAL",
  "CREATIVE OFFICE",
  "VACATION",
  "STREETWEAR",
  "ELEVATED CASUAL",
  "POLISHED",
  "MINIMAL",
  "CLEAN",
  "WARM WEATHER",
  "COLD WEATHER",
  "RAVE",
  "CLUB",
  "INTERVIEW",
  "FORMAL",
];

const OCCASION_RULE_LIST: AuraOccasionRule[] = [
  {
    occasion: "first_date",
    preferredFormality: [0.52, 0.78],
    allowedCategories: ["top", "bottom", "footwear", "outerwear", "accessory"],
    penalizedCategories: ["hoodie", "shorts", "loud_graphic", "slides", "athletic"],
    bannedCategories: ["sports_jersey", "team_jersey", "football_jersey", "gym_shorts"],
    preferredVibes: ["clean", "elevated casual", "date night", "luxury streetwear"],
    minimumStandards: ["clean footwear", "intentional top", "non-gym bottom"],
  },
  {
    occasion: "date_night",
    preferredFormality: [0.55, 0.82],
    allowedCategories: ["top", "bottom", "footwear", "outerwear", "accessory"],
    penalizedCategories: ["hoodie", "shorts", "slides", "athletic", "loud_graphic"],
    bannedCategories: ["sports_jersey", "team_jersey", "football_jersey", "gym_shorts"],
    preferredVibes: ["clean", "elevated casual", "premium", "classy"],
    minimumStandards: ["clean shoes", "balanced silhouette", "no game-day pieces"],
  },
  {
    occasion: "coffee_date",
    preferredFormality: [0.45, 0.72],
    allowedCategories: ["top", "bottom", "footwear", "outerwear", "accessory"],
    penalizedCategories: ["slides", "gym_shorts", "athletic"],
    bannedCategories: ["sports_jersey", "team_jersey", "football_jersey"],
    preferredVibes: ["clean casual", "soft streetwear", "minimal"],
    minimumStandards: ["clean casual base", "intentional footwear"],
  },
  {
    occasion: "fancy_dinner",
    preferredFormality: [0.72, 0.94],
    allowedCategories: ["top", "bottom", "footwear", "outerwear", "accessory"],
    penalizedCategories: ["sneaker", "tee", "denim", "hoodie", "shorts", "athletic", "loud_graphic", "distressed"],
    bannedCategories: ["sports_jersey", "team_jersey", "football_jersey", "gym_shorts", "slides"],
    preferredVibes: ["tailored", "formal", "quiet luxury", "polished", "upscale date"],
    minimumStandards: ["structured layer or polished top", "dressier footwear", "no visible graphic tee as the main top"],
  },
  {
    occasion: "wedding",
    preferredFormality: [0.76, 0.98],
    allowedCategories: ["top", "bottom", "footwear", "outerwear", "accessory"],
    penalizedCategories: ["tee", "sneaker", "denim", "loud_graphic", "athletic"],
    bannedCategories: ["sports_jersey", "team_jersey", "gym_shorts", "slides"],
    preferredVibes: ["formal", "tailored", "polished"],
    minimumStandards: ["dress code safe", "polished shoes", "no athletic graphics"],
  },
  {
    occasion: "club",
    preferredFormality: [0.5, 0.82],
    allowedCategories: ["top", "bottom", "footwear", "outerwear", "accessory"],
    penalizedCategories: ["slides", "gym_shorts"],
    bannedCategories: [],
    preferredVibes: ["night out", "dark", "edgy", "statement"],
    minimumStandards: ["night-out shoes", "confident silhouette"],
  },
  {
    occasion: "rave",
    preferredFormality: [0.18, 0.58],
    allowedCategories: ["top", "bottom", "footwear", "outerwear", "accessory"],
    penalizedCategories: ["formal_shoe", "heavy_layer"],
    bannedCategories: [],
    preferredVibes: ["techno", "rave", "utility", "dark"],
    minimumStandards: ["comfortable footwear", "breathable or layerable pieces"],
  },
  {
    occasion: "interview",
    preferredFormality: [0.72, 0.94],
    allowedCategories: ["top", "bottom", "footwear", "outerwear", "accessory"],
    penalizedCategories: ["sneaker", "tee", "denim", "distressed", "hoodie", "athletic", "loud_graphic"],
    bannedCategories: ["sports_jersey", "team_jersey", "gym_shorts", "slides"],
    preferredVibes: ["professional", "polished", "quiet"],
    minimumStandards: ["structured top or layer", "clean dress-leaning shoes"],
  },
  {
    occasion: "business_casual",
    preferredFormality: [0.62, 0.86],
    allowedCategories: ["top", "bottom", "footwear", "outerwear", "accessory"],
    penalizedCategories: ["tee", "hoodie", "distressed", "athletic", "slides"],
    bannedCategories: ["sports_jersey", "team_jersey", "gym_shorts"],
    preferredVibes: ["smart casual", "clean", "work"],
    minimumStandards: ["collared, knit, or structured top", "clean bottoms"],
  },
  {
    occasion: "formal",
    preferredFormality: [0.78, 1],
    allowedCategories: ["top", "bottom", "footwear", "outerwear", "accessory"],
    penalizedCategories: ["tee", "denim", "sneaker", "hoodie", "athletic"],
    bannedCategories: ["sports_jersey", "team_jersey", "gym_shorts", "slides"],
    preferredVibes: ["formal", "tailored", "classic"],
    minimumStandards: ["dressier top", "dressier bottom", "dressier shoes"],
  },
  {
    occasion: "casual",
    preferredFormality: [0.22, 0.62],
    allowedCategories: ["top", "bottom", "footwear", "outerwear", "accessory"],
    penalizedCategories: [],
    bannedCategories: [],
    preferredVibes: ["easy", "clean", "everyday"],
    minimumStandards: ["balanced top, bottom, and shoes"],
  },
  {
    occasion: "streetwear",
    preferredFormality: [0.25, 0.68],
    allowedCategories: ["top", "bottom", "footwear", "outerwear", "accessory"],
    penalizedCategories: ["formal_shoe"],
    bannedCategories: [],
    preferredVibes: ["streetwear", "layered", "sneaker", "luxury streetwear"],
    minimumStandards: ["intentional silhouette", "good sneaker or boot choice"],
  },
  {
    occasion: "airport",
    preferredFormality: [0.22, 0.55],
    allowedCategories: ["top", "bottom", "footwear", "outerwear", "accessory"],
    penalizedCategories: ["formal_shoe", "stiff_tailoring"],
    bannedCategories: [],
    preferredVibes: ["comfortable", "layered", "travel"],
    minimumStandards: ["comfortable shoes", "layer-ready outfit"],
  },
  {
    occasion: "gym",
    preferredFormality: [0, 0.25],
    allowedCategories: ["top", "bottom", "footwear", "outerwear", "accessory", "athletic"],
    penalizedCategories: ["formal_shoe", "tailoring", "heavy_denim"],
    bannedCategories: [],
    preferredVibes: ["athletic", "training", "sport"],
    minimumStandards: ["training-safe shoes", "athletic top and bottom"],
  },
  {
    occasion: "lounge",
    preferredFormality: [0.08, 0.38],
    allowedCategories: ["top", "bottom", "footwear", "outerwear", "accessory"],
    penalizedCategories: ["formal_shoe", "tailoring"],
    bannedCategories: [],
    preferredVibes: ["soft", "comfortable", "relaxed"],
    minimumStandards: ["comfortable base", "not over-styled"],
  },
  {
    occasion: "beach",
    preferredFormality: [0.05, 0.32],
    allowedCategories: ["top", "bottom", "footwear", "outerwear", "accessory"],
    penalizedCategories: ["heavy_layer", "boot", "formal_shoe"],
    bannedCategories: [],
    preferredVibes: ["summer", "light", "resort"],
    seasonWeather: ["hot", "sunny"],
    minimumStandards: ["warm-weather pieces", "easy footwear"],
  },
  {
    occasion: "winter",
    preferredFormality: [0.28, 0.72],
    allowedCategories: ["top", "bottom", "footwear", "outerwear", "accessory"],
    penalizedCategories: ["slides", "thin_short"],
    bannedCategories: [],
    preferredVibes: ["layered", "warm", "textured"],
    seasonWeather: ["cold"],
    minimumStandards: ["outerwear or warm layer", "weather-safe shoes"],
  },
  {
    occasion: "summer",
    preferredFormality: [0.12, 0.58],
    allowedCategories: ["top", "bottom", "footwear", "outerwear", "accessory"],
    penalizedCategories: ["heavy_layer", "winter_boot"],
    bannedCategories: [],
    preferredVibes: ["light", "clean", "warm weather"],
    seasonWeather: ["hot"],
    minimumStandards: ["breathable pieces", "weather-right shoes"],
  },
];

export const AURA_OCCASION_RULES: Record<AuraOccasion, AuraOccasionRule> =
  OCCASION_RULE_LIST.reduce((acc, rule) => {
    acc[rule.occasion] = rule;
    return acc;
  }, {} as Record<AuraOccasion, AuraOccasionRule>);

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalized(value: unknown): string {
  return clean(value)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: Array<string | null | undefined>, max = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const next = clean(value);
    const key = normalized(next);
    if (!next || seen.has(key)) continue;
    seen.add(key);
    out.push(next);
    if (out.length >= max) break;
  }
  return out;
}

function has(text: string, pattern: RegExp): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function detectOccasion(text: string): AuraOccasion | undefined {
  if (has(text, /\bfirst date\b/)) return "first_date";
  if (has(text, /\bcoffee date\b/)) return "coffee_date";
  if (
    has(
      text,
      /\b(five star restaurant|5 star restaurant|five star dinner|5 star dinner|fancy restaurant|fine dining|michelin|upscale restaurant|expensive restaurant|high end restaurant|high end dinner|steakhouse date|anniversary dinner|rooftop dinner|reservation dinner|dinner reservation|formal dinner|elegant dinner|luxury dinner|upscale dinner|fancy dinner)\b/,
    )
  ) return "fancy_dinner";
  if (has(text, /\b(date night|dinner date|for a date|on a date|date appropriate|date fit|dating)\b/)) return "date_night";
  if (has(text, /\b(wedding|reception|ceremony)\b/)) return "wedding";
  if (has(text, /\b(club|clubbing|nightclub)\b/)) return "club";
  if (has(text, /\b(rave|techno|festival)\b/)) return "rave";
  if (has(text, /\b(interview|tech interview|job interview)\b/)) return "interview";
  if (has(text, /\b(business casual|smart casual|office|work fit|work outfit)\b/)) return "business_casual";
  if (has(text, /\b(formal|black tie|dress code)\b/)) return "formal";
  if (has(text, /\b(streetwear|street wear)\b/)) return "streetwear";
  if (has(text, /\b(airport|flight|travel day|plane)\b/)) return "airport";
  if (has(text, /\b(gym|workout|training|lift|lifting)\b/)) return "gym";
  if (has(text, /\b(lounge|chill at home|lazy day)\b/)) return "lounge";
  if (has(text, /\b(beach|pool|resort)\b/)) return "beach";
  if (has(text, /\b(winter|snow|freezing|cold)\b/)) return "winter";
  if (has(text, /\b(summer|hot|humid)\b/)) return "summer";
  if (has(text, /\b(casual|everyday|errands)\b/)) return "casual";
  return undefined;
}

function detectVibe(text: string): string | undefined {
  const vibes = [
    ["upscale date", /\b(five star restaurant|5 star restaurant|fine dining|michelin|upscale restaurant|high end restaurant|steakhouse date|anniversary dinner|luxury dinner|elegant dinner|formal dinner|fancy restaurant)\b/],
    ["vacation", /\b(vacation|holiday|resort)\b/],
    ["streetwear", /\b(streetwear|street wear|skate)\b/],
    ["luxury streetwear", /\b(luxury streetwear|more luxury|premium|designer)\b/],
    ["clean elevated", /\b(cleaner|clean|classy|elevated|polished|sharper|mature)\b/],
    ["dark premium", /\b(darker|dark|all black|black outfit)\b/],
    ["minimal", /\b(minimal|less flashy|less loud|quiet|simple)\b/],
    ["korean fashion", /\b(korean|k fashion|kfashion)\b/],
    ["rave techno", /\b(rave|techno)\b/],
    ["formal", /\b(formal|dressier|classy)\b/],
    ["casual", /\b(casual|dress down|relaxed)\b/],
    ["aura", /\b(make it aura|more aura|aura)\b/],
  ] as const;
  return vibes.find(([, pattern]) => has(text, pattern))?.[0];
}

export function isIncompleteOccasionRequest(message: string): boolean {
  const text = normalized(message);
  if (!text) return false;
  return has(
    text,
    /\b(?:i\s+want|need|give\s+me|make\s+me|build\s+me|style\s+me)?\s*(?:an?\s+)?(?:outfit|fit|look)\s+for\s+(?:a|an|the)?\s*$/,
  );
}

function detectTargetCategory(text: string): string | undefined {
  if (has(text, /\b(shoes|shoe|sneakers|sneaker|boots|loafers|footwear)\b/)) return "footwear";
  if (has(text, /\b(pants|jeans|trousers|bottoms|cargos|shorts)\b/)) return "bottom";
  if (has(text, /\b(top|shirt|tee|t shirt|tshirt|t-shirt|graphic tee|hoodie|sweater|knit|polo|button down)\b/)) return "top";
  if (has(text, /\b(jacket|coat|outerwear|layer|blazer|overshirt)\b/)) return "outerwear";
  if (has(text, /\b(accessory|accessories|watch|chain|bag|hat|cap|glasses)\b/)) return "accessory";
  return undefined;
}

function extractExcludedColors(text: string): string[] {
  const out: string[] = [];
  for (const color of COLOR_WORDS) {
    const colorPattern = color === "gray" ? "(?:gray|grey)" : color;
    const re = new RegExp(
      `\\b(?:no|without|avoid|dont use|do not use|dont want|do not want|remove|take out|get rid of|lose|replace|swap)\\s+(?:the\\s+|that\\s+|those\\s+|my\\s+)?${colorPattern}\\b`,
    );
    if (re.test(text)) out.push(color === "gray" ? "grey" : color);
  }
  return unique(out);
}

function extractExcludedCategories(text: string): string[] {
  const pairs: Array<[string, RegExp]> = [
    ["jersey", /\b(no|without|avoid|dont use|do not use|dont want|do not want|remove|take out|get rid of|lose)\s+(?:the\s+|that\s+|those\s+|my\s+)?(?:sports\s+|team\s+)?jerseys?\b/],
    ["cargo", /\b(no|without|avoid|dont use|do not use|dont want|do not want|remove|take out|get rid of|lose)\s+(?:the\s+|that\s+|those\s+|my\s+)?cargos?\b/],
    ["hoodie", /\b(no|without|avoid|dont use|do not use|dont want|do not want|remove|take out|get rid of|lose)\s+(?:the\s+|that\s+|those\s+|my\s+)?hoodies?\b/],
    ["shorts", /\b(no|without|avoid|dont use|do not use|dont want|do not want|remove|take out|get rid of|lose)\s+(?:the\s+|that\s+|those\s+|my\s+)?shorts?\b/],
    ["slides", /\b(no|without|avoid|dont use|do not use|dont want|do not want|remove|take out|get rid of|lose)\s+(?:the\s+|that\s+|those\s+|my\s+)?slides?\b/],
    ["graphic tee", /\b(no|without|avoid|dont use|do not use|dont want|do not want|remove|take out|get rid of|lose|replace|swap)\s+(?:the\s+|that\s+|those\s+|my\s+)?(?:blue\s+|black\s+|white\s+|grey\s+|gray\s+|red\s+|green\s+|navy\s+|brown\s+)?(?:graphic\s+)?(?:tee|t shirt|tshirt|t-shirt)\b/],
    ["sneaker", /\b(no|without|avoid|dont use|do not use|dont want|do not want|remove|take out|get rid of|lose)\s+(?:the\s+|that\s+|those\s+|my\s+)?(?:sneakers?|shoes?)\b/],
  ];
  return pairs.flatMap(([label, pattern]) => (has(text, pattern) ? [label] : []));
}

function extractRequiredItems(rawText: string): string[] {
  const text = clean(rawText);
  const out: string[] = [];
  for (const match of text.matchAll(/\buse\s+(?:my|the)\s+([^.,;!?]{2,48})/gi)) {
    out.push(match[1]);
  }
  for (const match of text.matchAll(/\b(?:build|make|style)\b[^.,;!?]{0,32}\baround\s+(?:my|the)\s+([^.,;!?]{2,48})/gi)) {
    out.push(match[1]);
  }
  return unique(
    out.map((value) =>
      value
        .replace(/\b(instead|please|for|with|using)\b.*$/i, "")
        .trim(),
    ),
    4,
  );
}

export function hasExplicitSportsContext(message: string): boolean {
  const text = normalized(message);
  if (has(text, /\b(no|without|avoid|dont use|do not use)\s+(?:sports\s+|team\s+)?jerseys?\b/)) {
    return false;
  }
  return has(
    text,
    /\b(sports bar|game day|football game|basketball game|soccer game|baseball game|hockey game|watch party|tailgate|stadium|wear (?:a )?jersey|use (?:my )?.*jersey|jersey fit|team fit)\b/,
  );
}

export function classifyAuraStylingIntent(
  message: string,
  state: AuraIntentConversationState = {},
): AuraIntentResult {
  const raw = clean(message);
  const text = normalized(raw);
  const hasPreviousOutfit = !!state.hasPreviousOutfit;
  const requestedChanges: string[] = [];
  const occasion = detectOccasion(text);
  const vibe = detectVibe(text) ?? (clean(state.previousVibe ?? "") || undefined);
  const targetItemCategory = detectTargetCategory(text);
  const excludedColors = extractExcludedColors(text);
  const excludedCategories = extractExcludedCategories(text);
  const requiredItems = extractRequiredItems(raw);
  const explicitSportsContext = hasExplicitSportsContext(text);

  if (!text) {
    return {
      intent: "non_styling_chat",
      shouldGenerateOutfit: false,
      shouldRenderOutfitCard: false,
      requestedChanges,
      excludedColors,
      excludedCategories,
      requiredItems,
      explicitSportsContext,
      confidence: 0.98,
    };
  }

  const educationOnly =
    has(text, /\b(what is|explain|define|what does|why does|why do|how does)\b/) &&
    !has(text, /\b(outfit|look|fit|wear|style me|dress me|give me|build me|make me)\b/);
  if (educationOnly) {
    return {
      intent: "style_advice_only",
      shouldGenerateOutfit: false,
      shouldRenderOutfitCard: false,
      occasion,
      vibe,
      requestedChanges,
      targetItemCategory,
      excludedColors,
      excludedCategories,
      requiredItems,
      explicitSportsContext,
      confidence: 0.86,
    };
  }

  const closetQuery =
    has(text, /\b(what|how many|show|list|do i own|inventory|in my closet|in my wardrobe)\b/) &&
    has(text, /\b(closet|wardrobe|own|owned|inventory|pieces|items)\b/) &&
    !has(text, /\b(wear|outfit|look|fit|style me|build|make|recommend|suggest)\b/);
  if (closetQuery) {
    return {
      intent: "closet_query",
      shouldGenerateOutfit: false,
      shouldRenderOutfitCard: false,
      occasion,
      vibe,
      requestedChanges,
      targetItemCategory,
      excludedColors,
      excludedCategories,
      requiredItems,
      explicitSportsContext,
      confidence: 0.84,
    };
  }

  const generation =
    has(text, /\b(what should i wear|what do i wear|give me (?:a )?fit|give me (?:an? )?outfit|style me|dress me|build me|make me|put together|plan (?:a|an|my)? ?(?:fit|outfit|look)|outfit for|fit for|look for|wear tonight|wear today|wear tomorrow|what else can i wear|only .*outfits?|all .*outfits?|fits? around|outfits? around)\b/) ||
    has(text, /\b(first date fit|date night fit|coffee date fit|club fit|airport fit|gym fit|wedding fit|interview fit|vacation fit|resort fit)\b/);
  const iteration = has(text, /\b(another version|another one|one more|try again|show me another|give me another|different version|different outfit|different look|something else|what else can i wear|new one)\b/);
  const feedback = has(text, /\b(i dont like this|dont like this|not my vibe|nah|nope|too loud|too flashy|too basic|too sporty|too casual|too formal|less npc|not this)\b/);
  const occasionChange =
    !!occasion &&
    hasPreviousOutfit &&
    (has(text, /\b(make|turn|switch|change|adjust|dress|style)\b/) ||
      has(text, /\b(appropriate|ready|for|fit|outfit|look)\b/));
  const vibeShift = has(text, /\b(more|less|make it|make this|something)\b/) && !!detectVibe(text);
  const replacePiece =
    has(text, /\b(switch|swap|replace|change|use different|different|instead)\b/) &&
    !!targetItemCategory;
  const removePiece =
    has(text, /\b(remove|take out|get rid of|dont use|do not use|dont want|do not want|lose|no)\b/) &&
    !!targetItemCategory;
  const improveFit =
    has(text, /\b(make it better|make this better|improve|refine|polish|complete|finish|dress this up|dress it up|dress this down|dress it down|warmer|cooler|date appropriate|less basic|cleaner|classier)\b/) ||
    excludedColors.length > 0 ||
    excludedCategories.length > 0 ||
    requiredItems.length > 0;

  if (iteration) requestedChanges.push("another_version");
  if (feedback) requestedChanges.push("respond_to_feedback");
  if (occasionChange && occasion) requestedChanges.push(`occasion:${occasion}`);
  if (vibeShift && vibe) requestedChanges.push(`vibe:${vibe}`);
  if (replacePiece && targetItemCategory) requestedChanges.push(`replace:${targetItemCategory}`);
  if (removePiece && targetItemCategory) requestedChanges.push(`remove:${targetItemCategory}`);
  if (improveFit) requestedChanges.push("improve_fit");
  for (const color of excludedColors) requestedChanges.push(`exclude_color:${color}`);
  for (const category of excludedCategories) requestedChanges.push(`exclude_category:${category}`);
  for (const item of requiredItems) requestedChanges.push(`require_item:${item}`);

  let intent: AuraStylingIntentName = "non_styling_chat";
  if (replacePiece || removePiece) intent = "replace_piece";
  else if (iteration) intent = "outfit_iteration";
  else if (generation) intent = "generate_outfit";
  else if (vibeShift) intent = "vibe_shift";
  else if (occasionChange) intent = "occasion_change";
  else if (feedback) intent = "outfit_feedback";
  else if (improveFit) intent = "improve_fit";
  else if (generation || occasion) intent = "generate_outfit";

  if (
    intent === "non_styling_chat" &&
    hasPreviousOutfit &&
    has(text, /\b(better|cleaner|classier|darker|warmer|cooler|streetwear|luxury|aura|shoes|sneakers|pants|top|shirt|tee|tshirt|t-shirt|jacket|remove|replace|swap|dont use|do not use|take out|get rid of|lose)\b/)
  ) {
    intent = targetItemCategory ? "replace_piece" : detectVibe(text) ? "vibe_shift" : "improve_fit";
  }

  const shouldGenerateOutfit = shouldGenerateOutfitForMessage({
    intent,
    shouldGenerateOutfit: false,
  }, state);

  return {
    intent,
    shouldGenerateOutfit,
    shouldRenderOutfitCard: shouldGenerateOutfit,
    occasion,
    vibe,
    requestedChanges,
    targetItemCategory,
    excludedColors,
    excludedCategories,
    requiredItems,
    explicitSportsContext,
    confidence:
      intent === "non_styling_chat"
        ? 0.74
        : generation || iteration || replacePiece || removePiece || occasionChange
          ? 0.92
          : 0.82,
  };
}

export function shouldGenerateOutfitForMessage(
  intentResult: Pick<AuraIntentResult, "intent" | "shouldGenerateOutfit">,
  _conversationState: AuraIntentConversationState = {},
): boolean {
  if (intentResult.shouldGenerateOutfit) return true;
  return OUTFIT_WORTHY_INTENTS.has(intentResult.intent);
}

export function canonicalAuraOccasion(value?: string | null): AuraOccasion | undefined {
  const text = normalized(value);
  if (!text || text === "unknown") return undefined;
  if (text === "date") return "date_night";
  if (has(text, /\b(upscale date|fine dining|five star restaurant|5 star restaurant|fancy restaurant|michelin|high end restaurant|formal dinner|luxury dinner|elegant dinner)\b/)) {
    return "fancy_dinner";
  }
  if (text === "work" || text === "office" || text === "smart casual") return "business_casual";
  if (text === "party" || text === "night out") return "club";
  if (text === "travel") return "airport";
  if ((AURA_OCCASION_RULES as Record<string, AuraOccasionRule>)[text]) return text as AuraOccasion;
  return detectOccasion(text);
}

function itemFieldList(item: Record<string, unknown>, keys: string[]): string[] {
  return keys.flatMap((key) => {
    const value = item[key];
    if (Array.isArray(value)) return value.map(clean);
    return [clean(value)];
  }).filter(Boolean);
}

function itemText(item: Record<string, unknown>): string {
  return normalized([
    ...itemFieldList(item, [
      "category",
      "subCategory",
      "type",
      "name",
      "itemName",
      "brand",
      "style",
      "formality",
      "pattern",
      "material",
      "graphicText",
      "motif",
      "collaborationName",
      "colorLabel",
      "primaryColor",
      "displayColor",
    ]),
    ...itemFieldList(item, ["colors", "displayColors", "aestheticTags", "detailTags", "occasionTags", "seasonTags"]),
  ].join(" "));
}

export function isSportsJerseyText(value: string): boolean {
  return has(
    normalized(value),
    /\b(football jersey|sports jersey|team jersey|nfl jersey|nba jersey|soccer jersey|baseball jersey|hockey jersey|jersey|team top)\b/,
  );
}

function canonicalCategoryForItem(text: string, rawCategory: string): string {
  if (isSportsJerseyText(text)) return "sports_jersey";
  if (has(text, /\bgym shorts?\b/)) return "gym_shorts";
  if (has(text, /\bslides?\b/)) return "slides";
  if (has(text, /\b(cargo pants?|cargos?)\b/)) return "cargo";
  if (has(text, /\b(hoodie|sweatshirt)\b/)) return "hoodie";
  if (has(text, /\b(shorts?)\b/)) return "shorts";
  if (has(text, /\b(sneakers?|trainer|jordan|dunk|air force)\b/)) return "sneaker";
  if (has(text, /\b(loafer|derby|oxford|dress shoe)\b/)) return "formal_shoe";
  if (has(text, /\b(boot|chelsea)\b/)) return "boot";
  if (has(text, /\b(blazer|suit|tailored|trouser|button down|buttondown|dress shirt)\b/)) return "tailoring";
  if (has(text, /\b(tee|t shirt|tshirt)\b/)) return "tee";
  if (has(text, /\b(denim|jeans?)\b/)) return "denim";
  if (has(text, /\b(jacket|coat|outerwear|overshirt|cardigan)\b/)) return "outerwear";
  if (has(text, /\b(shoe|footwear)\b/)) return "footwear";
  if (rawCategory) return rawCategory;
  return "unknown";
}

function inferItemFormality(item: Record<string, unknown>, text: string): number {
  const explicit = Number(item.formalityScore);
  if (Number.isFinite(explicit)) return Math.max(0, Math.min(1, explicit));
  const formality = normalized(item.formality);
  if (formality === "formal") return 0.9;
  if (formality === "smart_casual" || formality === "business_casual") return 0.68;
  if (formality === "casual") return 0.38;
  if (has(text, /\b(suit|blazer|trouser|loafer|oxford|derby|button down|dress shirt|tailored)\b/)) return 0.82;
  if (has(text, /\b(knit|overshirt|dark denim|boot|polo|leather|suede)\b/)) return 0.62;
  if (has(text, /\b(hoodie|tee|sneaker|cargo|denim)\b/)) return 0.42;
  if (has(text, /\b(gym|athletic|jersey|slides|shorts)\b/)) return 0.16;
  return 0.5;
}

export function normalizeAuraClosetItem(item: unknown): NormalizedAuraItem {
  const record = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
  const text = itemText(record);
  const category = canonicalCategoryForItem(text, normalized(record.category));
  const colorValues = itemFieldList(record, ["primaryColor", "colorLabel", "displayColor", "colors", "displayColors"]);
  const color = colorValues.map(normalized).find(Boolean) ?? null;
  const tags = unique([
    category,
    ...itemFieldList(record, ["style", "aestheticTags", "detailTags", "occasionTags", "seasonTags"]),
  ], 16).map(normalized);
  const isJersey = isSportsJerseyText(text);
  const isTeamSportswear =
    isJersey || has(text, /\b(team|nfl|nba|mlb|nhl|soccer|football|basketball|baseball|hockey)\b/);
  const isGymShorts = category === "gym_shorts";
  const isSlides = category === "slides";
  const sportiness =
    isTeamSportswear || isGymShorts || isSlides || has(text, /\b(gym|athletic|training|running|workout|sport)\b/)
      ? isJersey || isGymShorts
        ? 1
        : 0.74
      : has(text, /\b(sneaker|hoodie|sweatpant|shorts)\b/)
        ? 0.36
        : 0.08;
  const graphicIntensity =
    has(text, /\b(graphic|logo|motif|print|jersey|team|text)\b/) ? (isJersey ? 1 : 0.68) : 0.12;
  const formality = inferItemFormality(record, text);
  return {
    id: clean(record.id) || null,
    name: clean(record.name) || clean(record.itemName) || clean(record.subCategory) || clean(record.type) || "Wardrobe item",
    category,
    subCategory: clean(record.subCategory) || null,
    color,
    brand: clean(record.brand) || null,
    text,
    tags,
    formality,
    sportiness,
    graphicIntensity,
    dressiness: formality - sportiness * 0.25,
    isJersey,
    isTeamSportswear,
    isSlides,
    isGymShorts,
    isCargo: category === "cargo",
    isDistressed: has(text, /\b(distressed|ripped|destroyed|raw hem)\b/),
    isOwned: clean((record as { source?: unknown }).source) !== "suggested",
  };
}

function isDateOccasion(occasion?: string | null) {
  const text = normalized(occasion);
  return ["first date", "date night", "coffee date", "fancy dinner", "date"].includes(text);
}

function isFineDiningOccasion(occasion?: string | null, vibe?: string | null) {
  const text = normalized([occasion, vibe].filter(Boolean).join(" "));
  return canonicalAuraOccasion(occasion) === "fancy_dinner" ||
    has(text, /\b(fancy dinner|upscale date|fine dining|five star|5 star|michelin|high end|formal dinner|luxury dinner|elegant dinner|steakhouse)\b/);
}

function itemLooksElevatedTop(item: NormalizedAuraItem) {
  return (
    item.formality >= 0.55 ||
    has(item.text, /\b(knit|polo|button down|buttondown|shirt|overshirt|sweater|cardigan|blazer|suede|leather|structured)\b/)
  );
}

function itemLooksCleanFootwear(item: NormalizedAuraItem) {
  return (
    item.formality >= 0.45 ||
    has(item.text, /\b(clean|premium|leather|suede|loafer|boot|chelsea|derby|oxford|minimal|white sneaker|black sneaker)\b/)
  );
}

function itemLooksDressierFootwear(item: NormalizedAuraItem) {
  return (
    item.category === "formal_shoe" ||
    item.category === "boot" ||
    item.formality >= 0.68 ||
    has(item.text, /\b(loafer|chelsea|derby|oxford|dress shoe|dress boot|leather shoe|black leather|suede boot)\b/)
  );
}

function itemLooksAirForceOne(item: NormalizedAuraItem) {
  return has(item.text, /\b(air force ?1s?|air force ones?|af1s?)\b/);
}

function itemLooksElevatedBottom(item: NormalizedAuraItem) {
  return (
    item.formality >= 0.5 ||
    has(item.text, /\b(trouser|tailored|dark denim|straight leg|wool|pleated|clean denim)\b/)
  );
}

export function scoreAuraOutfitQuality(
  items: unknown[],
  context: { occasion?: string | null; vibe?: string | null } = {},
): AuraOutfitQualityScore {
  const normalizedItems = items.map((item) => normalizeAuraClosetItem(item));
  const text = normalized([context.occasion, context.vibe, ...normalizedItems.map((item) => item.text)].join(" "));
  const topItems = normalizedItems.filter((item) =>
    item.category === "tee" ||
    item.category === "hoodie" ||
    item.category === "sports_jersey" ||
    has(item.text, /\b(top|shirt|tee|polo|knit|sweater|hoodie|button)\b/),
  );
  const bottomItems = normalizedItems.filter((item) =>
    item.category === "denim" ||
    item.category === "cargo" ||
    item.category === "shorts" ||
    item.category === "gym_shorts" ||
    has(item.text, /\b(jeans|pants|trousers|bottom|cargos|shorts)\b/),
  );
  const footwearItems = normalizedItems.filter((item) =>
    item.category === "footwear" ||
    item.category === "sneaker" ||
    item.category === "boot" ||
    item.category === "formal_shoe" ||
    item.category === "slides" ||
    has(item.text, /\b(shoe|sneaker|boot|loafer|footwear)\b/),
  );
  const hasLayer = normalizedItems.some((item) => item.category === "outerwear" || has(item.text, /\b(jacket|coat|overshirt|blazer|cardigan|layer)\b/));
  const hasAccessory = normalizedItems.some((item) => item.category === "accessory" || has(item.text, /\b(watch|chain|necklace|bag|belt|hat|cap|glasses|sunglasses)\b/));
  const hasElevatedTop = topItems.some(itemLooksElevatedTop);
  const hasCleanFootwear = footwearItems.some(itemLooksCleanFootwear);
  const hasDressierFootwear = footwearItems.some(itemLooksDressierFootwear);
  const hasElevatedBottom = bottomItems.some(itemLooksElevatedBottom);
  const colors = normalizedItems.map((item) => item.color).filter((color): color is string => !!color);
  const neutralCount = colors.filter((color) => ["black", "white", "grey", "gray", "navy", "cream", "brown", "charcoal"].includes(color)).length;
  const hasDeliberateColorStory = colors.length >= 2 && (new Set(colors).size <= 3 || neutralCount >= 2);
  const hasTextureContrast = new Set(
    normalizedItems.flatMap((item) => {
      const matches = item.text.match(/\b(knit|wool|leather|suede|denim|cotton|nylon|canvas|ribbed|fleece)\b/g);
      return matches ?? [];
    }),
  ).size >= 2;
  const signals = [
    hasLayer ? "layering piece" : "",
    hasAccessory ? "accessory detail" : "",
    hasElevatedTop ? "elevated top" : "",
    hasDressierFootwear ? "dressier footwear" : hasCleanFootwear ? "clean footwear" : "",
    hasElevatedBottom ? "sharper bottom" : "",
    hasDeliberateColorStory ? "deliberate color story" : "",
    hasTextureContrast ? "texture contrast" : "",
  ].filter(Boolean);
  const penalties: string[] = [];
  let qualityScore = signals.length * 4;
  const top = topItems[0];
  const bottom = bottomItems[0];
  const footwear = footwearItems[0];
  const isBasicTee = !!top && top.category === "tee" && top.formality < 0.52;
  const isGraphicTop = !!top && (top.graphicIntensity >= 0.65 || has(top.text, /\b(graphic|print|logo)\b/));
  const isJeansOrCasualBottom = !!bottom && (bottom.category === "denim" || bottom.category === "cargo" || bottom.formality < 0.46);
  const isBasicSneaker = !!footwear && footwear.category === "sneaker" && footwear.formality < 0.5 && !has(footwear.text, /\b(clean|premium|leather|suede|minimal)\b/);
  const onlyCorePieces = normalizedItems.filter((item) => item.category !== "accessory").length <= 3 && !hasLayer && !hasAccessory;
  const date = isDateOccasion(context.occasion);
  const fineDining = isFineDiningOccasion(context.occasion, context.vibe);

  if (onlyCorePieces && isBasicTee && isJeansOrCasualBottom && isBasicSneaker) {
    qualityScore -= fineDining ? 24 : date ? 16 : 8;
    penalties.push(fineDining ? "basic_fine_dining_core" : date ? "basic_date_core" : "basic_three_piece_core");
  }
  if (date && isGraphicTop && !hasLayer && !hasElevatedBottom) {
    qualityScore -= 14;
    penalties.push("graphic_tee_without_date_balance");
  }
  if (fineDining) {
    if (isGraphicTop && !hasLayer) {
      qualityScore -= 20;
      penalties.push("fine_dining_visible_graphic_tee");
    }
    if (!hasElevatedTop) {
      qualityScore -= 10;
      penalties.push("fine_dining_needs_polished_top");
    }
    if (!hasDressierFootwear) {
      qualityScore -= 10;
      penalties.push(footwear && itemLooksAirForceOne(footwear) ? "fine_dining_air_force_1_compromise" : "fine_dining_needs_dressier_footwear");
    }
  }
  if ((date || has(text, /\b(clean|classy|elevated|luxury|aura)\b/)) && signals.length < 2) {
    qualityScore -= 8;
    penalties.push("not_enough_intentional_styling");
  }

  return {
    qualityScore,
    intentionalElementCount: signals.length,
    signals,
    penalties,
  };
}

function categoryMatches(ruleCategory: string, item: NormalizedAuraItem): boolean {
  if (ruleCategory === item.category) return true;
  if (ruleCategory === "team_jersey" || ruleCategory === "football_jersey") return item.isJersey;
  if (ruleCategory === "sports_jersey") return item.isJersey || item.isTeamSportswear;
  if (ruleCategory === "athletic") return item.sportiness >= 0.64;
  if (ruleCategory === "loud_graphic") return item.graphicIntensity >= 0.7;
  if (ruleCategory === "distressed") return item.isDistressed;
  if (ruleCategory === "slides") return item.isSlides;
  if (ruleCategory === "gym_shorts") return item.isGymShorts;
  return item.text.includes(ruleCategory.replace(/_/g, " "));
}

function isExplicitSportsJerseyException(category: string, item: NormalizedAuraItem, explicitUserRequest: boolean): boolean {
  if (!explicitUserRequest || !item.isJersey) return false;
  return category === "sports_jersey" || category === "team_jersey" || category === "football_jersey";
}

export function isItemIncompatibleWithOccasion(
  item: unknown,
  occasionValue?: string | null,
  explicitUserRequest = false,
): boolean {
  const occasion = canonicalAuraOccasion(occasionValue);
  if (!occasion) return false;
  const normalizedItem = normalizeAuraClosetItem(item);
  const rule = AURA_OCCASION_RULES[occasion];
  if (!rule) return false;
  if (rule.bannedCategories.some((category) =>
    categoryMatches(category, normalizedItem) &&
    !isExplicitSportsJerseyException(category, normalizedItem, explicitUserRequest)
  )) return true;
  if (
    ["first_date", "date_night", "coffee_date", "fancy_dinner", "wedding", "interview", "business_casual", "formal"].includes(occasion) &&
    ((!explicitUserRequest && normalizedItem.isJersey) || normalizedItem.isGymShorts || normalizedItem.isSlides)
  ) {
    return true;
  }
  return false;
}

export function scoreAuraItemForIntent(
  item: unknown,
  context: {
    occasion?: string | null;
    vibe?: string | null;
    excludedColors?: string[];
    excludedCategories?: string[];
    explicitSportsContext?: boolean;
  } = {},
): AuraScoredItem {
  const normalizedItem = normalizeAuraClosetItem(item);
  const occasion = canonicalAuraOccasion(context.occasion);
  const rule = occasion ? AURA_OCCASION_RULES[occasion] : undefined;
  const penalties: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  if (rule) {
    const [minFormality, maxFormality] = rule.preferredFormality;
    const formalityDistance =
      normalizedItem.formality < minFormality
        ? minFormality - normalizedItem.formality
        : normalizedItem.formality > maxFormality
          ? normalizedItem.formality - maxFormality
          : 0;
    score += Math.max(0, 1 - formalityDistance * 2) * 1.2;
    if (rule.preferredVibes.some((vibe) => normalizedItem.text.includes(normalized(vibe)))) score += 0.42;

    for (const category of rule.penalizedCategories) {
      if (categoryMatches(category, normalizedItem)) {
        const penalty = category === "athletic" ? 0.9 : 0.72;
        score -= penalty;
        penalties.push(`penalized_${category}`);
      }
    }

    for (const category of rule.bannedCategories) {
      if (
        categoryMatches(category, normalizedItem) &&
        !isExplicitSportsJerseyException(category, normalizedItem, !!context.explicitSportsContext)
      ) {
        score -= 4.2;
        penalties.push(`near_banned_${category}`);
      }
    }

    if (occasion && isItemIncompatibleWithOccasion(item, occasion, !!context.explicitSportsContext)) {
      score -= 3.6;
      warnings.push(`${normalizedItem.name} is incompatible with ${occasion.replace(/_/g, " ")}.`);
    }

    if (occasion === "fancy_dinner") {
      const graphicTop =
        (normalizedItem.category === "tee" || has(normalizedItem.text, /\b(tee|t shirt|tshirt|shirt|top)\b/)) &&
        (normalizedItem.graphicIntensity >= 0.6 || has(normalizedItem.text, /\b(graphic|logo|print|loud|statement)\b/));
      if (graphicTop) {
        score -= 2.6;
        penalties.push("fine_dining_graphic_tee");
      } else if (normalizedItem.category === "tee") {
        score -= 0.9;
        penalties.push("fine_dining_plain_tee_needs_layer");
      }
      if (normalizedItem.category === "sneaker") {
        const airForceOne = itemLooksAirForceOne(normalizedItem);
        score -= airForceOne ? 1.55 : 1.05;
        penalties.push(airForceOne ? "fine_dining_air_force_1" : "fine_dining_casual_sneaker");
      }
      if (normalizedItem.category === "denim" && !has(normalizedItem.text, /\b(dark|clean|black|raw|tailored)\b/)) {
        score -= 0.8;
        penalties.push("fine_dining_casual_denim");
      }
      if (
        normalizedItem.category === "tailoring" ||
        normalizedItem.category === "formal_shoe" ||
        normalizedItem.category === "boot" ||
        has(normalizedItem.text, /\b(button down|buttondown|dress shirt|knit polo|merino|sweater|blazer|overshirt|trouser|loafer|chelsea|leather|suede)\b/)
      ) {
        score += 1.25;
      }
    }
  }

  if (context.excludedColors?.some((color) => normalizedItem.color === normalized(color))) {
    score -= 4;
    penalties.push(`excluded_color_${normalizedItem.color}`);
  }

  if (
    context.excludedCategories?.some((category) =>
      normalizedItem.text.includes(normalized(category)) || normalizedItem.category.includes(normalized(category)),
    )
  ) {
    score -= 4;
    penalties.push("excluded_category");
  }

  const vibeText = normalized(context.vibe);
  if (vibeText) {
    if (vibeText.includes("clean") || vibeText.includes("classy") || vibeText.includes("luxury") || vibeText.includes("aura")) {
      score += normalizedItem.dressiness * 0.7;
      score -= normalizedItem.graphicIntensity * 0.35;
      score -= normalizedItem.sportiness * 0.52;
    }
    if (vibeText.includes("streetwear")) {
      score += normalizedItem.text.includes("sneaker") || normalizedItem.text.includes("cargo") || normalizedItem.text.includes("oversized") ? 0.35 : 0;
      score -= normalizedItem.isJersey && !context.explicitSportsContext ? 0.75 : 0;
    }
    if (vibeText.includes("dark") && normalizedItem.color === "black") score += 0.45;
    if (vibeText.includes("minimal")) {
      score -= normalizedItem.graphicIntensity * 0.5;
      score += normalizedItem.color && ["black", "white", "grey", "gray", "navy", "cream"].includes(normalizedItem.color) ? 0.22 : 0;
    }
  }

  return {
    item,
    normalized: normalizedItem,
    score,
    penalties,
    warnings,
  };
}

function colorHarmony(items: NormalizedAuraItem[]): number {
  const colors = items.map((item) => item.color).filter((color): color is string => !!color);
  if (!colors.length) return 8;
  const uniqueColors = new Set(colors);
  const neutrals = colors.filter((color) => ["black", "white", "grey", "gray", "navy", "beige", "cream", "brown"].includes(color));
  let score = 6;
  if (neutrals.length >= 2) score += 3;
  if (uniqueColors.size <= 3) score += 2;
  if (uniqueColors.size >= 5) score -= 3;
  return Math.max(0, Math.min(12, score));
}

export function scoreAuraOutfitCandidate(
  items: unknown[],
  context: {
    occasion?: string | null;
    vibe?: string | null;
    excludedColors?: string[];
    excludedCategories?: string[];
    explicitSportsContext?: boolean;
    userPreferredVibes?: string[];
  } = {},
): AuraOutfitScore {
  const scored = items.map((item) => scoreAuraItemForIntent(item, context));
  const normalizedItems = scored.map((entry) => entry.normalized);
  const quality = scoreAuraOutfitQuality(items, context);
  const rule = canonicalAuraOccasion(context.occasion);
  const occasionScore = Math.max(0, 30 + scored.reduce((sum, entry) => sum + entry.score, 0) * 6);
  const targetRange = rule ? AURA_OCCASION_RULES[rule].preferredFormality : [0.3, 0.7] as [number, number];
  const avgFormality =
    normalizedItems.reduce((sum, item) => sum + item.formality, 0) / Math.max(1, normalizedItems.length);
  const formalityScore =
    avgFormality >= targetRange[0] && avgFormality <= targetRange[1]
      ? 18
      : Math.max(0, 18 - Math.min(Math.abs(avgFormality - targetRange[0]), Math.abs(avgFormality - targetRange[1])) * 35);
  const colorScore = colorHarmony(normalizedItems);
  const roles = new Set(normalizedItems.map((item) => item.category));
  const silhouetteScore = Math.min(12, 5 + roles.size * 1.5);
  const vibeText = normalized(context.vibe);
  const vibeScore = vibeText
    ? Math.min(12, 6 + scored.reduce((sum, entry) => sum + Math.max(0, entry.score), 0))
    : 8;
  const userPreferenceScore = (context.userPreferredVibes ?? []).some((vibe) => normalized(vibe) && vibeText.includes(normalized(vibe))) ? 6 : 3;
  const closetAvailabilityScore = normalizedItems.every((item) => item.isOwned) ? 8 : 4;
  const noveltyScore = 2;
  const incompatibilityPenalty = scored.reduce(
    (sum, entry) => sum + entry.penalties.filter((penalty) => penalty.startsWith("near_banned") || penalty.startsWith("excluded")).length * 22,
    0,
  ) + Math.max(0, -quality.qualityScore) * 1.4;
  const rejectedItems = scored.flatMap((entry) =>
    entry.penalties
      .filter((penalty) => penalty.startsWith("near_banned") || penalty.startsWith("excluded"))
      .map((reason) => ({ name: entry.normalized.name, reason })),
  );
  const warnings = unique(scored.flatMap((entry) => entry.warnings), 8);
  const score =
    occasionScore +
    formalityScore +
    colorScore +
    silhouetteScore +
    vibeScore +
    userPreferenceScore +
    closetAvailabilityScore +
    noveltyScore +
    Math.max(0, quality.qualityScore) -
    incompatibilityPenalty;

  return {
    score,
    occasionScore,
    formalityScore,
    colorScore,
    silhouetteScore,
    vibeScore,
    userPreferenceScore,
    closetAvailabilityScore,
    noveltyScore,
    incompatibilityPenalty,
    warnings,
    rejectedItems,
  };
}

export function rankAuraOutfitCandidates<T extends AuraOutfitCandidateLike>(
  candidates: T[],
  context: Parameters<typeof scoreAuraOutfitCandidate>[1] = {},
): Array<T & { auraScore: AuraOutfitScore }> {
  return candidates
    .map((candidate) => ({
      ...candidate,
      auraScore: scoreAuraOutfitCandidate(candidate.items, context),
    }))
    .sort((a, b) => b.auraScore.score - a.auraScore.score);
}

export function countMeaningfulItemChanges(
  previousItems: Array<{ id?: string | null; itemId?: string | null; category?: string | null; role?: string | null; name?: string | null; itemName?: string | null }>,
  nextItems: Array<{ id?: string | null; itemId?: string | null; category?: string | null; role?: string | null; name?: string | null; itemName?: string | null }>,
): number {
  const key = (item: { id?: string | null; itemId?: string | null; category?: string | null; role?: string | null; name?: string | null; itemName?: string | null }) =>
    clean(item.itemId ?? item.id) || normalized([item.role, item.category, item.itemName, item.name].filter(Boolean).join(":"));
  const previous = new Set(previousItems.map(key).filter(Boolean));
  return nextItems.map(key).filter(Boolean).filter((value) => !previous.has(value)).length;
}

function promptSuggestsVacation(prompt?: string | null, vibe?: string | null) {
  return has(normalized([prompt, vibe].filter(Boolean).join(" ")), /\b(vacation|holiday|resort)\b/);
}

function titleCaseWords(value: string) {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function auraTagForContext(params: {
  prompt?: string | null;
  occasion?: string | null;
  vibe?: string | null;
  incomplete?: boolean;
}): AuraCardTag {
  if (params.incomplete) return "CASUAL";
  const occasion = canonicalAuraOccasion(params.occasion);
  const vibe = normalized(params.vibe);
  const promptText = normalized(params.prompt);
  if (occasion === "first_date") return "FIRST DATE";
  if (occasion === "coffee_date") return "COFFEE DATE";
  if (occasion === "fancy_dinner") {
    return has([promptText, vibe].join(" "), /\b(date|anniversary|romantic)\b/) ? "UPSCALE DATE" : "FANCY DINNER";
  }
  if (occasion === "date_night") return "DATE NIGHT";
  if (occasion === "business_casual") {
    if (has([promptText, vibe].join(" "), /\b(creative office|startup office|office streetwear)\b/)) return "CREATIVE OFFICE";
    if (has([promptText, vibe].join(" "), /\bbusiness casual\b/)) return "BUSINESS CASUAL";
    if (has([promptText, vibe].join(" "), /\bsmart casual\b/)) return "SMART CASUAL";
    return "OFFICE CASUAL";
  }
  if (occasion === "wedding" || occasion === "formal") return "FORMAL";
  if (occasion === "interview") return "INTERVIEW";
  if (occasion === "club") return "CLUB";
  if (occasion === "rave") return "RAVE";
  if (occasion === "summer" || occasion === "beach") return "WARM WEATHER";
  if (occasion === "winter") return "COLD WEATHER";
  if (promptSuggestsVacation(params.prompt, params.vibe)) return "VACATION";
  if (vibe.includes("streetwear") || occasion === "streetwear") return "STREETWEAR";
  if (vibe.includes("minimal")) return "MINIMAL";
  if (vibe.includes("clean")) return "CLEAN";
  if (vibe.includes("luxury") || vibe.includes("classy") || vibe.includes("aura") || vibe.includes("elevated")) return "ELEVATED CASUAL";
  return "CASUAL";
}

function titleForAuraTag(tag: AuraCardTag, quality: AuraOutfitQualityScore) {
  const hasSneakerSignal = quality.signals.some((signal) => signal.includes("footwear"));
  switch (tag) {
    case "FIRST DATE":
      return "Easy First Date Fit";
    case "UPSCALE DATE":
      return "Upscale Dinner Date";
    case "FANCY DINNER":
      return "Polished Five-Star Dinner Fit";
    case "BUSINESS CASUAL":
      return "Business Casual Office Fit";
    case "SMART CASUAL":
      return "Smart Casual Office Fit";
    case "CREATIVE OFFICE":
      return "Creative Office Fit";
    case "OFFICE CASUAL":
      return "Office Casual Fit";
    case "DATE NIGHT":
      return "Easy Date Night Uniform";
    case "COFFEE DATE":
      return "Coffee Date Casual";
    case "VACATION":
      return "Warm Weather Casual";
    case "STREETWEAR":
      return "Soft Streetwear Reset";
    case "ELEVATED CASUAL":
      return "Elevated Off-Duty Look";
    case "POLISHED":
      return "Polished Dinner Fit";
    case "MINIMAL":
      return hasSneakerSignal ? "Minimal Sneaker Fit" : "Minimal Casual Fit";
    case "CLEAN":
      return "Clean Casual Fit";
    case "WARM WEATHER":
      return "Warm Weather Casual";
    case "COLD WEATHER":
      return "Layered Cold Weather Fit";
    case "RAVE":
      return "Rave-Ready Utility Fit";
    case "CLUB":
      return "Low-Key Club Fit";
    case "INTERVIEW":
      return "Clean Interview Fit";
    case "FORMAL":
      return "Polished Formal Fit";
    case "CASUAL":
    default:
      return "Clean Casual Fit";
  }
}

function tagConflictsWithText(tag: AuraCardTag, value?: string | null) {
  const text = normalized(value);
  if (!text) return false;
  const dateText = has(text, /\b(date|romantic|dinner date|first date|date night)\b/);
  const vacationText = has(text, /\b(vacation|resort|holiday)\b/);
  const weddingText = has(text, /\b(wedding|ceremony|reception)\b/);
  const gymText = has(text, /\b(gym|workout|training)\b/);
  if (!["DATE NIGHT", "FIRST DATE", "COFFEE DATE", "UPSCALE DATE", "FANCY DINNER", "POLISHED"].includes(tag) && dateText) return true;
  if (tag !== "VACATION" && vacationText) return true;
  if (tag !== "FORMAL" && weddingText) return true;
  if (["DATE NIGHT", "FIRST DATE", "COFFEE DATE", "UPSCALE DATE", "FANCY DINNER", "POLISHED", "FORMAL", "INTERVIEW", "OFFICE CASUAL", "BUSINESS CASUAL", "SMART CASUAL"].includes(tag) && gymText) return true;
  return false;
}

function titleLooksGenericOrRaw(value?: string | null) {
  const title = clean(value);
  if (!title) return true;
  if (has(normalized(title), /\b(wardrobe reset|safe wardrobe|easy color story|smart outfit|closest closet look|aura edit|outfit option|jacket option)\b/)) return true;
  if (title.length > 36 || /[+:]/.test(title)) return true;
  return has(normalized(title), /\b(tee|shirt|polo|jeans|pants|trousers|sneaker|shoe|loafer|jacket|hoodie|shorts)\b/);
}

function explanationForAuraTag(tag: AuraCardTag, incomplete: boolean) {
  if (incomplete) {
    return "I'll start with a clean casual option - tell me the occasion and I'll sharpen it.";
  }
  switch (tag) {
    case "FIRST DATE":
    case "DATE NIGHT":
      return "This keeps it date-ready: clean, intentional, and sharper than a basic everyday fit.";
    case "UPSCALE DATE":
      return "This is polished enough for a five-star dinner while still feeling like an elevated date fit.";
    case "FANCY DINNER":
      return "This keeps the outfit clean, intentional, and restaurant-appropriate for a dressier dinner.";
    case "BUSINESS CASUAL":
      return "This keeps the outfit polished for business casual without calling it formal.";
    case "SMART CASUAL":
      return "This reads smart casual: structured enough for office, still wearable.";
    case "CREATIVE OFFICE":
      return "This keeps the office read relaxed but still intentional and clean.";
    case "OFFICE CASUAL":
      return "This keeps it office casual with cleaner structure than a weekend fit.";
    case "COFFEE DATE":
      return "This keeps the coffee date feel easy but still pulled together.";
    case "VACATION":
      return "This stays relaxed and warm-weather ready for the trip.";
    case "STREETWEAR":
      return "This keeps the streetwear read soft, clean, and wearable.";
    case "ELEVATED CASUAL":
      return "This gives you an elevated casual base that feels styled instead of just matched.";
    case "POLISHED":
      return "This keeps the outfit sharper than casual without overdoing it.";
    case "MINIMAL":
      return "This keeps the palette minimal and lets the proportions do the work.";
    case "CLEAN":
      return "This is the cleanest option from your closet for that direction.";
    case "WARM WEATHER":
      return "This keeps it light, casual, and warm-weather ready.";
    case "COLD WEATHER":
      return "This uses the closet pieces as a warmer, layered base.";
    case "RAVE":
      return "This leans into a darker utility feel while keeping movement in mind.";
    case "CLUB":
      return "This gives you a simple night-out base with enough polish.";
    case "INTERVIEW":
      return "This keeps the outfit professional, quiet, and intentional.";
    case "FORMAL":
      return "This keeps the outfit polished enough for the dressier setting.";
    case "CASUAL":
    default:
      return "This gives you a simple, pulled-together casual base.";
  }
}

function stylingNoteForAuraTag(tag: AuraCardTag, quality: AuraOutfitQualityScore) {
  const signals = quality.signals.slice(0, 2);
  if (signals.length) {
    return `The styling move is ${signals.join(" plus ")}.`;
  }
  if (["BUSINESS CASUAL", "SMART CASUAL", "OFFICE CASUAL", "CREATIVE OFFICE"].includes(tag)) {
    return "Keep the top structured and the footwear clean so it reads office-ready, not weekend casual.";
  }
  if (["UPSCALE DATE", "FANCY DINNER", "POLISHED"].includes(tag)) {
    return "Keep the top polished and let dressier footwear carry the restaurant-ready finish.";
  }
  if (["DATE NIGHT", "FIRST DATE", "COFFEE DATE"].includes(tag)) {
    return "Keep the finish clean and avoid overly sporty or loud pieces.";
  }
  if (tag === "VACATION" || tag === "WARM WEATHER") {
    return "Keep the styling relaxed, breathable, and easy.";
  }
  return "Keep the proportions clean and the palette deliberate.";
}

export function normalizeAuraLookCardMetadata<T extends AuraLookCardMetadataLike>(
  look: T,
  context: {
    prompt?: string | null;
    occasion?: string | null;
    vibe?: string | null;
  } = {},
): T {
  const prompt = clean(context.prompt);
  const intent = classifyAuraStylingIntent(prompt || [context.occasion, context.vibe, look.occasion, look.vibe].filter(Boolean).join(" "));
  const incomplete = isIncompleteOccasionRequest(prompt);
  const promptDriven = !!prompt;
  const rawOccasion = incomplete
    ? "casual"
    : promptDriven
      ? intent.occasion ?? context.occasion ?? null
      : context.occasion ?? look.occasion ?? intent.occasion ?? null;
  const occasion = canonicalAuraOccasion(rawOccasion) ?? (incomplete ? "casual" : null);
  const rawVibe = promptDriven
    ? intent.vibe ?? context.vibe ?? null
    : context.vibe ?? look.vibe ?? intent.vibe ?? null;
  const tag = auraTagForContext({
    prompt,
    occasion,
    vibe: rawVibe,
    incomplete,
  });
  const quality = scoreAuraOutfitQuality(look.pieces ?? [], { occasion, vibe: rawVibe ?? tag });
  const generatedTitle = titleForAuraTag(tag, quality);
  const title = titleLooksGenericOrRaw(look.lookTitle) || tagConflictsWithText(tag, look.lookTitle)
    ? generatedTitle
    : titleCaseWords(clean(look.lookTitle));
  const shortExplanation = tagConflictsWithText(tag, look.shortExplanation)
    ? explanationForAuraTag(tag, incomplete)
    : clean(look.shortExplanation) || explanationForAuraTag(tag, incomplete);
  const stylingNote = tagConflictsWithText(tag, look.stylingNote)
    ? stylingNoteForAuraTag(tag, quality)
    : clean(look.stylingNote) || stylingNoteForAuraTag(tag, quality);

  return {
    ...look,
    lookTitle: title,
    occasion: occasion ?? (promptDriven ? (tag === "CASUAL" || tag === "VACATION" ? "casual" : null) : tag === "CASUAL" ? "casual" : look.occasion ?? null),
    vibe: tag,
    shortExplanation,
    stylingNote,
  };
}
