export type VisualNormalizationAnchor = "top" | "center" | "waist" | "foot";

export type VisualNormalization = {
  contentBounds?: {
    leftPct: number;
    topPct: number;
    widthPct: number;
    heightPct: number;
  };
  recommendedScale?: number;
  recommendedTranslateY?: number;
  anchor?: VisualNormalizationAnchor;
};

type CategoryNormalizationDefaults = {
  recommendedScale?: number;
  recommendedTranslateY?: number;
  anchor?: VisualNormalizationAnchor;
};

type CutoutBoundsInput = {
  contentBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  category?: string | null;
  subCategory?: string | null;
  type?: string | null;
};

function normalizeText(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function inferAnchor(input: {
  category?: string | null;
  subCategory?: string | null;
  type?: string | null;
}): VisualNormalizationAnchor {
  const tokens = [
    normalizeText(input.category),
    normalizeText(input.subCategory),
    normalizeText(input.type),
  ].join(" ");

  if (tokens.includes("jeans") || tokens.includes("pants") || tokens.includes("trousers")) {
    return "waist";
  }
  if (
    tokens.includes("shoe") ||
    tokens.includes("sneaker") ||
    tokens.includes("loafer") ||
    tokens.includes("boot")
  ) {
    return "foot";
  }
  if (
    tokens.includes("shirt") ||
    tokens.includes("tee") ||
    tokens.includes("t-shirt") ||
    tokens.includes("jacket") ||
    tokens.includes("coat") ||
    tokens.includes("hoodie")
  ) {
    return "top";
  }
  return "center";
}

export function getVisualNormalizationDefaults(input: {
  category?: string | null;
  subCategory?: string | null;
  type?: string | null;
}): CategoryNormalizationDefaults {
  const category = normalizeText(input.category);
  const subCategory = normalizeText(input.subCategory);
  const type = normalizeText(input.type);
  const joined = `${category} ${subCategory} ${type}`;

  if (joined.includes("shirt")) {
    return { recommendedScale: 1.02, recommendedTranslateY: 6, anchor: "top" };
  }
  if (joined.includes("tee") || joined.includes("t-shirt")) {
    return { recommendedScale: 0.98, recommendedTranslateY: 4, anchor: "top" };
  }
  if (
    joined.includes("jacket") ||
    joined.includes("coat") ||
    joined.includes("overshirt") ||
    joined.includes("hoodie")
  ) {
    return { recommendedScale: 1.04, recommendedTranslateY: 2, anchor: "top" };
  }
  if (joined.includes("jeans") || joined.includes("pants") || joined.includes("trousers")) {
    return { recommendedScale: 1.0, recommendedTranslateY: 0, anchor: "waist" };
  }
  if (
    joined.includes("shoe") ||
    joined.includes("sneaker") ||
    joined.includes("loafer") ||
    joined.includes("boot")
  ) {
    return { recommendedScale: 0.98, recommendedTranslateY: 2, anchor: "foot" };
  }
  if (joined.includes("watch")) {
    return { recommendedScale: 0.96, recommendedTranslateY: 0, anchor: "center" };
  }
  if (joined.includes("glasses") || joined.includes("sunglasses")) {
    return { recommendedScale: 0.96, recommendedTranslateY: 0, anchor: "center" };
  }
  if (joined.includes("bag") || joined.includes("backpack") || joined.includes("crossbody")) {
    return { recommendedScale: 1.02, recommendedTranslateY: 0, anchor: "center" };
  }
  return { recommendedScale: 1, recommendedTranslateY: 0, anchor: inferAnchor(input) };
}

export function buildVisualNormalizationFromContentBounds(
  input: CutoutBoundsInput,
): VisualNormalization | null {
  const { contentBounds, imageWidth, imageHeight } = input;
  if (!contentBounds || !imageWidth || !imageHeight) {
    return null;
  }

  const leftPct = clamp((contentBounds.x / imageWidth) * 100, 0, 100);
  const topPct = clamp((contentBounds.y / imageHeight) * 100, 0, 100);
  const widthPct = clamp((contentBounds.width / imageWidth) * 100, 0.1, 100);
  const heightPct = clamp((contentBounds.height / imageHeight) * 100, 0.1, 100);

  const defaults = getVisualNormalizationDefaults(input);
  const fillHeightTarget = 84;
  const fillCompensation = clamp(fillHeightTarget / heightPct, 0.88, 1.22);
  const topBias = 10 - topPct;
  const translateFromTopBias = clamp(topBias * 0.6, -12, 12);

  return {
    contentBounds: {
      leftPct,
      topPct,
      widthPct,
      heightPct,
    },
    recommendedScale: Number(((defaults.recommendedScale ?? 1) * fillCompensation).toFixed(3)),
    recommendedTranslateY: Math.round((defaults.recommendedTranslateY ?? 0) + translateFromTopBias),
    anchor: defaults.anchor ?? inferAnchor(input),
  };
}

export async function analyzeCutoutVisualNormalization(input: CutoutBoundsInput): Promise<VisualNormalization | null> {
  return buildVisualNormalizationFromContentBounds(input);
}

export function mergeVisualNormalization(
  defaults: CategoryNormalizationDefaults,
  itemLevel?: VisualNormalization | null,
): VisualNormalization {
  return {
    contentBounds: itemLevel?.contentBounds,
    recommendedScale: itemLevel?.recommendedScale ?? defaults.recommendedScale ?? 1,
    recommendedTranslateY:
      itemLevel?.recommendedTranslateY ?? defaults.recommendedTranslateY ?? 0,
    anchor: itemLevel?.anchor ?? defaults.anchor ?? "center",
  };
}
