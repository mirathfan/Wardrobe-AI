import type { AuraDetectedOutfitPiece, AuraOutfitPhotoAnalysis } from "@/src/types/aura";

function clean(value?: string | null) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function displayRoleForPiece(piece: AuraDetectedOutfitPiece) {
  const text = `${piece.label ?? ""} ${piece.notes ?? ""}`.toLowerCase();
  if (/\b(tie|sunglasses|glasses|watch|bag|belt|scarf|hat|cap|necklace|chain|bracelet|ring|earrings?)\b/.test(text)) {
    return "accessory";
  }
  if (/\b(shoes?|sneakers?|boots?|loafers?|heels?|sandals?|footwear)\b/.test(text)) return "footwear";
  if (/\b(suit\s+jacket|blazer|jacket|coat|outerwear)\b/.test(text)) return "outerwear";
  if (/\b(trousers?|pants?|slacks|jeans?|shorts?|skirt)\b/.test(text)) return "bottom";
  return piece.role;
}

export function displayOutfitAnalysisRole(piece: AuraDetectedOutfitPiece) {
  const role = displayRoleForPiece(piece);
  if (role === "footwear") return "Shoes";
  if (role === "outerwear") return "Outerwear";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function formatDetectedOutfitPiece(piece: AuraDetectedOutfitPiece) {
  const label = clean(piece.label);
  const color = clean(piece.color);
  if (!label) return "";
  if (!color) return label;
  const escapedColor = color.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^${escapedColor}\\b`, "i").test(label)) return label;
  return `${color} ${label}`;
}

export function formatOutfitAnalysisSentence(analysis?: AuraOutfitPhotoAnalysis | null) {
  const pieces = (analysis?.detectedPieces ?? [])
    .map(formatDetectedOutfitPiece)
    .filter(Boolean);
  if (!pieces.length) return "I can see the outfit, but I need a clearer photo to identify each piece.";
  if (pieces.length === 1) return `You're wearing ${pieces[0]}.`;
  const last = pieces[pieces.length - 1];
  const first = pieces.slice(0, -1).join(", ");
  return `You're wearing ${first}, and ${last}.`;
}
