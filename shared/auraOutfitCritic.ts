import {
  canonicalAuraOccasion,
  classifyAuraStylingIntent,
  normalizeAuraClosetItem,
  type AuraOccasion,
} from "./auraStylingIntelligence";

export type AuraOutfitCriticIssue = {
  code: string;
  message: string;
  itemName?: string | null;
  severity: "blocking" | "warning";
};

export type AuraOutfitCriticFeedback = {
  score: number;
  blockingIssues: AuraOutfitCriticIssue[];
  warnings: AuraOutfitCriticIssue[];
  positiveSignals: string[];
  suggestedFixes: string[];
  shouldRegenerate: boolean;
  occasion?: AuraOccasion;
};

export type AuraOutfitCriticParams = {
  userPrompt?: string | null;
  occasion?: string | null;
  vibe?: string | null;
  items: unknown[];
  weatherContext?: string | null;
};

type CriticItem = {
  raw: unknown;
  name: string;
  category: string;
  text: string;
  color?: string | null;
  formality: number;
  sportiness: number;
  graphicIntensity: number;
};

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalized(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function has(text: string, pattern: RegExp) {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function recordText(item: unknown) {
  const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
  const values: string[] = [];
  for (const key of [
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
    "fit",
    "sleeveLength",
    "neckline",
    "collar",
    "closure",
    "length",
    "visualWeight",
    "primaryColor",
    "displayColor",
    "colorLabel",
  ]) {
    const value = record[key];
    if (Array.isArray(value)) values.push(...value.map(clean));
    else values.push(clean(value));
  }
  for (const key of ["colors", "displayColors", "aestheticTags", "detailTags", "occasionTags", "seasonTags", "materials"]) {
    const value = record[key];
    if (Array.isArray(value)) values.push(...value.map(clean));
  }
  return normalized(values.filter(Boolean).join(" "));
}

function criticItem(item: unknown): CriticItem {
  const normalizedItem = normalizeAuraClosetItem(item);
  const text = normalized([normalizedItem.text, recordText(item)].join(" "));
  return {
    raw: item,
    name: normalizedItem.name,
    category: normalizedItem.category,
    text,
    color: normalizedItem.color,
    formality: normalizedItem.formality,
    sportiness: normalizedItem.sportiness,
    graphicIntensity: normalizedItem.graphicIntensity,
  };
}

function roleForItem(item: CriticItem): "top" | "bottom" | "footwear" | "outerwear" | "accessory" | "unknown" {
  if (
    item.category === "denim" ||
    item.category === "cargo" ||
    item.category === "shorts" ||
    item.category === "gym_shorts" ||
    item.category === "bottom" ||
    has(item.text, /\b(pants|trousers|jeans|chinos|shorts|bottom|slacks|sweatpants|joggers)\b/)
  ) return "bottom";
  if (
    item.category === "sneaker" ||
    item.category === "boot" ||
    item.category === "formal_shoe" ||
    item.category === "slides" ||
    item.category === "footwear" ||
    has(item.text, /\b(shoes?|sneakers?|boots?|loafers?|slides?|flip flops?|footwear)\b/)
  ) return "footwear";
  if (item.category === "outerwear" || has(item.text, /\b(jacket|coat|outerwear|overshirt|blazer|cardigan|layer|shacket)\b/)) {
    return "outerwear";
  }
  if (item.category === "accessory" || has(item.text, /\b(cap|hat|beanie|watch|bag|belt|glasses|necklace|chain)\b/)) {
    return "accessory";
  }
  if (
    item.category === "tee" ||
    item.category === "hoodie" ||
    item.category === "sports_jersey" ||
    item.category === "tailoring" ||
    item.category === "top" ||
    has(item.text, /\b(top|shirt|tee|polo|knit|sweater|hoodie|tank|blouse|button)\b/)
  ) return "top";
  return "unknown";
}

function criticText(item: unknown | CriticItem) {
  return item && typeof item === "object" && "text" in item
    ? (item as CriticItem).text
    : criticItem(item).text;
}

export function isTankOrSleeveless(item: unknown): boolean {
  const text = criticText(item);
  return has(text, /\b(tank top|tank|sleeveless|muscle tee|singlet|cami|camisole|halter)\b/) ||
    has(text, /\bsleeve length sleeveless\b/);
}

export function isLoungeBottom(item: unknown): boolean {
  const text = criticText(item);
  return has(text, /\b(sweatpants?|joggers?|drawstring|lounge pants?|track pants?|pajama|pyjama|elastic waist|fleece pants?)\b/);
}

export function isOfficeFootwear(item: unknown): boolean {
  const candidate = criticItem(item);
  return has(candidate.text, /\b(loafer|derby|oxford|dress shoe|chelsea|dress boot|leather shoe|suede shoe|minimal sneaker|clean sneaker|plain sneaker)\b/) ||
    (candidate.category === "sneaker" && candidate.formality >= 0.48 && has(candidate.text, /\b(clean|minimal|plain|white|black|leather|premium)\b/)) ||
    candidate.category === "formal_shoe" ||
    candidate.category === "boot";
}

export function isCapOrHat(item: unknown): boolean {
  const text = criticText(item);
  return has(text, /\b(baseball cap|cap|snapback|trucker hat|beanie|bucket hat)\b/);
}

export function isStructuredLayer(item: unknown): boolean {
  const text = criticText(item);
  return has(text, /\b(blazer|overshirt|shirt jacket|shacket|chore coat|structured jacket|cardigan|wool coat|trench|sport coat|suit jacket)\b/);
}

export function isCleanBaseLayer(item: unknown): boolean {
  const text = criticText(item);
  if (isTankOrSleeveless(item)) return false;
  return has(text, /\b(clean tee|plain tee|fitted tee|heavyweight tee|white tee|black tee|solid tee|polo|knit polo|button down|buttondown|dress shirt|oxford shirt|sweater|knit|turtleneck|blouse)\b/) ||
    (!has(text, /\b(graphic|logo|print|distressed|ripped|jersey|gym|athletic)\b/) && has(text, /\b(tee|t shirt|tshirt|shirt)\b/));
}

function isOfficeTop(item: CriticItem, hasStructuredOuterwear: boolean) {
  if (isTankOrSleeveless(item.raw)) return false;
  if (has(item.text, /\b(button down|buttondown|dress shirt|oxford shirt|polo|knit polo|sweater|knit|turtleneck|blouse|collared)\b/)) {
    return true;
  }
  if (isCleanBaseLayer(item.raw) && hasStructuredOuterwear) return true;
  return item.formality >= 0.58 && roleForItem(item) === "top";
}

function isOfficeBottom(item: CriticItem) {
  return has(item.text, /\b(trousers?|chinos?|slacks|tailored pants?|wool pants?|pleated pants?|dark denim|black jeans|clean denim)\b/) ||
    item.formality >= 0.55;
}

function isSlidesOrFlipFlops(item: CriticItem) {
  return item.category === "slides" || has(item.text, /\b(slides?|flip flops?|sandals?|recovery slide)\b/);
}

function isGymOrAthletic(item: CriticItem) {
  return item.sportiness >= 0.72 || has(item.text, /\b(gym|workout|training|running|athletic|performance|compression|basketball shorts?|training shorts?)\b/);
}

function isLoudPartyOrStreetwear(item: CriticItem) {
  return item.graphicIntensity >= 0.75 ||
    has(item.text, /\b(loud|party|club|rave|festival|oversized graphic|statement graphic|distressed|ripped|destroyed|jersey)\b/);
}

function isExplicitRelaxedOffice(prompt: string, vibe: string) {
  const text = normalized([prompt, vibe].join(" "));
  return has(text, /\b(very casual|casual office|creative office|startup office|relaxed office|streetwear office|office streetwear)\b/);
}

function isOfficeRequest(params: AuraOutfitCriticParams, occasion?: AuraOccasion) {
  const text = normalized([params.userPrompt, params.occasion, params.vibe].filter(Boolean).join(" "));
  return occasion === "business_casual" ||
    has(text, /\b(office|business casual|smart casual|work fit|work outfit|for work|to work|workwear)\b/);
}

function unique(values: string[], max = 8) {
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

function issue(code: string, message: string, item: CriticItem | null, severity: "blocking" | "warning"): AuraOutfitCriticIssue {
  return {
    code,
    message,
    itemName: item?.name ?? null,
    severity,
  };
}

export function scoreOutfitForOccasion(params: AuraOutfitCriticParams): AuraOutfitCriticFeedback {
  const prompt = clean(params.userPrompt);
  const classified = classifyAuraStylingIntent(prompt || [params.occasion, params.vibe].filter(Boolean).join(" "));
  const occasion = canonicalAuraOccasion(params.occasion) ?? classified.occasion;
  const items = params.items.map(criticItem);

  if (!isOfficeRequest(params, occasion)) {
    return {
      score: 82,
      blockingIssues: [],
      warnings: [],
      positiveSignals: ["No office-specific critic rules needed."],
      suggestedFixes: [],
      shouldRegenerate: false,
      occasion,
    };
  }

  const relaxedOffice = isExplicitRelaxedOffice(prompt, clean(params.vibe));
  const creativeOffice = has(normalized([prompt, params.vibe].join(" ")), /\b(creative office|startup office|office streetwear)\b/);
  const topItems = items.filter((item) => roleForItem(item) === "top");
  const bottomItems = items.filter((item) => roleForItem(item) === "bottom");
  const footwearItems = items.filter((item) => roleForItem(item) === "footwear");
  const outerwearItems = items.filter((item) => roleForItem(item) === "outerwear");
  const hasStructuredOuterwear = outerwearItems.some((item) => isStructuredLayer(item.raw));
  const hasOfficeTop = topItems.some((item) => isOfficeTop(item, hasStructuredOuterwear));
  const hasOfficeBottom = bottomItems.some(isOfficeBottom);
  const hasOfficeShoes = footwearItems.some((item) => isOfficeFootwear(item.raw));
  const hasCleanBase = topItems.some((item) => isCleanBaseLayer(item.raw));
  const neutralCount = items.filter((item) => item.color && ["black", "white", "grey", "gray", "navy", "cream", "beige", "brown", "charcoal", "olive"].includes(item.color)).length;
  const blockingIssues: AuraOutfitCriticIssue[] = [];
  const warnings: AuraOutfitCriticIssue[] = [];
  const positiveSignals: string[] = [];
  const suggestedFixes: string[] = [];
  let score = 62;

  if (hasOfficeTop) {
    score += 10;
    positiveSignals.push(hasStructuredOuterwear && hasCleanBase ? "clean base layer with a structured layer" : "office-appropriate top");
  }
  if (hasOfficeBottom) {
    score += 10;
    positiveSignals.push("office-appropriate bottom");
  }
  if (hasOfficeShoes) {
    score += 8;
    positiveSignals.push("office-ready footwear");
  }
  if (hasStructuredOuterwear) {
    score += 7;
    positiveSignals.push("structured layer");
  }
  if (neutralCount >= Math.min(3, items.length)) {
    score += 4;
    positiveSignals.push("neutral office palette");
  }

  for (const item of items) {
    if (isTankOrSleeveless(item.raw)) {
      if (relaxedOffice) {
        score -= 10;
        warnings.push(issue("office_sleeveless_relaxed", "Sleeveless tops are still risky for office unless the dress code is very relaxed.", item, "warning"));
      } else {
        score -= 26;
        blockingIssues.push(issue("office_sleeveless_top", "Tank or sleeveless tops are too casual for a normal office outfit.", item, "blocking"));
        suggestedFixes.push("Replace the sleeveless top with a polo, button-down, knit, or clean fitted tee under a structured layer.");
      }
    }
    if (roleForItem(item) === "bottom" && isLoungeBottom(item.raw)) {
      score -= 28;
      blockingIssues.push(issue("office_lounge_bottom", "Drawstring, jogger, sweatpant, or lounge bottoms are too casual for office.", item, "blocking"));
      suggestedFixes.push("Swap lounge bottoms for trousers, chinos, or clean dark denim if the office is casual.");
    }
    if (roleForItem(item) === "footwear" && isSlidesOrFlipFlops(item)) {
      score -= 30;
      blockingIssues.push(issue("office_slides", "Slides and flip-flops are not office-ready footwear.", item, "blocking"));
      suggestedFixes.push("Use loafers, boots, dress shoes, or clean minimal sneakers.");
    }
    if (isGymOrAthletic(item) && !has(item.text, /\b(clean sneaker|minimal sneaker|plain sneaker)\b/)) {
      score -= 24;
      blockingIssues.push(issue("office_gymwear", "Gymwear and overt athletic pieces do not fit a normal office outfit.", item, "blocking"));
      suggestedFixes.push("Replace gymwear with smart casual closet pieces.");
    }
    if (roleForItem(item) === "accessory" && isCapOrHat(item.raw)) {
      if (relaxedOffice || creativeOffice) {
        score -= 7;
        warnings.push(issue("office_headwear_relaxed", "Headwear makes the office look more casual.", item, "warning"));
      } else {
        score -= 14;
        blockingIssues.push(issue("office_headwear", "Caps and beanies make a normal office outfit read too casual.", item, "blocking"));
        suggestedFixes.push("Remove the cap or use a quieter accessory like a watch or belt.");
      }
    }
    if (isLoudPartyOrStreetwear(item)) {
      score -= creativeOffice ? 7 : 12;
      warnings.push(issue("office_loud_piece", "Loud party or streetwear pieces can pull the outfit away from smart casual.", item, "warning"));
      if (!creativeOffice) suggestedFixes.push("Use cleaner, quieter pieces for a standard office outfit.");
    }
  }

  const teeWithoutLayer = topItems.some((item) => isCleanBaseLayer(item.raw) && has(item.text, /\b(tee|t shirt|tshirt)\b/)) && !hasStructuredOuterwear;
  const otherwiseCasual =
    teeWithoutLayer ||
    !hasOfficeTop ||
    !hasOfficeBottom ||
    !hasOfficeShoes ||
    footwearItems.some((item) => item.category === "sneaker" && !isOfficeFootwear(item.raw));

  if (teeWithoutLayer && !relaxedOffice) {
    score -= 12;
    blockingIssues.push(issue("office_tee_needs_layer", "A tee needs a structured layer to read office-ready.", topItems.find((item) => isCleanBaseLayer(item.raw)) ?? null, "blocking"));
    suggestedFixes.push("Layer the tee with an overshirt, blazer, cardigan, or structured jacket.");
  } else if (otherwiseCasual && !hasStructuredOuterwear && !relaxedOffice) {
    score -= 9;
    warnings.push(issue("office_missing_structure", "The outfit needs more structure to feel office-ready.", null, "warning"));
    suggestedFixes.push("Add an overshirt, blazer, cardigan, or structured jacket.");
  }

  if (!hasOfficeBottom) {
    score -= 10;
    warnings.push(issue("office_bottom_not_polished", "The bottom does not read business casual.", bottomItems[0] ?? null, "warning"));
  }
  if (!hasOfficeShoes) {
    score -= 9;
    warnings.push(issue("office_footwear_not_polished", "The footwear is not polished enough for office.", footwearItems[0] ?? null, "warning"));
  }

  const threshold = relaxedOffice || creativeOffice ? 62 : 70;
  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: finalScore,
    blockingIssues,
    warnings,
    positiveSignals: unique(positiveSignals),
    suggestedFixes: unique(suggestedFixes),
    shouldRegenerate: blockingIssues.length > 0 || finalScore < threshold,
    occasion: occasion ?? "business_casual",
  };
}

export function getOutfitCriticFeedback(params: AuraOutfitCriticParams): AuraOutfitCriticFeedback {
  return scoreOutfitForOccasion(params);
}

export function shouldRegenerateOutfit(params: AuraOutfitCriticParams): boolean {
  return scoreOutfitForOccasion(params).shouldRegenerate;
}
