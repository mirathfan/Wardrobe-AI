import {
  clampScore,
  itemText,
  normalizedText,
  roleForStylingItem,
  uniqueList,
  type FitEngineResult,
  type StylingItem,
  type StylingItemRole,
} from "./types";

type FitFamily = "slim" | "regular" | "relaxed" | "oversized" | "unknown";

function fitFamily(item: StylingItem): FitFamily {
  const text = itemText(item);
  const explicit = normalizedText(item.fit);
  if (/\b(oversized|boxy|baggy|wide|loose)\b/.test(`${explicit} ${text}`)) {
    return "oversized";
  }
  if (/\b(relaxed|straight|classic)\b/.test(`${explicit} ${text}`)) {
    return "relaxed";
  }
  if (/\b(slim|skinny|fitted|tailored|tapered)\b/.test(`${explicit} ${text}`)) {
    return "slim";
  }
  if (/\b(regular|standard|normal)\b/.test(`${explicit} ${text}`)) {
    return "regular";
  }
  return "unknown";
}

function formalityScore(item: StylingItem): number {
  if (typeof item.formalityScore === "number" && Number.isFinite(item.formalityScore)) {
    return Math.max(0, Math.min(1, item.formalityScore));
  }
  const text = itemText(item);
  if (/\b(tuxedo|suit|formal|oxford|derby|dress shirt|dress shoe)\b/.test(text)) {
    return 0.92;
  }
  if (/\b(blazer|trouser|loafer|button down|button up|polo|chino|silk|wool)\b/.test(text)) {
    return 0.72;
  }
  if (/\b(jean|denim|tee|t shirt|sneaker|hoodie|sweatshirt|cargo)\b/.test(text)) {
    return 0.38;
  }
  if (/\b(running|gym|athletic|training|performance|basketball)\b/.test(text)) {
    return 0.18;
  }
  return 0.5;
}

function isHeavyLayer(item?: StylingItem): boolean {
  if (!item) return false;
  return /\b(hoodie|sweatshirt|chunky|heavy|fleece|puffer|parka|thick)\b/.test(itemText(item));
}

function isStructuredOuterwear(item?: StylingItem): boolean {
  if (!item) return false;
  return /\b(blazer|sport coat|suit jacket|trench|overcoat|wool coat)\b/.test(itemText(item));
}

function isRunningShoe(item?: StylingItem): boolean {
  if (!item) return false;
  return /\b(running|runner|training|athletic|gym|performance)\b/.test(itemText(item));
}

function isCleanFootwear(item?: StylingItem): boolean {
  if (!item) return false;
  return /\b(loafer|derby|oxford|chelsea|boot|minimal sneaker|clean sneaker|leather sneaker)\b/.test(
    itemText(item),
  );
}

function pickByRole(items: StylingItem[], role: StylingItemRole): StylingItem | undefined {
  return items.find((item) => roleForStylingItem(item) === role);
}

function silhouetteFromFits(
  topFit: FitFamily,
  bottomFit: FitFamily,
  hasOuterwear: boolean,
): string {
  if (topFit === "oversized" && (bottomFit === "slim" || bottomFit === "regular")) {
    return hasOuterwear ? "Layered oversized top, clean bottom" : "Oversized top, clean bottom";
  }
  if ((topFit === "slim" || topFit === "regular") && bottomFit === "oversized") {
    return "Clean top, wide bottom";
  }
  if (topFit === "oversized" && bottomFit === "oversized") {
    return "Relaxed oversized stack";
  }
  if (topFit === "slim" && bottomFit === "slim") {
    return "Slim streamlined fit";
  }
  if (topFit === "unknown" && bottomFit === "unknown") {
    return hasOuterwear ? "Layered silhouette" : "Balanced silhouette";
  }
  return hasOuterwear ? "Balanced layered silhouette" : "Balanced silhouette";
}

export function scoreOutfitFit(items: StylingItem[]): FitEngineResult {
  const fitNotes: string[] = [];
  const warnings: string[] = [];
  const top = pickByRole(items, "top") ?? pickByRole(items, "one_piece");
  const bottom = pickByRole(items, "bottom");
  const footwear = pickByRole(items, "footwear");
  const outerwear = pickByRole(items, "outerwear");
  const topFit = top ? fitFamily(top) : "unknown";
  const bottomFit = bottom ? fitFamily(bottom) : "unknown";
  const outerFit = outerwear ? fitFamily(outerwear) : "unknown";
  let score = 76;

  if (!items.length) {
    return {
      fitScore: 0,
      fitNotes: ["No outfit items were available to score."],
      silhouetteLabel: "Unknown silhouette",
      warnings: ["Missing outfit items."],
    };
  }

  if (topFit === "oversized" && (bottomFit === "slim" || bottomFit === "regular")) {
    // Volume works best when the opposite half of the outfit gives it shape.
    score += 11;
    fitNotes.push("Oversized volume is balanced by a cleaner bottom.");
  }

  if ((topFit === "slim" || topFit === "regular") && bottomFit === "oversized") {
    score += 7;
    fitNotes.push("Wide bottoms are grounded by a cleaner top line.");
  }

  if (topFit === "oversized" && bottomFit === "oversized") {
    // Double volume can be intentional streetwear, but it needs confidence and
    // strong footwear; otherwise it loses proportion quickly.
    score -= isCleanFootwear(footwear) || isRunningShoe(footwear) ? 5 : 12;
    warnings.push("Top and bottom both read oversized, so proportion may feel heavy.");
  }

  if (topFit === "slim" && bottomFit === "slim") {
    score -= 4;
    fitNotes.push("The slim line is coherent, but a little shape contrast would add polish.");
  }

  if (outerwear) {
    if ((outerFit === "slim" || outerFit === "regular") && isHeavyLayer(top)) {
      // A slim outer layer over a thick hoodie/sweatshirt is the common v1
      // layering failure: it bunches and looks accidental.
      score -= 15;
      warnings.push("Outerwear may be too trim for the layer underneath.");
    } else if (
      (outerFit === "regular" || outerFit === "relaxed" || outerFit === "oversized" || outerFit === "unknown") &&
      top
    ) {
      score += 5;
      fitNotes.push("Layering has enough room to sit cleanly.");
    }

    if (isStructuredOuterwear(outerwear) && isRunningShoe(footwear)) {
      score -= 9;
      warnings.push("Structured outerwear with running shoes creates a formality clash.");
    }
  }

  if (footwear && bottom) {
    const bottomText = itemText(bottom);
    if (/\b(wide|baggy|cargo|relaxed)\b/.test(bottomText) && isRunningShoe(footwear)) {
      score += 4;
      fitNotes.push("Sporty footwear can support the wider lower-half proportion.");
    }
    if (/\b(trouser|tailored|straight|slim)\b/.test(bottomText) && isCleanFootwear(footwear)) {
      score += 5;
      fitNotes.push("Footwear sharpens the bottom proportion.");
    }
  }

  const formalityScores = items
    .filter((item) => roleForStylingItem(item) !== "accessory")
    .map(formalityScore);
  const formalityRange =
    formalityScores.length > 1
      ? Math.max(...formalityScores) - Math.min(...formalityScores)
      : 0;
  if (formalityRange > 0.55) {
    // Big formality gaps are usually why a technically complete outfit still
    // feels off: the pieces are speaking different dress codes.
    score -= 18;
    warnings.push("Pieces have a strong formality mismatch.");
  } else if (formalityRange > 0.35) {
    score -= 8;
    warnings.push("There is a mild formality mismatch to watch.");
  }

  const unknownFitCount = [topFit, bottomFit, outerFit].filter(
    (fit) => fit === "unknown",
  ).length;
  if (unknownFitCount >= 2) {
    score -= 5;
    warnings.push("Fit metadata is limited, so silhouette confidence is lower.");
  }

  if (!fitNotes.length) {
    fitNotes.push("Core proportions are wearable and balanced.");
  }

  return {
    fitScore: clampScore(score),
    fitNotes: uniqueList(fitNotes).slice(0, 3),
    silhouetteLabel: silhouetteFromFits(topFit, bottomFit, Boolean(outerwear)),
    warnings: uniqueList(warnings),
  };
}
