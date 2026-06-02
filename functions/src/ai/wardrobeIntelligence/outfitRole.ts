import type { CanonicalOutfitRole, OutfitRole } from "./outfitTypes";

function cleanText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizedText(value: unknown): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  const text = normalizedText(value);
  return text ? [text] : [];
}

function roleFromText(value: unknown): OutfitRole | null {
  const text = normalizedText(value);
  if (text === "shoe" || text === "shoes") return "footwear";
  if (["top", "bottom", "footwear", "outerwear", "accessory", "one piece", "one_piece"].includes(text)) {
    return text === "one piece" ? "one_piece" : text as OutfitRole;
  }
  return null;
}

export function normalizeOutfitRoleAlias(value: unknown): CanonicalOutfitRole {
  return roleFromText(value) ?? "unknown";
}

export type RoleLikeItem = Record<string, unknown> & {
  name?: unknown;
  title?: unknown;
  category?: unknown;
  subcategory?: unknown;
  subCategory?: unknown;
  type?: unknown;
  aiMetadata?: unknown;
  searchAliases?: unknown;
  styleTags?: unknown;
};

function itemText(item: RoleLikeItem): string {
  const aiMetadata = item.aiMetadata && typeof item.aiMetadata === "object"
    ? item.aiMetadata as Record<string, unknown>
    : {};
  return normalizedText([
    item.name,
    item.title,
    item.category,
    item.subcategory,
    item.subCategory,
    item.type,
    collectStrings(item.searchAliases).join(" "),
    collectStrings(item.styleTags).join(" "),
    aiMetadata.category,
    aiMetadata.subcategory,
    collectStrings(aiMetadata.searchAliases).join(" "),
    collectStrings(aiMetadata.styleTags).join(" "),
  ].filter(Boolean).join(" "));
}

export function canonicalizeOutfitRole(
  item: RoleLikeItem,
  proposedRole?: unknown,
): CanonicalOutfitRole {
  const text = itemText(item);
  const proposed = normalizeOutfitRoleAlias(proposedRole);

  if (/\b(shacket|shirt jacket|shirt-jacket)\b/.test(text)) {
    return "outerwear";
  }
  if (/\b(oxford shirt|button shirt|button down|button-down|linen shirt|shirt|polo|knit polo|t shirt|tshirt|tee|tank|tank top|vest top|overshirt)\b/.test(text)) {
    return "top";
  }
  if (/\b(trousers|pants|jeans|chinos|shorts|tailored pants|straight trousers)\b/.test(text)) {
    return "bottom";
  }
  if (/\b(loafer|loafers|sneaker|sneakers|sandal|sandals|boot|boots|derby|derbies|oxford shoe|oxford shoes|dress shoe|dress shoes|air force|air max|footwear|shoes?)\b/.test(text)) {
    return "footwear";
  }
  if (/\b(jacket|coat|blazer|puffer|racer jacket|outerwear|shacket|shirt jacket|shirt-jacket)\b/.test(text)) {
    return "outerwear";
  }
  if (/\b(watch|belt|sunglasses|cap|hat|jewelry|jewellery|bracelet|necklace|ring|bag|accessory)\b/.test(text)) {
    return "accessory";
  }
  if (/\b(jumpsuit|dress|romper|suit set|matching set|one piece|one-piece)\b/.test(text)) {
    return "one_piece";
  }

  if (proposed !== "unknown") return proposed;
  const categoryRole = roleFromText(item.category);
  if (categoryRole) return categoryRole;
  const metadata = item.aiMetadata && typeof item.aiMetadata === "object"
    ? item.aiMetadata as Record<string, unknown>
    : {};
  return roleFromText(metadata.category) ?? "unknown";
}

export function isSafeOuterwearAsTop(item: RoleLikeItem): boolean {
  return /\b(overshirt|shirt jacket|shirt-jacket|shacket)\b/.test(itemText(item));
}
