import {
  ACCESSORY_SLOT_ORDER,
  getAccessorySlot,
  type AccessorySlot,
} from "../../../shared/accessorySlots";

type AuraAccessoryPieceLike = {
  role?: string;
  itemName?: string;
  source?: string;
  itemId?: string | null;
};

type AuraAccessoryLookLike<TPiece extends AuraAccessoryPieceLike> = {
  lookTitle?: string;
  vibe?: string;
  shortExplanation?: string;
  stylingNote?: string;
  pieces: TPiece[];
};

type PreferenceContext = {
  explicitProfile?: {
    styleVibes?: string[];
    experimentationLevel?: "low" | "medium" | "high";
    favoriteColors?: string[];
  } | null;
  learnedProfile?: {
    confidence?: number;
    inferredFavoriteColors?: string[];
  } | null;
  session?: {
    currentOccasion?: string;
    vibeForThisSession?: string;
  } | null;
} | null;

export type AccessoryDiscardReason = {
  slot: AccessorySlot;
  discardedName: string;
  winnerName: string;
  reason: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizedText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pieceLabel(piece: AuraAccessoryPieceLike) {
  return clean(piece.itemName) || "Accessory";
}

function contextText<TPiece extends AuraAccessoryPieceLike>(
  look: AuraAccessoryLookLike<TPiece>,
  preferenceContext?: PreferenceContext
) {
  return normalizedText([
    look.lookTitle,
    look.vibe,
    look.shortExplanation,
    look.stylingNote,
    preferenceContext?.session?.currentOccasion,
    preferenceContext?.session?.vibeForThisSession,
    ...(preferenceContext?.explicitProfile?.styleVibes ?? []),
  ].filter(Boolean).join(" "));
}

function inferMood(text: string, preferenceContext?: PreferenceContext) {
  if (/\b(safe|minimal|clean|simple|quiet|classic|work|office|formal|interview)\b/.test(text)) {
    return "safe" as const;
  }
  if (/\b(bold|statement|party|night|tonight|date|edgy|colorful|standout)\b/.test(text)) {
    return "bold" as const;
  }
  const experimentation = preferenceContext?.explicitProfile?.experimentationLevel;
  if (experimentation === "low") return "safe" as const;
  if (experimentation === "high") return "bold" as const;
  return "balanced" as const;
}

function favoriteColors(preferenceContext?: PreferenceContext) {
  const explicit = preferenceContext?.explicitProfile?.favoriteColors ?? [];
  const learned =
    (preferenceContext?.learnedProfile?.confidence ?? 0) >= 0.45
      ? preferenceContext?.learnedProfile?.inferredFavoriteColors ?? []
      : [];
  return [...explicit, ...learned].map(normalizedText).filter(Boolean);
}

function scorePiece(
  piece: AuraAccessoryPieceLike,
  slot: AccessorySlot,
  lookText: string,
  preferenceContext: PreferenceContext | undefined,
  index: number
) {
  const pieceText = normalizedText(`${piece.itemName ?? ""} ${piece.source ?? ""}`);
  const mood = inferMood(lookText, preferenceContext);
  const formal = /\b(formal|office|work|business|interview|wedding|black tie|smart)\b/.test(lookText);
  const streetwear = /\b(street|streetwear|skate|sneaker|casual|hoodie|cargo)\b/.test(`${lookText} ${pieceText}`);
  const cold = /\b(cold|winter|snow|freezing|chilly)\b/.test(lookText);
  const warmSunny = /\b(hot|summer|sun|sunny|beach|humid|warm)\b/.test(lookText);
  const hasNeutral = /\b(black|white|grey|gray|navy|beige|cream|tan|silver|gold)\b/.test(pieceText);
  const isMinimal = /\b(minimal|simple|classic|clean|plain|solid|thin|slim|subtle)\b/.test(pieceText);
  const isStatement = /\b(statement|bold|chunky|logo|graphic|bright|colorful|oversized|monogram)\b/.test(pieceText);
  const isSporty = /\b(cap|baseball|snapback|beanie|sport|athletic|gym|backpack)\b/.test(pieceText);
  const hasFavoriteColor = favoriteColors(preferenceContext).some((color) => pieceText.includes(color));

  let score = piece.source === "closet" ? 1.2 : 0.6;
  if (hasFavoriteColor) score += 1.2;
  if (hasNeutral) score += 0.6;

  if (mood === "safe") {
    if (isMinimal || hasNeutral) score += 1.4;
    if (isStatement) score -= 1.5;
  } else if (mood === "balanced") {
    if (isMinimal || hasNeutral) score += 0.9;
    if (isStatement) score += 0.2;
  } else {
    if (isStatement) score += 1.2;
    if (!hasNeutral) score += 0.4;
  }

  if (formal) {
    if (slot === "wrist" || slot === "neck") score += 1;
    if (slot === "bag" && /\bhandbag\b/.test(pieceText)) score += 0.8;
    if (isSporty && !streetwear) score -= 2.4;
  }

  if (streetwear) {
    if (slot === "headwear") score += 1.3;
    if (slot === "neck" || slot === "bag") score += 0.45;
  }

  if (cold) {
    if (/\bbeanie\b/.test(pieceText)) score += 1.2;
    if (slot === "eyewear") score -= 0.6;
  }
  if (warmSunny) {
    if (slot === "eyewear") score += 1.2;
    if (/\bbeanie\b/.test(pieceText)) score -= 1.2;
  }
  if (/\b(travel|commute|errand|airport)\b/.test(lookText) && slot === "bag") {
    score += 0.8;
  }

  return score - index * 0.001;
}

export function dedupeAuraLookAccessories<TPiece extends AuraAccessoryPieceLike>(
  look: AuraAccessoryLookLike<TPiece>,
  preferenceContext?: PreferenceContext
): { pieces: TPiece[]; discarded: AccessoryDiscardReason[] } {
  const lookText = contextText(look, preferenceContext);
  const grouped: Partial<Record<AccessorySlot, Array<{piece: TPiece; index: number; score: number}>>> = {};
  const keepIndexes = new Set<number>();

  look.pieces.forEach((piece, index) => {
    if (piece.role !== "accessory") {
      keepIndexes.add(index);
      return;
    }
    const slot = getAccessorySlot(piece);
    if (!slot) {
      keepIndexes.add(index);
      return;
    }
    grouped[slot] = [
      ...(grouped[slot] ?? []),
      {
        piece,
        index,
        score: scorePiece(piece, slot, lookText, preferenceContext, index),
      },
    ];
  });

  const discarded: AccessoryDiscardReason[] = [];
  for (const slot of ACCESSORY_SLOT_ORDER) {
    const group = grouped[slot] ?? [];
    if (!group.length) continue;
    const ranked = [...group].sort((a, b) => b.score - a.score || a.index - b.index);
    const winner = ranked[0];
    keepIndexes.add(winner.index);

    for (const entry of ranked.slice(1)) {
      const reason = `Discarded accessory "${pieceLabel(entry.piece)}" because ${slot} slot already has "${pieceLabel(winner.piece)}" with better color/vibe score.`;
      discarded.push({
        slot,
        discardedName: pieceLabel(entry.piece),
        winnerName: pieceLabel(winner.piece),
        reason,
      });
    }
  }

  return {
    pieces: look.pieces.filter((_, index) => keepIndexes.has(index)),
    discarded,
  };
}
