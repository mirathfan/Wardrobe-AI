import type { AuraLook, AuraLookPiece } from "@/src/types/aura";

export type AuraLookSnapshotPiece = {
  role: AuraLookPiece["role"];
  itemName: string;
  source: AuraLookPiece["source"];
  itemId: string | null;
  imageUrl: string | null;
};

export type AuraLookSnapshot = {
  lookTitle: string;
  vibe: string;
  shortExplanation: string;
  stylingNote: string;
  personalizationLabel: string;
  personalizationNote: string;
  fromCloset: string[];
  addToComplete: string[];
  alternates: string[];
  pieces: AuraLookSnapshotPiece[];
};

export function cleanAuraString(value: unknown) {
  return String(value ?? "").trim();
}

export function compactAuraLookPieces(pieces: AuraLookPiece[]): AuraLookSnapshotPiece[] {
  return pieces.map((piece) => ({
    role: piece.role,
    itemName: cleanAuraString(piece.itemName),
    source: piece.source,
    itemId: cleanAuraString(piece.itemId) || null,
    imageUrl: cleanAuraString(piece.imageUrl) || null,
  }));
}

export function buildAuraLookSnapshot(look: AuraLook): AuraLookSnapshot {
  return {
    lookTitle: cleanAuraString(look.lookTitle),
    vibe: cleanAuraString(look.vibe),
    shortExplanation: cleanAuraString(look.shortExplanation),
    stylingNote: cleanAuraString(look.stylingNote),
    personalizationLabel: cleanAuraString(look.personalizationLabel),
    personalizationNote: cleanAuraString(look.personalizationNote),
    fromCloset: (look.fromCloset ?? []).map(cleanAuraString).filter(Boolean),
    addToComplete: (look.addToComplete ?? []).map(cleanAuraString).filter(Boolean),
    alternates: (look.alternates ?? []).map(cleanAuraString).filter(Boolean),
    pieces: compactAuraLookPieces(look.pieces ?? []),
  };
}

export function getAuraLookItemIds(look: AuraLook) {
  return Array.from(
    new Set(
      (look.pieces ?? [])
        .map((piece) => cleanAuraString(piece.itemId))
        .filter(Boolean),
    ),
  );
}

export function stableAuraLookSignature(look: AuraLook) {
  return JSON.stringify({
    lookTitle: cleanAuraString(look.lookTitle).toLowerCase(),
    vibe: cleanAuraString(look.vibe).toLowerCase(),
    shortExplanation: cleanAuraString(look.shortExplanation).toLowerCase(),
    stylingNote: cleanAuraString(look.stylingNote).toLowerCase(),
    pieces: compactAuraLookPieces(look.pieces ?? []).map((piece) => ({
      role: piece.role,
      itemName: piece.itemName.toLowerCase(),
      source: piece.source,
      itemId: piece.itemId,
    })),
  });
}

export function hashAuraText(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return Math.abs(hash >>> 0).toString(36);
}

export function buildStableAuraLookId(prefix: string, look: AuraLook) {
  return `${prefix}_${hashAuraText(stableAuraLookSignature(look))}`;
}
