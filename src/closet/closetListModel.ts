import {
  type CanonicalCategory,
  type ClosetItem,
  toCanonicalCategory,
} from "@/src/lib/items";
import { sanitizeDisplayText } from "@/src/lib/text";

export type SortMode = "RECENTLY_ADDED" | "RECENTLY_WORN" | "BRAND" | "MOST_WORN";
export type CategoryKey = CanonicalCategory;
export type ClosetSection = {
  key: CategoryKey;
  title: string;
  itemCount: number;
  subcategories: { label: string; items: ClosetItem[] }[];
};

export type ClosetListRow =
  | {
      type: "section";
      key: string;
      section: ClosetSection;
      expanded: boolean;
    }
  | {
      type: "subcategory";
      key: string;
      label: string;
      count: number;
    }
  | {
      type: "items";
      key: string;
      items: ClosetItem[];
      animateOffset: number;
      trailingAddTile?: boolean;
    };

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  top: "Tops",
  one_piece: "One-pieces",
  outerwear: "Outerwear",
  bottom: "Bottoms",
  shoes: "Footwear",
  accessory: "Accessories",
};

const SUBCATEGORY_GROUPS: Record<CategoryKey, { label: string; matches: string[] }[]> = {
  top: [
    { label: "T-shirts", matches: ["t-shirt", "tshirt", "tee"] },
    { label: "Shirts", matches: ["shirt", "dress shirt"] },
    { label: "Blouses", matches: ["blouse"] },
    { label: "Crop tops", matches: ["crop_top", "crop top"] },
    { label: "Polos", matches: ["polo"] },
    { label: "Tanks", matches: ["tank"] },
    { label: "Sweaters", matches: ["sweater", "knit", "jumper"] },
    { label: "Hoodies", matches: ["hoodie", "sweatshirt"] },
  ],
  one_piece: [
    { label: "Dresses", matches: ["dress"] },
    { label: "Jumpsuits & rompers", matches: ["jumpsuit", "romper"] },
    { label: "Matching sets", matches: ["set", "matching_set"] },
  ],
  outerwear: [
    { label: "Jackets", matches: ["jacket"] },
    { label: "Coats", matches: ["coat", "parka", "trench"] },
    { label: "Overshirts", matches: ["overshirt", "shacket"] },
    { label: "Blazers", matches: ["blazer", "sport coat"] },
  ],
  bottom: [
    { label: "Jeans", matches: ["jeans", "denim"] },
    { label: "Trousers", matches: ["trousers", "pants", "slacks"] },
    { label: "Joggers", matches: ["joggers", "sweatpants"] },
    { label: "Shorts", matches: ["shorts"] },
    { label: "Skirts", matches: ["skirt"] },
  ],
  shoes: [
    { label: "Sneakers", matches: ["sneaker", "sneakers", "trainer"] },
    { label: "Loafers", matches: ["loafer", "loafers"] },
    { label: "Boots", matches: ["boot", "boots"] },
    { label: "Heels", matches: ["heel", "heels"] },
    { label: "Sandals", matches: ["sandal", "sandals", "slides"] },
  ],
  accessory: [
    { label: "Watches", matches: ["watch", "watches"] },
    { label: "Bags", matches: ["bag", "bags", "backpack", "tote", "handbag"] },
    { label: "Perfumes", matches: ["perfume", "fragrance", "cologne"] },
    { label: "Jewelry", matches: ["jewelry", "jewellery", "necklace", "ring", "bracelet", "earrings"] },
    { label: "Belts", matches: ["belt", "belts"] },
    { label: "Sunglasses", matches: ["sunglasses", "glasses"] },
    { label: "Caps", matches: ["cap", "caps", "hat", "beanie"] },
    { label: "Scarves", matches: ["scarf", "scarves"] },
  ],
};

export function validHttpUrl(value: string) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^www\d*\./i.test(trimmed)
      ? `https://${trimmed}`
      : "";
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function toMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value instanceof Date) return value.getTime();
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return date?.getTime?.() ?? 0;
  }
  return 0;
}

function itemSubcategory(item: ClosetItem) {
  return sanitizeDisplayText(item.subCategory) || sanitizeDisplayText(item.type) || "";
}

function subcategoryBucket(item: ClosetItem, category: CategoryKey) {
  const haystack = `${itemSubcategory(item)} ${sanitizeDisplayText(item.name)}`.toLowerCase();
  const group = SUBCATEGORY_GROUPS[category].find((option) =>
    option.matches.some((term) => haystack.includes(term))
  );
  return group?.label ?? "Other";
}

function searchableValues(values: unknown[]) {
  return values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function anyStartsWith(values: unknown[], query: string) {
  return searchableValues(values).some((value) => value.startsWith(query));
}

function anyIncludes(values: unknown[], query: string) {
  return searchableValues(values).some((value) => value.includes(query));
}

export function searchMatchScore(item: ClosetItem, query: string) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;
  const extended = item as ClosetItem & Record<string, unknown>;
  const titleFields = [item.name, extended.title, extended.productName];
  const categoryFields = [item.category, item.subCategory, item.type];
  const colorFields = [
    item.primaryColor,
    extended.colorLabel,
    extended.displayColor,
    item.colors,
    extended.displayColors,
  ];
  const tagMaterialFields = [
    extended.tags,
    extended.material,
    extended.materials,
    extended.pattern,
    extended.style,
    extended.fit,
    extended.occasionTags,
    extended.seasonTags,
    extended.styleTags,
  ];

  if (anyStartsWith(titleFields, normalizedQuery)) return 1;
  if (anyIncludes(titleFields, normalizedQuery)) return 2;
  if (anyIncludes([item.brand], normalizedQuery)) return 3;
  if (anyIncludes(categoryFields, normalizedQuery)) return 4;
  if (anyIncludes(colorFields, normalizedQuery)) return 5;
  if (anyIncludes(tagMaterialFields, normalizedQuery)) return 6;
  return null;
}

export function searchMatches(item: ClosetItem, query: string) {
  if (!query) return true;
  return searchMatchScore(item, query) != null;
}

export function rankSearchItems(items: ClosetItem[], query: string) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return items;
  return items
    .map((item, index) => ({
      item,
      index,
      score: searchMatchScore(item, normalizedQuery),
    }))
    .filter((entry): entry is { item: ClosetItem; index: number; score: number } => entry.score != null)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((entry) => entry.item);
}

export function sortItems(items: ClosetItem[], sortMode: SortMode) {
  const next = [...items];
  if (sortMode === "RECENTLY_WORN") {
    next.sort((a, b) => toMillis(b.lastWornDate) - toMillis(a.lastWornDate));
    return next;
  }
  if (sortMode === "BRAND") {
    next.sort((a, b) => normalizeText(a.brand).localeCompare(normalizeText(b.brand)));
    return next;
  }
  if (sortMode === "MOST_WORN") {
    next.sort((a, b) => Number(b.wearCountSinceWash ?? 0) - Number(a.wearCountSinceWash ?? 0));
    return next;
  }
  next.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  return next;
}

export function buildSections(
  items: ClosetItem[],
  categoryOrder: CategoryKey[],
  emphasizedSubcategories: string[],
): ClosetSection[] {
  return categoryOrder.map((category) => {
    const inCategory = items.filter((item) => toCanonicalCategory(item.category) === category);
    const buckets = new Map<string, ClosetItem[]>();
    inCategory.forEach((item) => {
      const key = subcategoryBucket(item, category);
      const current = buckets.get(key) ?? [];
      current.push(item);
      buckets.set(key, current);
    });
    const subcategories = Array.from(buckets.entries())
      .map(([label, groupedItems]) => ({ label, items: groupedItems }))
      .sort((a, b) => {
        const aMatches = SUBCATEGORY_GROUPS[category]
          .find((option) => option.label === a.label)
          ?.matches.some((term) => emphasizedSubcategories.includes(term));
        const bMatches = SUBCATEGORY_GROUPS[category]
          .find((option) => option.label === b.label)
          ?.matches.some((term) => emphasizedSubcategories.includes(term));
        if (aMatches && !bMatches) return -1;
        if (bMatches && !aMatches) return 1;
        if (a.label === "Other") return 1;
        if (b.label === "Other") return -1;
        return a.label.localeCompare(b.label);
      });
    return {
      key: category,
      title: CATEGORY_LABELS[category],
      itemCount: inCategory.length,
      subcategories,
    };
  }).filter((section) => section.itemCount > 0);
}

function itemRows(items: ClosetItem[], keyPrefix: string, animateOffset = 0): ClosetListRow[] {
  const rows: ClosetListRow[] = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push({
      type: "items",
      key: `${keyPrefix}:row:${index}`,
      items: items.slice(index, index + 2),
      animateOffset: animateOffset + index,
    });
  }
  return rows;
}

export function buildClosetListRows(
  sections: ClosetSection[],
  expandedSections: Record<string, boolean>,
) {
  return sections.flatMap<ClosetListRow>((section) => {
    const expanded = expandedSections[section.key] !== false;
    const rows: ClosetListRow[] = [
      {
        type: "section",
        key: `section:${section.key}`,
        section,
        expanded,
      },
    ];

    if (!expanded) {
      return rows.concat(itemRows(section.subcategories.flatMap((group) => group.items), `section:${section.key}`));
    }

    let animateOffset = 0;
    section.subcategories.forEach((group) => {
      rows.push({
        type: "subcategory",
        key: `section:${section.key}:subcategory:${group.label}`,
        label: group.label,
        count: group.items.length,
      });
      rows.push(...itemRows(group.items, `section:${section.key}:subcategory:${group.label}`, animateOffset));
      animateOffset += group.items.length;
    });
    return rows;
  });
}
