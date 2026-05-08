import { scoreOutfitColors } from "./colorEngine";
import { scoreOutfitFit } from "./fitEngine";
import { detectStyleIdentity } from "./styleIdentityEngine";
import {
  clampScore,
  parseStylingIntent,
  type StylingIntentInput,
  type StylingItem,
  type StylingItemRole,
  type StylingScoreResult,
  type StyleIdentityLabel,
} from "./types";

export type StylingLookPiece = {
  role?: "top" | "bottom" | "shoes" | "outerwear" | "accessory" | string | null;
  itemName?: string | null;
  source?: "closet" | "suggested" | string | null;
  itemId?: string | null;
};

function scoreLabel(score: number): string {
  if (score >= 88) return "Excellent";
  if (score >= 78) return "Strong";
  if (score >= 66) return "Good";
  if (score >= 52) return "Needs refinement";
  return "Weak";
}

function bestUseCase(identity: StyleIdentityLabel, occasionFit: number): string {
  if (occasionFit < 58) return "better as a style experiment than the requested occasion";
  const labels: Record<StyleIdentityLabel, string> = {
    clean_luxury: "polished everyday wear",
    streetwear: "casual streetwear",
    smart_casual: "smart casual plans",
    minimal: "minimal everyday dressing",
    sporty: "active casual wear",
    formal: "formal plans",
    date_night: "date night",
    vacation: "vacation or travel",
    rave_techno: "club or rave styling",
    college_casual: "campus casual wear",
    casual: "everyday casual wear",
    mixed: "flexible casual styling",
  };
  return labels[identity];
}

export function scoreOutfitStyling(
  items: StylingItem[],
  intent?: StylingIntentInput,
): StylingScoreResult {
  const parsedIntent = parseStylingIntent(intent);
  const fit = scoreOutfitFit(items);
  const color = scoreOutfitColors(items);
  const style = detectStyleIdentity(items, parsedIntent);

  // v1 weights are intentionally transparent: proportions carry the most
  // weight, color comes next, identity gives taste direction, and intent match
  // nudges the score without letting prompt text overpower the actual outfit.
  const overallScore = clampScore(
    fit.fitScore * 0.35 +
    color.colorScore * 0.30 +
    style.styleScore * 0.25 +
    style.occasionFit * 0.10,
  );
  const stylingNotes = [
    fit.fitNotes[0],
    color.colorNotes[0],
    style.styleNotes[0],
  ].filter((note): note is string => Boolean(note));
  const warnings = [
    ...fit.warnings,
    ...color.warnings,
    ...(style.confidence < 0.42 ? ["Style identity confidence is low."] : []),
  ];

  return {
    overallScore,
    fitScore: fit.fitScore,
    colorScore: color.colorScore,
    styleScore: style.styleScore,
    occasionFit: style.occasionFit,
    scoreLabel: scoreLabel(overallScore),
    bestUseCase: bestUseCase(style.styleIdentity, style.occasionFit),
    stylingNotes,
    warnings: Array.from(new Set(warnings)),
    styleIdentity: style.styleIdentity,
    paletteLabel: color.paletteLabel,
    silhouetteLabel: fit.silhouetteLabel,
    fit,
    color,
    style,
  };
}

function roleFromLookPiece(role: StylingLookPiece["role"]): StylingItemRole {
  if (role === "shoes") return "footwear";
  if (
    role === "top" ||
    role === "bottom" ||
    role === "footwear" ||
    role === "outerwear" ||
    role === "accessory"
  ) {
    return role;
  }
  return "unknown";
}

export function scoreLookStylingFromPieces(
  pieces: StylingLookPiece[],
  closetItems: StylingItem[],
  intent?: StylingIntentInput,
): StylingScoreResult | null {
  if (!pieces.length) return null;
  const itemsById = new Map(
    closetItems
      .map((item) => [String(item.id ?? "").trim(), item] as const)
      .filter(([id]) => Boolean(id)),
  );
  const warnings: string[] = [];
  const scoringItems = pieces.map((piece) => {
    const role = roleFromLookPiece(piece.role);
    const itemId = String(piece.itemId ?? "").trim();
    const closetItem = itemId ? itemsById.get(itemId) : null;
    if (piece.source === "closet" && !closetItem) {
      warnings.push("Some closet pieces could not be matched to wardrobe metadata.");
    }
    if (piece.source === "suggested") {
      warnings.push("Suggested pieces have limited metadata.");
    }
    return {
      ...(closetItem ?? {}),
      id: closetItem?.id ?? (itemId || undefined),
      role,
      source:
        piece.source === "closet" || piece.source === "suggested"
          ? piece.source
          : "unknown",
      name: closetItem?.name ?? piece.itemName ?? null,
      category: closetItem?.category ?? role,
    } satisfies StylingItem;
  });
  const result = scoreOutfitStyling(scoringItems, intent);
  return {
    ...result,
    warnings: Array.from(new Set([...result.warnings, ...warnings])),
  };
}
