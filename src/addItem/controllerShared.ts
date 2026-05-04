import * as ImagePicker from "expo-image-picker";

import { Category } from "../shared/wardrobeTaxonomy";

export type AddItemMode = "create" | "edit" | "duplicate";

export const CATEGORIES: Category[] = Object.values(Category);

export const DEFAULT_COLORS = [
  "Black",
  "White",
  "Blue",
  "Grey",
  "Navy",
  "Brown",
  "Green",
  "Olive",
  "Red",
  "Gold",
  "Beige",
  "Tan",
  "Khaki",
  "Cream",
  "Silver",
];

export const OCCASION_OPTIONS = [
  "work",
  "gym",
  "party",
  "date",
  "travel",
  "lounge",
  "formal_event",
  "streetwear",
] as const;

export const SEASON_OPTIONS = [
  "summer",
  "winter",
  "spring_fall",
  "all_season",
] as const;

export const FIT_OPTIONS = ["slim", "regular", "oversized", "relaxed", "unknown"] as const;
export const RISE_OPTIONS = ["low", "mid", "high", "unknown"] as const;
export const LEG_SHAPE_OPTIONS = [
  "skinny",
  "tapered",
  "straight",
  "wide",
  "flare",
  "unknown",
] as const;
export const SIZE_OPTIONS = ["XXS", "XS", "S", "M", "L", "XL", "XXL"] as const;
export const MATERIAL_OPTIONS = [
  "cotton",
  "denim",
  "polyester",
  "wool",
  "leather",
  "linen",
  "nylon",
  "silk",
  "rayon",
  "fleece",
  "unknown",
] as const;
export const PATTERN_OPTIONS = [
  "solid",
  "striped",
  "plaid",
  "checked",
  "graphic",
  "logo",
  "text",
  "floral",
  "dots",
  "camouflage",
  "textured",
  "other",
  "unknown",
] as const;

export const DEFAULT_REFINE_VALUE = 1 / 3;
export const CURRENCIES = ["USD", "INR", "EUR", "GBP", "CAD", "AUD", "AED"] as const;
export const UPLOAD_TIMEOUT_MS = 25_000;
export const CUTOUT_TIMEOUT_MS = 55_000;
export const AUTOFILL_TIMEOUT_MS = 20_000;
export const AUTOFILL_DEBOUNCE_MS = 500;

export type AiStatus = "idle" | "running" | "ready" | "error";
export type AutofillSource = "original" | "cutout";

export function makeCreateSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function norm(s: string) {
  return (s || "").trim();
}

export function normColor(s: string) {
  const t = norm(s);
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export function normalizeDisplayColorToDefault(value: unknown) {
  const text = norm(String(value ?? ""))
    .toLowerCase()
    .replace(/[_-]+/g, " ");
  if (!text) return "";

  const aliases: [string, string][] = [
    ["off white", "Cream"],
    ["ivory", "Cream"],
    ["cream", "Cream"],
    ["light blue", "Blue"],
    ["dark blue", "Navy"],
    ["navy", "Navy"],
    ["indigo", "Blue"],
    ["denim", "Blue"],
    ["grey", "Grey"],
    ["gray", "Grey"],
    ["charcoal", "Grey"],
    ["khaki", "Khaki"],
    ["olive", "Olive"],
    ["tan", "Tan"],
    ["beige", "Beige"],
    ["brown", "Brown"],
    ["black", "Black"],
    ["white", "White"],
    ["green", "Green"],
    ["red", "Red"],
    ["gold", "Gold"],
    ["silver", "Silver"],
  ];

  const match = aliases.find(([needle]) => text.includes(needle));
  if (match) return match[1];

  const direct = DEFAULT_COLORS.find((color) => text.includes(color.toLowerCase()));
  return direct ? normColor(direct) : "";
}

export function isWeakItemName(value: unknown) {
  const normalized = norm(String(value ?? ""))
    .toLowerCase()
    .replace(/[_-]+/g, " ");
  return (
    !normalized ||
    ["top", "tops", "bottom", "bottoms", "item", "clothing", "garment", "piece", "one piece", "accessory"].includes(
      normalized
    )
  );
}

export function titleCaseLabel(value: unknown) {
  return norm(String(value ?? ""))
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function buildUsefulItemName(parts: {
  displayColor?: string | null;
  colors?: string[];
  material?: string | null;
  fit?: string | null;
  subCategory?: string | null;
  category?: string | null;
}) {
  const color = norm(parts.displayColor ?? "") || norm(parts.colors?.[0] ?? "");
  const noun = norm(parts.subCategory ?? "") || norm(parts.category ?? "") || "item";
  const rawParts = [color, parts.fit, parts.material, noun]
    .map((part) => norm(String(part ?? "")).toLowerCase().replace(/[_-]+/g, " "))
    .filter(Boolean);
  const deduped = rawParts.filter((part, index) => rawParts.indexOf(part) === index);
  return titleCaseLabel(deduped.join(" "));
}

export function getRefineOptions(value: number) {
  const normalizedValue = Math.max(0, Math.min(1, value));
  const edgeTighten = 0.45 + normalizedValue * 0.2;
  return {
    threshold: 0.63 + normalizedValue * 0.03,
    cleanupRadius: 2,
    feather: 0,
    edgeTighten,
    edgePolish: 0.5,
    maskToAlpha: true,
  };
}

export function getRefineRequestKey(uri: string, value: number) {
  const { threshold, cleanupRadius, feather, edgeTighten, edgePolish } = getRefineOptions(value);
  return [
    uri,
    threshold.toFixed(2),
    cleanupRadius,
    feather,
    edgeTighten.toFixed(2),
    edgePolish.toFixed(2),
  ].join("|");
}

export function normalizeIngestionStatus(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "pending" ||
    normalized === "processing" ||
    normalized === "done" ||
    normalized === "failed"
  ) {
    return normalized;
  }
  return null;
}

export function parseHexRgb(hexValue: string | null | undefined) {
  const hex = String(hexValue ?? "").trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return { r, g, b };
}

export function nearestColorLabel(rgb: { r: number; g: number; b: number }) {
  const { r, g, b } = rgb;
  const brightness = (r + g + b) / 3;
  if (brightness < 20) return "black";
  if (r > 70 && g > 40 && b < 85 && r > g * 1.08 && g > b * 1.05) return "brown";
  if (r > 120 && g > 105 && b < 95 && Math.abs(r - g) < 35) return "khaki";
  if (r > 150 && g > 130 && b > 95 && Math.abs(r - g) < 40) return "tan";
  if (g > r && g > b && brightness < 150) return "olive";
  if (r > 80 && g > 40 && b < 60 && r > g && g > b) return "brown";
  if (r > g * 1.35 && r > b * 1.35 && r > 70) return "red";

  const anchors: { label: string; rgb: [number, number, number] }[] = [
    { label: "black", rgb: [20, 20, 20] },
    { label: "white", rgb: [235, 235, 235] },
    { label: "grey", rgb: [130, 130, 130] },
    { label: "navy", rgb: [45, 60, 110] },
    { label: "blue", rgb: [60, 90, 170] },
    { label: "olive", rgb: [110, 120, 70] },
    { label: "green", rgb: [70, 140, 80] },
    { label: "brown", rgb: [120, 75, 45] },
    { label: "beige", rgb: [200, 175, 130] },
    { label: "tan", rgb: [185, 155, 110] },
    { label: "khaki", rgb: [165, 150, 95] },
    { label: "cream", rgb: [230, 220, 190] },
    { label: "gold", rgb: [190, 155, 70] },
    { label: "silver", rgb: [180, 185, 195] },
  ];
  let best = anchors[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const anchor of anchors) {
    const dr = r - anchor.rgb[0];
    const dg = g - anchor.rgb[1];
    const db = b - anchor.rgb[2];
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = anchor;
    }
  }
  return best.label;
}

export function normalizeColorList(values: unknown) {
  if (!Array.isArray(values)) return [] as string[];
  return values.map((v) => normColor(String(v))).filter(Boolean).slice(0, 2);
}

export function hasTwoLegRegionCue(data: any) {
  const text = [
    norm(data?.subCategory),
    norm(data?.name),
    norm(data?.title),
    norm(data?.productName),
  ]
    .join(" ")
    .toLowerCase();
  const cues = [
    "pants",
    "trackpants",
    "trousers",
    "joggers",
    "jeans",
    "leggings",
    "sweatpants",
    "cargo",
  ];
  return cues.some((cue) => text.includes(cue));
}

export async function uploadWithTimeout<T>(
  work: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
  });
  try {
    return await Promise.race([work, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function shortenUri(uri: string | null | undefined) {
  const value = String(uri ?? "");
  if (!value) return "";
  return value.length > 88 ? `...${value.slice(-88)}` : value;
}

export function buildPhotoHash(asset: ImagePicker.ImagePickerAsset) {
  return [
    asset.fileSize ?? 0,
    `${asset.width ?? 0}x${asset.height ?? 0}`,
    asset.fileName ?? "",
    asset.assetId ?? "",
  ].join("-");
}
