export type VisualNormalizationAnchor = "top" | "center" | "waist" | "foot";

export type VisualNormalization = {
  contentBounds?: {
    leftPct: number;
    topPct: number;
    widthPct: number;
    heightPct: number;
  };
  contentWidthPct?: number;
  contentHeightPct?: number;
  visualFillRatio?: number;
  verticalBias?: number;
  recommendedScale?: number;
  recommendedTranslateY?: number;
  anchor?: VisualNormalizationAnchor;
};

type CategoryNormalizationDefaults = {
  recommendedScale?: number;
  recommendedTranslateY?: number;
  anchor?: VisualNormalizationAnchor;
  targetContentWidthPct?: number;
  targetContentHeightPct?: number;
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
    tokens.includes("blouse") ||
    tokens.includes("tee") ||
    tokens.includes("t-shirt") ||
    tokens.includes("crop top") ||
    tokens.includes("jacket") ||
    tokens.includes("coat") ||
    tokens.includes("hoodie") ||
    tokens.includes("dress")
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
    return { recommendedScale: 1.04, recommendedTranslateY: 6, anchor: "top", targetContentWidthPct: 76, targetContentHeightPct: 78 };
  }
  if (joined.includes("blouse")) {
    return { recommendedScale: 1.02, recommendedTranslateY: 6, anchor: "top", targetContentWidthPct: 74, targetContentHeightPct: 76 };
  }
  if (joined.includes("crop top")) {
    return { recommendedScale: 0.98, recommendedTranslateY: 3, anchor: "top", targetContentWidthPct: 72, targetContentHeightPct: 68 };
  }
  if (joined.includes("tee") || joined.includes("t-shirt")) {
    return { recommendedScale: 1.01, recommendedTranslateY: 5, anchor: "top", targetContentWidthPct: 74, targetContentHeightPct: 75 };
  }
  if (
    joined.includes("jacket") ||
    joined.includes("coat") ||
    joined.includes("overshirt") ||
    joined.includes("hoodie")
  ) {
    return { recommendedScale: 1.03, recommendedTranslateY: 2, anchor: "top", targetContentWidthPct: 80, targetContentHeightPct: 82 };
  }
  if (joined.includes("jeans") || joined.includes("pants") || joined.includes("trousers")) {
    return { recommendedScale: 1.01, recommendedTranslateY: 1, anchor: "waist", targetContentWidthPct: 72, targetContentHeightPct: 84 };
  }
  if (joined.includes("skirt")) {
    return { recommendedScale: 1, recommendedTranslateY: 1, anchor: "waist", targetContentWidthPct: 72, targetContentHeightPct: 82 };
  }
  if (joined.includes("dress") || joined.includes("romper") || joined.includes("jumpsuit")) {
    return { recommendedScale: 1.03, recommendedTranslateY: 2, anchor: "top", targetContentWidthPct: 74, targetContentHeightPct: 86 };
  }
  if (
    joined.includes("shoe") ||
    joined.includes("sneaker") ||
    joined.includes("loafer") ||
    joined.includes("boot") ||
    joined.includes("heel")
  ) {
    return { recommendedScale: 0.94, recommendedTranslateY: 2, anchor: "foot", targetContentWidthPct: 78, targetContentHeightPct: 62 };
  }
  if (joined.includes("watch")) {
    return { recommendedScale: 0.86, recommendedTranslateY: 0, anchor: "center", targetContentWidthPct: 56, targetContentHeightPct: 56 };
  }
  if (joined.includes("glasses") || joined.includes("sunglasses")) {
    return { recommendedScale: 0.9, recommendedTranslateY: 0, anchor: "center", targetContentWidthPct: 60, targetContentHeightPct: 54 };
  }
  if (
    joined.includes("bag") ||
    joined.includes("handbag") ||
    joined.includes("backpack") ||
    joined.includes("crossbody")
  ) {
    return { recommendedScale: 0.96, recommendedTranslateY: 0, anchor: "center", targetContentWidthPct: 68, targetContentHeightPct: 72 };
  }
  return { recommendedScale: 0.96, recommendedTranslateY: 0, anchor: inferAnchor(input), targetContentWidthPct: 72, targetContentHeightPct: 74 };
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
  const fillHeightTarget = defaults.targetContentHeightPct ?? 78;
  const fillWidthTarget = defaults.targetContentWidthPct ?? 74;
  const fillCompensation = clamp(
    Math.min(fillHeightTarget / heightPct, fillWidthTarget / widthPct),
    0.82,
    1.08,
  );
  const targetTopPct = (() => {
    if (defaults.anchor === "top") return 10;
    if (defaults.anchor === "waist") return 8;
    if (defaults.anchor === "foot") return 18;
    return 14;
  })();
  const topBias = targetTopPct - topPct;
  const translateFromTopBias = clamp(topBias * 0.55, -10, 10);

  return {
    contentBounds: {
      leftPct,
      topPct,
      widthPct,
      heightPct,
    },
    contentWidthPct: widthPct,
    contentHeightPct: heightPct,
    visualFillRatio: Number(((widthPct * heightPct) / 10000).toFixed(4)),
    verticalBias: Number(
      (100 - (topPct + heightPct) - topPct).toFixed(2),
    ),
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
    contentWidthPct:
      itemLevel?.contentWidthPct ?? itemLevel?.contentBounds?.widthPct,
    contentHeightPct:
      itemLevel?.contentHeightPct ?? itemLevel?.contentBounds?.heightPct,
    visualFillRatio:
      itemLevel?.visualFillRatio ??
      (() => {
        const widthPct =
          itemLevel?.contentWidthPct ?? itemLevel?.contentBounds?.widthPct;
        const heightPct =
          itemLevel?.contentHeightPct ?? itemLevel?.contentBounds?.heightPct;
        if (!widthPct || !heightPct) return undefined;
        return Number(((widthPct * heightPct) / 10000).toFixed(4));
      })(),
    verticalBias:
      itemLevel?.verticalBias ??
      (() => {
        const topPct = itemLevel?.contentBounds?.topPct;
        const heightPct =
          itemLevel?.contentHeightPct ?? itemLevel?.contentBounds?.heightPct;
        if (topPct == null || heightPct == null) return undefined;
        return Number((100 - (topPct + heightPct) - topPct).toFixed(2));
      })(),
    recommendedScale: itemLevel?.recommendedScale ?? defaults.recommendedScale ?? 1,
    recommendedTranslateY:
      itemLevel?.recommendedTranslateY ?? defaults.recommendedTranslateY ?? 0,
    anchor: itemLevel?.anchor ?? defaults.anchor ?? "center",
  };
}
