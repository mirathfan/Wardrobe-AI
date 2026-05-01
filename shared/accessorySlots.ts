export type AccessorySlot = "headwear" | "eyewear" | "wrist" | "neck" | "bag";

export const ACCESSORY_SLOT_ORDER: AccessorySlot[] = [
  "headwear",
  "eyewear",
  "wrist",
  "neck",
  "bag",
];

export const ACCESSORY_SLOT_TERMS: Record<AccessorySlot, readonly string[]> = {
  headwear: ["cap", "hat", "beanie"],
  eyewear: ["sunglasses", "glasses"],
  wrist: ["watch", "bracelet"],
  neck: ["chain", "necklace"],
  bag: ["backpack", "handbag", "bag"],
};

type AccessorySlotCandidate = {
  category?: unknown;
  subCategory?: unknown;
  type?: unknown;
  name?: unknown;
  itemName?: unknown;
  role?: unknown;
  style?: unknown;
  formality?: unknown;
  material?: unknown;
  colorLabel?: unknown;
  primaryColor?: unknown;
  colors?: unknown;
  aestheticTags?: unknown;
  occasionTags?: unknown;
  seasonTags?: unknown;
  detailTags?: unknown;
};

function normalizeAccessoryText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeAccessoryText).filter(Boolean);
}

export function accessorySearchText(item: AccessorySlotCandidate): string {
  return [
    item.category,
    item.subCategory,
    item.type,
    item.name,
    item.itemName,
    item.role,
    item.style,
    item.formality,
    item.material,
    item.colorLabel,
    item.primaryColor,
    ...normalizedList(item.colors),
    ...normalizedList(item.aestheticTags),
    ...normalizedList(item.occasionTags),
    ...normalizedList(item.seasonTags),
    ...normalizedList(item.detailTags),
  ]
    .map(normalizeAccessoryText)
    .filter(Boolean)
    .join(" ");
}

function hasTerm(text: string, term: string): boolean {
  const normalizedTerm = normalizeAccessoryText(term);
  if (!normalizedTerm) return false;
  return new RegExp(`(?:^|\\s)${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`).test(text);
}

export function getAccessorySlot(item: AccessorySlotCandidate): AccessorySlot | null {
  const text = accessorySearchText(item);
  if (!text) return null;

  for (const slot of ACCESSORY_SLOT_ORDER) {
    if (ACCESSORY_SLOT_TERMS[slot].some((term) => hasTerm(text, term))) {
      return slot;
    }
  }

  return null;
}
