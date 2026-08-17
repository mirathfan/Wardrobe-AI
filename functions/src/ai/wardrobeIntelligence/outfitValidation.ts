import type {
  GeneratedOutfit,
  NormalizedOutfitGenerationInput,
  OutfitCandidate,
  OutfitGenerationContext,
  OutfitRole,
  OutfitScoreBreakdown,
  OutfitValidationResult,
  OutfitValidationWarning,
  ValidatedOutfit,
} from "./outfitTypes";
import { isSafeOuterwearAsTop, normalizeOutfitRoleAlias } from "./outfitRole";

function normalizedText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clamp01(value: unknown, fallback = 0.5): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Number(Math.max(0, Math.min(1, parsed)).toFixed(3));
}

function allCandidates(context: OutfitGenerationContext): OutfitCandidate[] {
  return [
    ...context.candidates.top,
    ...context.candidates.bottom,
    ...context.candidates.footwear,
    ...context.candidates.outerwear,
    ...context.candidates.accessory,
    ...context.candidates.one_piece,
  ];
}

export function candidateMap(context: OutfitGenerationContext): Map<string, OutfitCandidate> {
  return new Map(allCandidates(context).map((candidate) => [candidate.itemId, candidate]));
}

function candidateText(candidate: OutfitCandidate | undefined): string {
  if (!candidate) return "";
  return normalizedText([
    candidate.name,
    candidate.category,
    candidate.subcategory,
    candidate.brand,
    candidate.colors.join(" "),
    candidate.aiMetadata.category,
    candidate.aiMetadata.subcategory,
    candidate.aiMetadata.material,
    Array.isArray(candidate.aiMetadata.styleTags) ? candidate.aiMetadata.styleTags.join(" ") : "",
    Array.isArray(candidate.aiMetadata.occasionTags) ? candidate.aiMetadata.occasionTags.join(" ") : "",
  ].filter(Boolean).join(" "));
}

function rawFormality(candidate: OutfitCandidate): number | null {
  const parsed = Number(candidate.aiMetadata.formality);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(5, parsed)) : null;
}

function itemRole(candidate: OutfitCandidate): OutfitRole {
  return candidate.allowedRole ?? candidate.canonicalRole ?? candidate.role;
}

function roundScore(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(3));
}

function roundFormality(value: number): number {
  return Number(Math.max(1, Math.min(5, value)).toFixed(1));
}

export function getEffectiveFormality(candidate: OutfitCandidate): number {
  const text = candidateText(candidate);
  const role = itemRole(candidate);
  const raw = rawFormality(candidate);

  if (role === "footwear") {
    if (/\b(loafer|loafers|penny loafer|penny loafers|derby|derbies|oxford shoe|oxford shoes|dress shoe|dress shoes|formal shoe|formal shoes)\b/.test(text)) {
      return 4;
    }
    if (/\b(clean|minimal|plain|leather|patent leather|white|black)\b/.test(text) && /\b(sneaker|sneakers|shoes?)\b/.test(text)) {
      return 3;
    }
    if (/\b(running|gym|athletic|training|sporty|sandal|sandals|slide|slides)\b/.test(text)) {
      return 1;
    }
    if (/\b(statement|loud|multicolor|multi color|graphic|streetwear)\b/.test(text) && /\b(sneaker|sneakers|shoes?)\b/.test(text)) {
      return 2;
    }
    if (/\b(sneaker|sneakers|air force|air max)\b/.test(text)) return 2.5;
  }

  if (role === "bottom") {
    if (/\b(trousers|tailored pants|tailored trousers|chinos|straight trousers|textured trousers)\b/.test(text)) return 3;
    if (/\b(clean dark jeans|black straight jeans|dark jeans|dark denim)\b/.test(text)) return 2.5;
    if (/\b(distressed|lounge|sweatpants|track pants|trackpants|shorts|graphic pants)\b/.test(text)) return 1.5;
    if (/\b(jeans|denim)\b/.test(text)) return 2;
  }

  if (role === "top") {
    if (/\b(button shirt|button down|button-down|oxford shirt|linen shirt|camp collar shirt|utility shirt|resort shirt|polo|knit polo)\b/.test(text)) return 3;
    if (/\b(clean|minimal|plain|solid)\b/.test(text) && /\b(t shirt|tshirt|tee)\b/.test(text)) return 2;
    if (/\b(graphic tee|graphic t shirt|graphic tshirt|football shirt|jersey|tank|tank top|vest top|sleeveless|oversized graphic)\b/.test(text)) return 1;
    if (/\b(shirt|blouse|sweater)\b/.test(text)) return 2.5;
  }

  if (role === "outerwear") {
    if (/\b(blazer|tailored jacket|formal jacket)\b/.test(text)) return 4;
    if (/\b(leather jacket|racer jacket|clean overshirt|structured jacket|structured layer|shirt jacket|shirt-jacket|shacket)\b/.test(text)) return 3;
    if (/\b(puffer|casual jacket|bomber|hooded jacket)\b/.test(text)) return 2;
    if (/\b(loud|statement|graphic|streetwear)\b/.test(text)) return 2;
  }

  if (role === "accessory") {
    if (/\b(leather belt|belt|watch)\b/.test(text)) return 3;
    if (/\b(sunglasses|cap|hat)\b/.test(text)) return 2;
  }

  if (role === "one_piece") {
    if (/\b(tailored|dress|jumpsuit|suit set)\b/.test(text)) return 3;
    if (/\b(romper|casual|beach|lounge)\b/.test(text)) return 2;
  }

  if (raw !== null) return roundFormality(raw);
  if (role === "accessory") return 2;
  if (role === "outerwear") return 2.5;
  return 2;
}

export function getTargetFormality(intent: {
  formality?: string;
  query?: string;
  occasion?: string;
  weather?: string;
  styleHints?: string[];
}): number {
  const [min, max] = getTargetFormalityRange(intent);
  return Number(((min + max) / 2).toFixed(2));
}

export function getTargetFormalityRange(
  intent: {
    formality?: string;
    query?: string;
    occasion?: string;
    weather?: string;
    styleHints?: string[];
  },
  items: OutfitCandidate[] = [],
): [number, number] {
  const text = normalizedText([
    intent.query,
    intent.occasion,
    intent.weather,
    intent.formality,
    ...(intent.styleHints ?? []),
  ].filter(Boolean).join(" "));
  const itemText = normalizedText(items.map(candidateText).join(" "));
  const combined = `${text} ${itemText}`;
  if (/\b(beach|pool)\b/.test(text) && !/\b(dinner|restaurant|resort|elevated)\b/.test(text)) return [1, 2];
  if (/\b(summer dinner|vacation dinner|resort dinner|dinner)\b/.test(text) && /\b(summer|vacation|resort|linen|beach)\b/.test(text)) {
    return [2.5, 3.5];
  }
  if (
    /\b(summer casual|vacation|resort|linen|breezy|travel)\b/.test(text) ||
    (/\blinen\b/.test(itemText) && /\b(trousers|loafer|loafers|clean sneakers|leather sneakers)\b/.test(itemText))
  ) {
    if (/\b(loafer|loafers|linen trousers|resort|elevated|watch)\b/.test(combined)) return [2, 3.2];
    return [1.5, 2.5];
  }
  if (/\b(formal|business|interview|corporate)\b/.test(text)) return [3.5, 4.5];
  if (/\b(date|dinner|night out|restaurant|evening)\b/.test(text)) return [2.5, 3.5];
  if (/\b(office|work|professional|meeting|smart casual|smart_casual)\b/.test(text)) return [2.5, 3.5];
  if (/\b(streetwear|street|casual)\b/.test(text)) return [1, 2.25];
  return [2, 3];
}

function formalityFitForRange(values: number[], range: [number, number]): { score: number; reason: string } {
  if (!values.length) return { score: 0.75, reason: "no item formality signals" };
  const scores = values.map((value) => {
    if (value >= range[0] && value <= range[1]) return 1;
    const distance = value < range[0] ? range[0] - value : value - range[1];
    return Math.max(0.2, 1 - distance / 2.5);
  });
  const averageScore = average(scores);
  const tooLow = values.filter((value) => value < range[0]).length;
  const tooHigh = values.filter((value) => value > range[1]).length;
  const reason = tooHigh > tooLow
    ? "some items are above target formality range"
    : tooLow > tooHigh
      ? "some items are below target formality range"
      : "items fit target formality range";
  return { score: averageScore, reason };
}

function occasionKeyForBias(input: NormalizedOutfitGenerationInput, context: OutfitGenerationContext): string {
  const text = normalizedText(input.occasion ?? context.retrievalPlan.intent.occasion ?? input.query);
  if (/\b(office|work|business|professional|meeting|interview)\b/.test(text)) return "office";
  if (/\b(date night|date)\b/.test(text)) return "date_night";
  if (/\b(dinner|restaurant|evening)\b/.test(text)) return "dinner";
  if (/\b(streetwear|street)\b/.test(text)) return "streetwear";
  if (/\b(vacation|resort|summer|beach|travel)\b/.test(text)) return "vacation";
  if (/\b(casual|errands|everyday)\b/.test(text)) return "casual";
  return text || "general";
}

function applyFormalityBias(range: [number, number], input: NormalizedOutfitGenerationInput, context: OutfitGenerationContext): {
  range: [number, number];
  bias: number;
  reason: string;
} {
  const biases = context.styleMemory?.profileSignals.formalityBiasByOccasion ?? {};
  const occasion = occasionKeyForBias(input, context);
  const bias = Number(biases[occasion] ?? 0);
  if (!Number.isFinite(bias) || bias === 0) {
    return { range, bias: 0, reason: "no style memory formality bias applied" };
  }
  const adjustment = Math.max(-0.5, Math.min(0.5, bias * 0.25));
  return {
    range: [
      Number(Math.max(1, Math.min(5, range[0] + adjustment)).toFixed(2)),
      Number(Math.max(1, Math.min(5, range[1] + adjustment)).toFixed(2)),
    ],
    bias,
    reason: `${occasion} style memory formality bias ${bias > 0 ? "raised" : "lowered"} target range`,
  };
}

const COLOR_ALIASES: Record<string, string> = {
  grey: "gray",
  charcoal: "gray",
  "off white": "white",
  offwhite: "white",
  ivory: "cream",
  ecru: "cream",
  oatmeal: "cream",
  "dark brown": "brown",
  "light brown": "brown",
  camel: "tan",
  stone: "beige",
  khaki: "beige",
  denim: "blue",
  "dark denim": "blue",
  "light blue": "blue",
  "multi color": "multicolor",
  multi: "multicolor",
};

const COLOR_FAMILIES = [
  "black",
  "white",
  "gray",
  "cream",
  "beige",
  "tan",
  "brown",
  "navy",
  "blue",
  "green",
  "olive",
  "red",
  "orange",
  "yellow",
  "pink",
  "purple",
  "metallic",
  "multicolor",
] as const;

const NEUTRAL_COLORS = new Set(["black", "white", "gray", "cream", "beige", "tan", "brown", "navy", "olive"]);
const DARK_COLORS = new Set(["black", "navy", "brown", "gray"]);
const LIGHT_COLORS = new Set(["white", "cream", "beige", "tan", "blue"]);

function hexColorFamily(value: string): string | null {
  const hex = value.trim().toLowerCase();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!match) return null;
  const raw = match[1];
  const expanded = raw.length === 3
    ? raw.split("").map((part) => `${part}${part}`).join("")
    : raw;
  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  if (max <= 40) return "black";
  if (min >= 220) return "white";
  if (max - min <= 20) return "gray";
  if (blue > red && blue > green) return "blue";
  if (red > blue && green > blue && Math.abs(red - green) < 40) return "yellow";
  if (red > green && red > blue) return "red";
  if (green > red && green > blue) return "green";
  return null;
}

function normalizeColorFamilies(value: unknown): string[] {
  const text = normalizedText(value);
  if (!text) return [];
  const hex = hexColorFamily(text);
  if (hex) return [hex];
  const parts = text.split(/[/,&+]+|\band\b/).map((part) => part.trim()).filter(Boolean);
  const families: string[] = [];
  for (const part of parts.length ? parts : [text]) {
    const alias = COLOR_ALIASES[part] ?? part;
    const exact = COLOR_ALIASES[alias] ?? alias;
    if ((COLOR_FAMILIES as readonly string[]).includes(exact)) {
      families.push(exact);
      continue;
    }
    for (const family of COLOR_FAMILIES) {
      if (new RegExp(`\\b${family}\\b`).test(exact)) {
        families.push(COLOR_ALIASES[family] ?? family);
      }
    }
  }
  return [...new Set(families)];
}

function itemColorFamilies(candidate: OutfitCandidate): string[] {
  const fromColors = candidate.colors.flatMap(normalizeColorFamilies);
  if (fromColors.length) return [...new Set(fromColors)];
  return normalizeColorFamilies(candidate.name);
}

export function scoreColorCoherence(items: OutfitCandidate[]): { score: number; reasons: string[] } {
  const itemFamilies = items.map((item) => ({
    item,
    families: itemColorFamilies(item),
  }));
  const families = itemFamilies.flatMap((entry) => entry.families);
  const reasons: string[] = [];
  if (!families.length) {
    return { score: 0.6, reasons: ["no color metadata available"] };
  }

  const counts = new Map<string, number>();
  families.forEach((family) => counts.set(family, (counts.get(family) ?? 0) + 1));
  const uniqueFamilies = [...counts.keys()];
  const neutralCount = families.filter((family) => NEUTRAL_COLORS.has(family)).length;
  const neutralRatio = neutralCount / families.length;
  const repeatedAnchors = uniqueFamilies.filter((family) => (counts.get(family) ?? 0) >= 2);
  const brightFamilies = uniqueFamilies.filter((family) => !NEUTRAL_COLORS.has(family) && family !== "blue");
  const multicolorCount = families.filter((family) => family === "multicolor").length;

  let score = 0.58;
  if (neutralRatio >= 0.75) {
    score += 0.18;
    reasons.push("neutrals dominate");
  } else if (neutralRatio >= 0.5) {
    score += 0.1;
    reasons.push("balanced by neutrals");
  }
  if (repeatedAnchors.length) {
    score += 0.12;
    reasons.push(`repeated color anchor: ${repeatedAnchors.slice(0, 2).join(", ")}`);
  }

  const footwearColors = itemFamilies
    .filter(({ item }) => itemRole(item) === "footwear")
    .flatMap((entry) => entry.families);
  const beltColors = itemFamilies
    .filter(({ item }) => itemRole(item) === "accessory" && /\bbelt\b/.test(candidateText(item)))
    .flatMap((entry) => entry.families);
  if (footwearColors.some((color) => beltColors.includes(color))) {
    score += 0.08;
    reasons.push("shoes and belt coordinate");
  }

  const topColors = itemFamilies
    .filter(({ item }) => itemRole(item) === "top" || itemRole(item) === "one_piece")
    .flatMap((entry) => entry.families);
  const lowerColors = itemFamilies
    .filter(({ item }) => itemRole(item) === "bottom" || itemRole(item) === "footwear")
    .flatMap((entry) => entry.families);
  if (topColors.some((color) => LIGHT_COLORS.has(color)) && lowerColors.some((color) => DARK_COLORS.has(color))) {
    score += 0.1;
    reasons.push("light top balances dark lower half");
  }
  if (brightFamilies.length <= 1 && neutralRatio >= 0.5) {
    score += 0.06;
    reasons.push("single statement color is grounded");
  }
  if (uniqueFamilies.length <= 3) {
    score += 0.06;
    reasons.push("compact palette");
  } else if (uniqueFamilies.length >= 6) {
    score -= 0.18;
    reasons.push("too many unrelated colors");
  }
  if (brightFamilies.length >= 3 || multicolorCount >= 2) {
    score -= 0.22;
    reasons.push("multiple statement colors compete");
  }

  return {
    score: roundScore(score),
    reasons: reasons.length ? reasons : ["acceptable palette"],
  };
}

export function scoreOutfitDiversity(
  outfit: GeneratedOutfit,
  previouslySelectedOutfits: GeneratedOutfit[],
  context: OutfitGenerationContext,
): { score: number; penalties: string[] } {
  if (!previouslySelectedOutfits.length) return { score: 1, penalties: [] };
  const penalties: string[] = [];
  let penalty = 0;
  const candidateCounts = context.diagnostics.candidateCounts;
  const previousItems = previouslySelectedOutfits.flatMap((entry) => entry.items);

  for (const item of outfit.items) {
    const repeatCount = previousItems.filter((previous) => previous.itemId === item.itemId).length;
    if (!repeatCount) continue;
    const available = candidateCounts[item.role] ?? context.candidates[item.role]?.length ?? 0;
    if (item.role === "top") {
      const nextPenalty = available <= 1 ? 0.04 : 0.18;
      penalty += nextPenalty * repeatCount;
      penalties.push(`reused top ${item.itemId}`);
    } else if (item.role === "bottom") {
      const nextPenalty = available <= 1 ? 0.03 : 0.14;
      penalty += nextPenalty * repeatCount;
      penalties.push(`reused bottom ${item.itemId}`);
    } else if (item.role === "footwear") {
      const nextPenalty = available <= 1 ? 0.03 : 0.1;
      penalty += nextPenalty * repeatCount;
      penalties.push(available <= 1 ? `reused only viable footwear ${item.itemId}` : `reused footwear ${item.itemId}`);
    } else if (item.role === "accessory") {
      const nextPenalty = available <= 1 ? 0.01 : 0.04;
      penalty += nextPenalty * repeatCount;
      penalties.push(`reused accessory ${item.itemId}`);
    } else {
      const nextPenalty = available <= 1 ? 0.02 : 0.08;
      penalty += nextPenalty * repeatCount;
      penalties.push(`reused ${item.role} ${item.itemId}`);
    }
  }

  const coreSignature = (entry: GeneratedOutfit) => entry.items
    .filter((item) => item.role === "top" || item.role === "bottom" || item.role === "footwear" || item.role === "one_piece")
    .map((item) => `${item.role}:${item.itemId}`)
    .sort()
    .join("|");
  const signature = coreSignature(outfit);
  if (signature && previouslySelectedOutfits.some((entry) => coreSignature(entry) === signature)) {
    const hasAlternatives =
      (candidateCounts.top ?? 0) > 1 ||
      (candidateCounts.bottom ?? 0) > 1 ||
      (candidateCounts.footwear ?? 0) > 1 ||
      (candidateCounts.one_piece ?? 0) > 1;
    if (hasAlternatives) {
      penalty += 0.22;
      penalties.push("repeated core outfit with only small changes");
    }
  }

  return {
    score: roundScore(Math.max(0.35, 1 - penalty)),
    penalties,
  };
}

function isOfficeLike(input: NormalizedOutfitGenerationInput): boolean {
  return /\b(office|work|interview|business|professional|meeting|corporate|workwear)\b/.test(
    normalizedText([input.query, input.occasion].filter(Boolean).join(" ")),
  );
}

function isStreetwearRequest(input: NormalizedOutfitGenerationInput): boolean {
  return /\b(streetwear|street|sneaker|athletic|gym)\b/.test(normalizedText(input.query));
}

function hasRole(outfit: GeneratedOutfit, role: OutfitRole): boolean {
  return outfit.items.some((item) => item.role === role);
}

function hasOuterLayer(outfit: GeneratedOutfit): boolean {
  return hasRole(outfit, "outerwear");
}

function roleSet(outfit: GeneratedOutfit): Set<OutfitRole> {
  return new Set(outfit.items.map((item) => item.role));
}

function candidateAllowedRole(candidate: OutfitCandidate | undefined): OutfitRole | null {
  return candidate?.allowedRole ?? candidate?.canonicalRole ?? candidate?.role ?? null;
}

function normalizeGeneratedOutfitRoles(
  outfit: GeneratedOutfit,
  context: OutfitGenerationContext,
  outfitIndex: number,
): {
  outfit: GeneratedOutfit;
  errors: string[];
  warnings: OutfitValidationWarning[];
} {
  const byId = candidateMap(context);
  const errors: string[] = [];
  const warnings: OutfitValidationWarning[] = [];
  const normalizedItems = outfit.items.map((item) => {
    const candidate = byId.get(item.itemId);
    if (!candidate) return item;
    const allowedRole = candidateAllowedRole(candidate);
    const generatedRole = normalizeOutfitRoleAlias(item.role);
    if (!allowedRole || generatedRole === allowedRole) {
      return { ...item, role: allowedRole ?? item.role };
    }
    if (allowedRole === "outerwear" && generatedRole === "top" && isSafeOuterwearAsTop(candidate)) {
      warnings.push({
        outfitIndex,
        issue: `itemId ${item.itemId} used as top because it is a shirt-jacket/overshirt layer.`,
        action: "warning",
      });
      return item;
    }
    if (allowedRole !== "one_piece") {
      warnings.push({
        outfitIndex,
        issue: `itemId ${item.itemId} role auto-corrected from ${item.role} to ${allowedRole}.`,
        action: "auto_corrected_role",
      });
      return { ...item, role: allowedRole };
    }
    errors.push(`outfit ${outfitIndex + 1}: itemId ${item.itemId} was used as ${item.role} but allowedRole is ${allowedRole}.`);
    return item;
  });
  return {
    outfit: {
      ...outfit,
      items: normalizedItems,
    },
    errors,
    warnings,
  };
}

function isOfficeWeakTop(candidate: OutfitCandidate | undefined): boolean {
  return /\b(tank|tank top|vest top|sleeveless|graphic tee|graphic t shirt|graphic tshirt|loud graphic|gym top|athletic top)\b/.test(candidateText(candidate));
}

function isOfficeWeakFootwear(candidate: OutfitCandidate | undefined): boolean {
  return /\b(sandal|sandals|slide|slides|running shoe|running shoes|gym shoe|gym shoes|athletic shoe|athletic shoes|training shoe|training shoes|loud sneaker|loud sneakers)\b/.test(candidateText(candidate));
}

function isRainBadCandidate(candidate: OutfitCandidate | undefined): boolean {
  return /\b(sandal|sandals|slide|slides|suede)\b/.test(candidateText(candidate));
}

function avoidTermMatches(candidate: OutfitCandidate | undefined, avoidTerms: string[]): string[] {
  const text = candidateText(candidate);
  if (!text || !avoidTerms.length) return [];
  return avoidTerms.filter((term) => {
    const normalized = normalizedText(term);
    if (!normalized) return false;
    const singular = normalized.replace(/s$/, "");
    return text.includes(normalized) || (singular.length > 2 && text.includes(singular));
  });
}

export function validateGeneratedOutfits(
  outfits: GeneratedOutfit[],
  context: OutfitGenerationContext,
  input: NormalizedOutfitGenerationInput,
): OutfitValidationResult {
  const byId = candidateMap(context);
  const errors: string[] = [];
  const warnings: string[] = [];
  const validationWarnings: OutfitValidationWarning[] = [];
  const normalizedOutfits: GeneratedOutfit[] = [];

  if (!Array.isArray(outfits) || outfits.length === 0) {
    errors.push("No outfits were generated.");
    return {
      valid: false,
      errors,
      warnings,
      normalizedOutfits: [],
      validationWarnings,
    };
  }

  outfits.forEach((rawOutfit, outfitIndex) => {
    const normalized = normalizeGeneratedOutfitRoles(rawOutfit, context, outfitIndex);
    const outfit = normalized.outfit;
    normalizedOutfits.push(outfit);
    errors.push(...normalized.errors);
    validationWarnings.push(...normalized.warnings);
    const prefix = `outfit ${outfitIndex + 1}`;
    const seen = new Set<string>();
    const requiredIds = new Set(input.requiredItemIds);
    const avoidIds = new Set(input.avoidItemIds);
    const roles = roleSet(outfit);
    const hasTopBottomFootwear = roles.has("top") && roles.has("bottom") && roles.has("footwear");
    const hasOnePieceFootwear = roles.has("one_piece") && roles.has("footwear");

    if (!hasTopBottomFootwear && !hasOnePieceFootwear) {
      errors.push(`${prefix}: outfit must include top + bottom + footwear or one_piece + footwear.`);
    }

    for (const item of outfit.items) {
      if (!byId.has(item.itemId)) {
        errors.push(`${prefix}: hallucinated itemId ${item.itemId}.`);
        continue;
      }
      if (seen.has(item.itemId)) {
        errors.push(`${prefix}: duplicate itemId ${item.itemId}.`);
      }
      seen.add(item.itemId);
      const candidate = byId.get(item.itemId);
      if (avoidIds.has(item.itemId)) {
        errors.push(`${prefix}: used explicitly avoided itemId ${item.itemId}.`);
      }
      const matchedAvoidTerms = avoidTermMatches(candidate, input.avoidTerms);
      if (matchedAvoidTerms.length) {
        errors.push(`${prefix}: itemId ${item.itemId} matched avoided term ${matchedAvoidTerms[0]}.`);
      }
      const allowedRole = candidateAllowedRole(candidate);
      const generatedRole = normalizeOutfitRoleAlias(item.role);
      if (candidate && allowedRole && generatedRole !== allowedRole) {
        if (!(allowedRole === "outerwear" && generatedRole === "top" && isSafeOuterwearAsTop(candidate))) {
          errors.push(`${prefix}: itemId ${item.itemId} was used as ${item.role} but allowedRole is ${allowedRole}.`);
        }
      }
      if (isOfficeLike(input)) {
        if (generatedRole === "top" && isOfficeWeakTop(candidate) && !hasOuterLayer(outfit)) {
          errors.push(`${prefix}: office outfit uses weak top ${item.itemId} without an outerwear layer.`);
        }
        if (generatedRole === "footwear" && isOfficeWeakFootwear(candidate) && !isStreetwearRequest(input)) {
          errors.push(`${prefix}: office outfit uses weak footwear ${item.itemId}.`);
        }
      }
      if (normalizedText(input.weather ?? context.retrievalPlan.intent.weather).includes("rain") && isRainBadCandidate(candidate)) {
        const issue = `${prefix}: rain context may conflict with ${item.itemId}.`;
        warnings.push(issue);
        validationWarnings.push({ outfitIndex, issue, action: "warning" });
      }
    }

    for (const requiredItemId of requiredIds) {
      if (!seen.has(requiredItemId)) {
        errors.push(`${prefix}: missing required selected itemId ${requiredItemId}.`);
      }
    }

    if (Number.isFinite(Number(outfit.confidence)) && (Number(outfit.confidence) < 0 || Number(outfit.confidence) > 1)) {
      const issue = `${prefix}: confidence was outside 0..1 and will be clamped.`;
      warnings.push(issue);
      validationWarnings.push({ outfitIndex, issue, action: "warning" });
    }
    if ((outfit.stylingTips ?? []).length > 5) {
      const issue = `${prefix}: styling tips will be trimmed to 5.`;
      warnings.push(issue);
      validationWarnings.push({ outfitIndex, issue, action: "warning" });
    }
    if ((outfit.missingItems ?? []).length > 5) {
      const issue = `${prefix}: missing items will be trimmed to 5.`;
      warnings.push(issue);
      validationWarnings.push({ outfitIndex, issue, action: "warning" });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalizedOutfits,
    validationWarnings,
  };
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function signalWeight(signals: { value: string; weight: number }[], values: string[]): number {
  const normalizedValues = new Set(values.map(normalizedText).filter(Boolean));
  return signals.reduce((sum, signal) => {
    const value = normalizedText(signal.value);
    return normalizedValues.has(value) ? sum + Number(signal.weight || 0) : sum;
  }, 0);
}

function matchedSignals(signals: { value: string; weight: number }[], values: string[]): { value: string; weight: number }[] {
  const normalizedValues = new Set(values.map(normalizedText).filter(Boolean));
  return signals.filter((signal) => normalizedValues.has(normalizedText(signal.value)));
}

function entityStrings(memory: { entities?: Record<string, unknown> }, key: string): string[] {
  const value = memory.entities?.[key];
  return Array.isArray(value) ? value.map(normalizedText).filter(Boolean) : [];
}

const GENERIC_AVOIDED_CATEGORIES = new Set(["top", "bottom", "footwear", "accessory", "one piece", "one_piece"]);
const GENERIC_MEMORY_SIGNALS = new Set([
  "top",
  "bottom",
  "footwear",
  "accessory",
  "one piece",
  "one_piece",
  "black",
  "white",
  "blue",
  "gray",
  "grey",
  "beige",
  "brown",
  "navy",
  "cotton",
  "denim",
  "leather",
  "polyester",
  "unknown",
  "casual",
  "classic",
  "minimal",
  "solid",
  "travel",
  "work",
  "formal",
  "smart casual",
  "streetwear",
]);

function nonGenericCategorySignals(signals: { value: string; weight: number }[]): { value: string; weight: number }[] {
  return signals.filter((signal) => !GENERIC_AVOIDED_CATEGORIES.has(normalizedText(signal.value)));
}

function distinctiveMemorySignals(values: string[]): string[] {
  return [...new Set(values.map(normalizedText).filter(Boolean))]
    .filter((value) => !GENERIC_MEMORY_SIGNALS.has(value));
}

function pushSignalReasons(args: {
  target: string[];
  candidateName: string;
  prefix: string;
  label: string;
  matches: { value: string; weight: number }[];
}) {
  for (const match of args.matches.slice(0, 2)) {
    if (args.target.length >= 10) return;
    args.target.push(`${args.candidateName}: ${args.prefix} ${args.label} ${match.value}`);
  }
}

function scoreStylePreferenceFit(
  candidates: OutfitCandidate[],
  context: OutfitGenerationContext,
  input: NormalizedOutfitGenerationInput,
): { score: number; reasons: string[]; boosts: string[]; penalties: string[] } {
  const memory = context.styleMemory;
  if (!memory) {
    return {
      score: 0.75,
      reasons: ["style memory not applied"],
      boosts: [],
      penalties: [],
    };
  }
  const boosts: string[] = [];
  const penalties: string[] = [];
  let boostScore = 0;
  let penaltyScore = 0;
  const explicitColors = new Set([...input.preferredColors, ...input.requiredColors].map(normalizedText));
  const explicitCategories = new Set(input.requiredCategories.map(normalizedText));
  const itemIds = candidates.map((candidate) => candidate.itemId);
  const outfitText = normalizedText(candidates.map(candidateText).join(" "));
  const itemNamesById = new Map(candidates.map((candidate) => [candidate.itemId, candidate.name]));

  for (const candidate of candidates) {
    const metadata = candidate.aiMetadata;
    const colors = candidate.colors.map(normalizedText);
    const styleTags = Array.isArray(metadata.styleTags) ? metadata.styleTags.map(normalizedText) : [];
    const fits = [metadata.fit, candidate.aiMetadata.fit].map(normalizedText).filter(Boolean);
    const brands = [candidate.brand].map(normalizedText).filter(Boolean);
    const categories = [candidate.allowedRole, candidate.canonicalRole, candidate.category].map(normalizedText).filter(Boolean);
    const materials = [metadata.material].map(normalizedText).filter(Boolean);

    const exactAffinityMatches = matchedSignals(memory.profileSignals.itemAffinities, [candidate.itemId]);
    const preferredColorMatches = matchedSignals(memory.profileSignals.preferredColors, colors);
    const preferredStyleMatches = matchedSignals(memory.profileSignals.preferredStyleTags, styleTags);
    const preferredFitMatches = matchedSignals(memory.profileSignals.preferredFits, fits);
    const preferredBrandMatches = matchedSignals(memory.profileSignals.preferredBrands, brands);
    const preferredCategoryMatches = matchedSignals(memory.profileSignals.preferredCategories, categories);
    const preferredMaterialMatches = matchedSignals(memory.profileSignals.preferredMaterials, materials);
    const preferred =
      signalWeight(preferredColorMatches, colors) +
      signalWeight(preferredStyleMatches, styleTags) +
      signalWeight(preferredFitMatches, fits) +
      signalWeight(preferredBrandMatches, brands) +
      signalWeight(preferredCategoryMatches, categories) +
      signalWeight(preferredMaterialMatches, materials) +
      signalWeight(exactAffinityMatches, [candidate.itemId]);
    if (preferred > 0) {
      boostScore += preferred;
      if (exactAffinityMatches.length) boosts.push(`matched liked item: ${candidate.name}`);
      pushSignalReasons({ target: boosts, candidateName: candidate.name, prefix: "preferred", label: "color", matches: preferredColorMatches });
      pushSignalReasons({ target: boosts, candidateName: candidate.name, prefix: "preferred", label: "style", matches: preferredStyleMatches });
      pushSignalReasons({ target: boosts, candidateName: candidate.name, prefix: "preferred", label: "fit", matches: preferredFitMatches });
      pushSignalReasons({ target: boosts, candidateName: candidate.name, prefix: "preferred", label: "brand", matches: preferredBrandMatches });
      pushSignalReasons({ target: boosts, candidateName: candidate.name, prefix: "preferred", label: "category", matches: preferredCategoryMatches });
      pushSignalReasons({ target: boosts, candidateName: candidate.name, prefix: "preferred", label: "material", matches: preferredMaterialMatches });
    }

    const exactAvoidMatches = matchedSignals(memory.profileSignals.avoidedItemIds ?? [], [candidate.itemId]);
    const avoidColorMatches = [...explicitColors].some((color) => colors.includes(color))
      ? []
      : matchedSignals(memory.profileSignals.avoidedColors, colors);
    const avoidCategoryMatches = [...explicitCategories].some((category) => categories.includes(category))
      ? []
      : matchedSignals(nonGenericCategorySignals(memory.profileSignals.avoidedCategories), categories);
    const avoidStyleMatches = matchedSignals(memory.profileSignals.avoidedStyleTags, styleTags);
    const avoidFitMatches = matchedSignals(memory.profileSignals.avoidedFits, fits);
    const avoidBrandMatches = matchedSignals(memory.profileSignals.avoidedBrands, brands);
    const avoidMaterialMatches = matchedSignals(memory.profileSignals.avoidedMaterials, materials);
    const avoided =
      signalWeight(avoidColorMatches, colors) +
      signalWeight(avoidStyleMatches, styleTags) +
      signalWeight(avoidFitMatches, fits) +
      signalWeight(avoidBrandMatches, brands) +
      signalWeight(avoidCategoryMatches, categories) +
      signalWeight(avoidMaterialMatches, materials) +
      signalWeight(exactAvoidMatches, [candidate.itemId]);
    if (avoided > 0) {
      penaltyScore += avoided;
      if (exactAvoidMatches.length) penalties.push(`matched avoided item: ${candidate.name}`);
      pushSignalReasons({ target: penalties, candidateName: candidate.name, prefix: "avoided", label: "color", matches: avoidColorMatches });
      pushSignalReasons({ target: penalties, candidateName: candidate.name, prefix: "avoided", label: "style", matches: avoidStyleMatches });
      pushSignalReasons({ target: penalties, candidateName: candidate.name, prefix: "avoided", label: "fit", matches: avoidFitMatches });
      pushSignalReasons({ target: penalties, candidateName: candidate.name, prefix: "avoided", label: "brand", matches: avoidBrandMatches });
      pushSignalReasons({ target: penalties, candidateName: candidate.name, prefix: "avoided", label: "category", matches: avoidCategoryMatches });
      pushSignalReasons({ target: penalties, candidateName: candidate.name, prefix: "avoided", label: "material", matches: avoidMaterialMatches });
    }
  }

  for (const positiveMemory of memory.positiveMemories) {
    const likedIds = entityStrings(positiveMemory, "itemIds");
    const exactMatches = likedIds.filter((itemId) => itemIds.includes(itemId));
    if (exactMatches.length) {
      const compatibility = Math.max(0.5, Number(positiveMemory.occasionCompatibility ?? 1));
      boostScore += exactMatches.length * 2.5 * compatibility;
      for (const itemId of exactMatches.slice(0, 3)) {
        boosts.push(`matched liked item: ${itemNamesById.get(itemId) ?? itemId}`);
      }
    }
  }

  for (const negativeMemory of memory.negativeMemories) {
    const avoidedIds = entityStrings(negativeMemory, "itemIds");
    const exactMatches = avoidedIds.filter((itemId) => itemIds.includes(itemId));
    if (exactMatches.length) {
      const compatibility = Math.max(0.5, Number(negativeMemory.occasionCompatibility ?? 1));
      penaltyScore += exactMatches.length * 4 * compatibility;
      penalties.push(...exactMatches.map((itemId) => `matched avoided item: ${itemNamesById.get(itemId) ?? itemId}`));
      continue;
    }
    const distinctiveSignals = distinctiveMemorySignals([
      ...entityStrings(negativeMemory, "styleTags"),
      ...entityStrings(negativeMemory, "subcategories"),
      ...entityStrings(negativeMemory, "colors"),
    ]).filter((value) => outfitText.includes(value));
    const compatibility = Number(negativeMemory.occasionCompatibility ?? 1);
    if (distinctiveSignals.length >= 2 && compatibility >= 0.5) {
      penaltyScore += 2.5 * Math.min(1, Math.max(0.5, compatibility));
      penalties.push(`similar to disliked outfit: ${distinctiveSignals.slice(0, 3).join(", ")}`);
    }
  }

  const score = roundScore(0.75 + Math.min(0.2, boostScore / 30) - Math.min(0.3, penaltyScore / 25));
  return {
    score,
    reasons: [
      boostScore > 0 ? "matched preferred style memory" : "no preferred memory matches",
      penaltyScore > 0 ? "matched avoided style memory" : "no avoided memory matches",
    ],
    boosts,
    penalties,
  };
}

export function scoreGeneratedOutfit(
  outfit: GeneratedOutfit,
  context: OutfitGenerationContext,
  input: NormalizedOutfitGenerationInput,
): OutfitScoreBreakdown {
  const byId = candidateMap(context);
  const roles = roleSet(outfit);
  const candidates = outfit.items.map((item) => byId.get(item.itemId)).filter((item): item is OutfitCandidate => Boolean(item));
  const penalties: string[] = [];
  const complete = (roles.has("top") && roles.has("bottom") && roles.has("footwear")) ||
    (roles.has("one_piece") && roles.has("footwear"));
  const categoryCompleteness = complete ? 1 : Math.min(0.75, roles.size / 3);
  const office = isOfficeLike(input);
  const formalityIntent = {
    formality: input.formality === "any" ? context.retrievalPlan.intent.formality : input.formality,
    query: input.query,
    occasion: input.occasion ?? context.retrievalPlan.intent.occasion,
    weather: input.weather ?? context.retrievalPlan.intent.weather,
    styleHints: context.retrievalPlan.intent.styleHints,
  };
  const targetFormalityBaseRange = getTargetFormalityRange(formalityIntent, candidates);
  const biasedFormality = applyFormalityBias(targetFormalityBaseRange, input, context);
  const targetFormalityRange = biasedFormality.range;
  const targetFormality = Number(((targetFormalityRange[0] + targetFormalityRange[1]) / 2).toFixed(2));
  const occasionText = normalizedText([
    input.query,
    input.occasion,
    context.retrievalPlan.intent.occasion,
    ...context.retrievalPlan.intent.styleHints,
  ].filter(Boolean).join(" "));
  const occasionFit = average(candidates.map((candidate) => {
    const text = candidateText(candidate);
    if (office) {
      if (/\b(office|work|smart casual|formal|business|professional)\b/.test(text)) return 1;
      if (getEffectiveFormality(candidate) >= 3) return 0.85;
      return 0.45;
    }
    if (/\b(date|dinner|night out|restaurant|evening)\b/.test(occasionText)) {
      if (/\b(date|dinner|night out|elevated|sleek|refined|leather|formal|smart casual)\b/.test(text)) return 1;
      if (getEffectiveFormality(candidate) >= 2.5) return 0.85;
      return 0.55;
    }
    return 0.75;
  }));
  const colorCoherenceResult = scoreColorCoherence(candidates);
  const colorCoherence = colorCoherenceResult.score;
  const itemEffectiveFormalities = candidates.map((candidate) => ({
    itemId: candidate.itemId,
    name: candidate.name,
    role: itemRole(candidate),
    rawFormality: rawFormality(candidate),
    effectiveFormality: getEffectiveFormality(candidate),
  }));
  const formalityFitResult = formalityFitForRange(
    itemEffectiveFormalities.map((entry) => entry.effectiveFormality),
    targetFormalityRange,
  );
  const formalityFit = formalityFitResult.score;
  const retrievalStrength = average(candidates.map((candidate) => Number(candidate.score ?? candidate.finalScore ?? candidate.vectorScore ?? 0)));
  const styleFit = scoreStylePreferenceFit(candidates, context, input);

  for (const item of outfit.items) {
    const candidate = byId.get(item.itemId);
    if (office && item.role === "top" && isOfficeWeakTop(candidate) && !hasOuterLayer(outfit)) {
      penalties.push("weak office top");
    }
    if (office && item.role === "footwear" && isOfficeWeakFootwear(candidate) && !isStreetwearRequest(input)) {
      penalties.push("weak office footwear");
    }
  }

  const total = Math.max(0, Math.min(1, (
    categoryCompleteness * 0.25 +
    occasionFit * 0.19 +
    colorCoherence * 0.12 +
    formalityFit * 0.17 +
    retrievalStrength * 0.15 +
    styleFit.score * 0.12 -
    penalties.length * 0.08
  )));

  return {
    categoryCompleteness: Number(categoryCompleteness.toFixed(3)),
    occasionFit: Number(occasionFit.toFixed(3)),
    colorCoherence: Number(colorCoherence.toFixed(3)),
    colorCoherenceReasons: colorCoherenceResult.reasons,
    formalityFit: Number(formalityFit.toFixed(3)),
    targetFormality,
    targetFormalityRange,
    formalityFitReason: formalityFitResult.reason,
    formalityBiasApplied: biasedFormality.bias,
    formalityBiasReason: biasedFormality.reason,
    itemEffectiveFormalities,
    retrievalStrength: Number(retrievalStrength.toFixed(3)),
    stylePreferenceFit: styleFit.score,
    styleMemoryReasons: styleFit.reasons,
    memoryBoosts: styleFit.boosts,
    memoryPenalties: styleFit.penalties,
    diversityScore: 1,
    diversityPenalties: [],
    penalties,
    total: Number(total.toFixed(3)),
  };
}

function fallbackFormality(value: unknown): "casual" | "smart_casual" | "formal" {
  const text = normalizedText(value);
  if (text === "casual" || text === "formal") return text;
  return "smart_casual";
}

export function buildValidatedOutfitResponse(
  outfits: GeneratedOutfit[],
  context: OutfitGenerationContext,
  input: NormalizedOutfitGenerationInput,
): ValidatedOutfit[] {
  const byId = candidateMap(context);
  const entries = outfits
    .map((outfit, index) => {
      const normalized = normalizeGeneratedOutfitRoles(outfit, context, index).outfit;
      const scoreBreakdown = scoreGeneratedOutfit(normalized, context, input);
      return {
        source: normalized,
        response: {
          outfitId: `outfit-${index + 1}`,
          title: String(normalized.title ?? "Closet Outfit").trim() || "Closet Outfit",
          vibe: String(normalized.vibe ?? "").trim() || "closet-based",
          occasion: String(normalized.occasion ?? input.occasion ?? context.retrievalPlan.intent.occasion ?? "outfit").trim(),
          formality: fallbackFormality(normalized.formality ?? context.retrievalPlan.intent.formality),
          items: normalized.items.flatMap((item) => {
            const candidate = byId.get(item.itemId);
            if (!candidate) return [];
            return [{
              itemId: item.itemId,
              role: item.role,
              name: candidate.name,
              category: candidate.category,
              canonicalRole: candidate.canonicalRole,
              allowedRole: candidate.allowedRole,
              ...(candidate.sourceRole ? { sourceRole: candidate.sourceRole } : {}),
              sourceCategory: candidate.sourceCategory ?? null,
              sourceAiMetadataCategory: candidate.sourceAiMetadataCategory ?? null,
              ...(candidate.subcategory ? { subcategory: candidate.subcategory } : {}),
              ...(candidate.brand ? { brand: candidate.brand } : {}),
              colors: candidate.colors,
              imageUrl: candidate.imageUrl,
              reason: String(item.reason ?? candidate.reason ?? "").trim() || candidate.reason,
              aiMetadata: candidate.aiMetadata,
              effectiveFormality: getEffectiveFormality(candidate),
            }];
          }),
          explanation: String(normalized.explanation ?? "").trim(),
          stylingTips: (normalized.stylingTips ?? []).map(String).filter(Boolean).slice(0, 5),
          missingItems: (normalized.missingItems ?? []).map(String).filter(Boolean).slice(0, 5),
          confidence: clamp01(normalized.confidence),
          scoreBreakdown,
        },
      };
    })
    .sort((left, right) => right.response.scoreBreakdown.total - left.response.scoreBreakdown.total);

  const selected: typeof entries = [];
  const remaining = [...entries];
  while (remaining.length) {
    let bestIndex = 0;
    let bestAdjustedScore = Number.NEGATIVE_INFINITY;
    let bestDiversity = scoreOutfitDiversity(remaining[0].source, selected.map((entry) => entry.source), context);
    remaining.forEach((entry, index) => {
      const diversity = scoreOutfitDiversity(entry.source, selected.map((selectedEntry) => selectedEntry.source), context);
      const adjustedScore = entry.response.scoreBreakdown.total + ((diversity.score - 1) * 0.2);
      if (adjustedScore > bestAdjustedScore) {
        bestAdjustedScore = adjustedScore;
        bestIndex = index;
        bestDiversity = diversity;
      }
    });
    const [picked] = remaining.splice(bestIndex, 1);
    picked.response.scoreBreakdown = {
      ...picked.response.scoreBreakdown,
      diversityScore: bestDiversity.score,
      diversityPenalties: bestDiversity.penalties,
      total: Number(Math.max(0, Math.min(1, bestAdjustedScore)).toFixed(3)),
    };
    selected.push(picked);
  }

  return selected.map((entry) => entry.response);
}
