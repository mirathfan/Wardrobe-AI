import * as ImageManipulator from "expo-image-manipulator";

const TRIM_GUARD_PIXELS = 2;
const CUTOUT_NORMALIZE_LOG = "[CUTOUT_NORMALIZE]";
const MIN_CANVAS_EDGE = 640;
const MAX_CANVAS_EDGE = 1400;

export type CutoutBoundsInput = {
  cutoutUri: string;
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

export type CutoutNormalizationResult = {
  uri: string;
  outputWidth: number | null;
  outputHeight: number | null;
  scaleRatio: number | null;
};

type CutoutNormalizationProfile = {
  canvasAspectRatio: number;
  paddingXRatio: number;
  paddingTopRatio: number;
  paddingBottomRatio: number;
  targetContentWidthRatio: number;
  targetContentHeightRatio: number;
};

function normalizeToken(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getCutoutNormalizationProfile(input: {
  category?: string | null;
  subCategory?: string | null;
  type?: string | null;
}): CutoutNormalizationProfile {
  const joined = [
    normalizeToken(input.category),
    normalizeToken(input.subCategory),
    normalizeToken(input.type),
  ].join(" ");

  if (
    joined.includes("jacket") ||
    joined.includes("coat") ||
    joined.includes("overshirt") ||
    joined.includes("hoodie") ||
    joined.includes("outerwear")
  ) {
    return {
      canvasAspectRatio: 0.84,
      paddingXRatio: 0.12,
      paddingTopRatio: 0.09,
      paddingBottomRatio: 0.12,
      targetContentWidthRatio: 0.78,
      targetContentHeightRatio: 0.8,
    };
  }

  if (
    joined.includes("shirt") ||
    joined.includes("blouse") ||
    joined.includes("tee") ||
    joined.includes("t-shirt") ||
    joined.includes("top") ||
    joined.includes("polo") ||
    joined.includes("sweater") ||
    joined.includes("crop top")
  ) {
    return {
      canvasAspectRatio: 0.84,
      paddingXRatio: 0.13,
      paddingTopRatio: 0.11,
      paddingBottomRatio: 0.14,
      targetContentWidthRatio: 0.76,
      targetContentHeightRatio: 0.76,
    };
  }

  if (
    joined.includes("pants") ||
    joined.includes("trousers") ||
    joined.includes("jeans") ||
    joined.includes("bottom") ||
    joined.includes("skirt") ||
    joined.includes("dress") ||
    joined.includes("jumpsuit") ||
    joined.includes("romper")
  ) {
    return {
      canvasAspectRatio: 0.72,
      paddingXRatio: 0.12,
      paddingTopRatio: 0.08,
      paddingBottomRatio: 0.09,
      targetContentWidthRatio: 0.74,
      targetContentHeightRatio: 0.84,
    };
  }

  if (
    joined.includes("shoe") ||
    joined.includes("sneaker") ||
    joined.includes("loafer") ||
    joined.includes("boot") ||
    joined.includes("heel") ||
    joined.includes("footwear")
  ) {
    return {
      canvasAspectRatio: 1.18,
      paddingXRatio: 0.12,
      paddingTopRatio: 0.2,
      paddingBottomRatio: 0.08,
      targetContentWidthRatio: 0.78,
      targetContentHeightRatio: 0.62,
    };
  }

  if (
    joined.includes("watch") ||
    joined.includes("glasses") ||
    joined.includes("sunglasses") ||
    joined.includes("bracelet") ||
    joined.includes("necklace") ||
    joined.includes("ring") ||
    joined.includes("earrings")
  ) {
    return {
      canvasAspectRatio: 1,
      paddingXRatio: 0.2,
      paddingTopRatio: 0.2,
      paddingBottomRatio: 0.2,
      targetContentWidthRatio: 0.56,
      targetContentHeightRatio: 0.56,
    };
  }

  if (
    joined.includes("bag") ||
    joined.includes("handbag") ||
    joined.includes("backpack") ||
    joined.includes("crossbody")
  ) {
    return {
      canvasAspectRatio: 0.96,
      paddingXRatio: 0.16,
      paddingTopRatio: 0.15,
      paddingBottomRatio: 0.15,
      targetContentWidthRatio: 0.7,
      targetContentHeightRatio: 0.72,
    };
  }

  return {
    canvasAspectRatio: 0.9,
    paddingXRatio: 0.16,
    paddingTopRatio: 0.14,
    paddingBottomRatio: 0.16,
    targetContentWidthRatio: 0.72,
    targetContentHeightRatio: 0.74,
  };
}

export async function normalizeCutoutImage(
  input: CutoutBoundsInput
): Promise<CutoutNormalizationResult> {
  const { cutoutUri, contentBounds, imageWidth, imageHeight } = input;
  const profile = getCutoutNormalizationProfile(input);
  console.log(CUTOUT_NORMALIZE_LOG, "start", {
    cutoutUri,
    originalCleanedDimensions:
      imageWidth && imageHeight ? `${Math.round(imageWidth)}x${Math.round(imageHeight)}` : null,
    profile,
  });

  if (!contentBounds || !imageWidth || !imageHeight) {
    console.log(CUTOUT_NORMALIZE_LOG, "fallback", {
      reason: "missing_content_bounds_or_dimensions",
    });
    return {
      uri: cutoutUri,
      outputWidth: imageWidth ?? null,
      outputHeight: imageHeight ?? null,
      scaleRatio: null,
    };
  }

  const sourceWidth = Math.max(1, Math.round(imageWidth));
  const sourceHeight = Math.max(1, Math.round(imageHeight));
  const rawX = Math.max(0, Math.round(contentBounds.x));
  const rawY = Math.max(0, Math.round(contentBounds.y));
  const rawWidth = Math.max(1, Math.round(contentBounds.width));
  const rawHeight = Math.max(1, Math.round(contentBounds.height));
  const trimOriginX = Math.max(0, rawX - TRIM_GUARD_PIXELS);
  const trimOriginY = Math.max(0, rawY - TRIM_GUARD_PIXELS);
  const trimWidth = Math.min(sourceWidth - trimOriginX, rawWidth + TRIM_GUARD_PIXELS * 2);
  const trimHeight = Math.min(sourceHeight - trimOriginY, rawHeight + TRIM_GUARD_PIXELS * 2);

  console.log(CUTOUT_NORMALIZE_LOG, "bbox", {
    x: rawX,
    y: rawY,
    width: rawWidth,
    height: rawHeight,
  });

  if (trimWidth <= 0 || trimHeight <= 0) {
    console.log(CUTOUT_NORMALIZE_LOG, "fallback", {
      reason: "invalid_trim_size",
      trimWidth,
      trimHeight,
    });
    return {
      uri: cutoutUri,
      outputWidth: imageWidth ?? null,
      outputHeight: imageHeight ?? null,
      scaleRatio: null,
    };
  }

  const trimmed = await ImageManipulator.manipulateAsync(
    cutoutUri,
    [{ crop: { originX: trimOriginX, originY: trimOriginY, width: trimWidth, height: trimHeight } }],
    { compress: 1, format: ImageManipulator.SaveFormat.PNG }
  );

  const trimmedWidth = Math.max(1, Math.round(trimmed.width ?? trimWidth));
  const trimmedHeight = Math.max(1, Math.round(trimmed.height ?? trimHeight));
  const naturalCanvasWidth = Math.max(
    trimmedWidth / profile.targetContentWidthRatio,
    (trimmedHeight / profile.targetContentHeightRatio) * profile.canvasAspectRatio,
  );
  const naturalCanvasHeight = Math.max(
    trimmedHeight / profile.targetContentHeightRatio,
    (trimmedWidth / profile.targetContentWidthRatio) / profile.canvasAspectRatio,
  );
  const longEdge = clamp(
    Math.max(naturalCanvasWidth, naturalCanvasHeight, MIN_CANVAS_EDGE),
    MIN_CANVAS_EDGE,
    MAX_CANVAS_EDGE,
  );
  const canvasWidth = Math.max(
    trimmedWidth,
    Math.round(
      naturalCanvasWidth >= naturalCanvasHeight
        ? longEdge
        : longEdge * profile.canvasAspectRatio,
    ),
  );
  const canvasHeight = Math.max(
    trimmedHeight,
    Math.round(
      naturalCanvasHeight >= naturalCanvasWidth
        ? longEdge
        : longEdge / profile.canvasAspectRatio,
    ),
  );
  const horizontalPadding = Math.round(canvasWidth * profile.paddingXRatio);
  const usableWidth = Math.max(trimmedWidth, canvasWidth - horizontalPadding * 2);
  const centeredX = Math.round((canvasWidth - usableWidth) / 2 + (usableWidth - trimmedWidth) / 2);
  const topPadding = Math.round(canvasHeight * profile.paddingTopRatio);
  const bottomPadding = Math.round(canvasHeight * profile.paddingBottomRatio);
  const usableHeight = Math.max(trimmedHeight, canvasHeight - topPadding - bottomPadding);
  const centeredY = Math.round(topPadding + (usableHeight - trimmedHeight) / 2);
  const scaleRatio = Number(
    Math.min(trimmedWidth / canvasWidth, trimmedHeight / canvasHeight).toFixed(3)
  );

  const normalized = await ImageManipulator.manipulateAsync(
    trimmed.uri,
    [
      {
        extent: {
          originX: centeredX,
          originY: centeredY,
          width: canvasWidth,
          height: canvasHeight,
          backgroundColor: "#00000000",
        },
      },
    ],
    { compress: 1, format: ImageManipulator.SaveFormat.PNG }
  );

  console.log(CUTOUT_NORMALIZE_LOG, "output", {
    normalizedOutputDimensions: `${canvasWidth}x${canvasHeight}`,
    scaleRatioUsed: scaleRatio,
  });

  return {
    uri: normalized.uri || trimmed.uri || cutoutUri,
    outputWidth: canvasWidth,
    outputHeight: canvasHeight,
    scaleRatio,
  };
}
