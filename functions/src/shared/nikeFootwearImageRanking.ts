export const NIKE_FOOTWEAR_LEFT_PROFILE_REASON = "nike_footwear_left_profile_preferred";

export type NikeFootwearImageCandidate = {
  url: string;
  altText?: string | null;
  sourceIndex?: number | null;
  baseScore?: number | null;
  width?: number | null;
  height?: number | null;
  isCleanProductImage?: boolean;
  isGarmentOnly?: boolean;
  bucket?: string;
  isSideProfileFootwear?: boolean;
  toePointsLeft?: boolean | null;
  hasFullProductVisible?: boolean;
  isModelImage?: boolean;
  isLifestyleOrBanner?: boolean;
  isDetailCloseUp?: boolean;
  isCropped?: boolean;
  isThumbnail?: boolean;
  containsMultipleGarments?: boolean;
};

export type RankedNikeFootwearImageCandidate = NikeFootwearImageCandidate & {
  originalIndex: number;
  nikeFootwearScore: number;
  leftFacingConfidence: number;
  isRejectedNikeFootwearImage: boolean;
  isConfidentLeftProfile: boolean;
  nikeFootwearReasons: string[];
  selectedImageReason?: typeof NIKE_FOOTWEAR_LEFT_PROFILE_REASON | null;
};

const FOOTWEAR_RE =
  /\b(shoes?|sneakers?|trainers?|boots?|loafers?|sandals?|cleats?|slides?|footwear|air\s+jordan|jordan\s+\d+|air\s+force|dunk|blazer|cortez|pegasus|vaporfly|metcon|running\s+shoes?|basketball\s+shoes?)\b/i;
const PRODUCT_IMAGE_RE =
  /\b(product|pdp|gallery|packshot|studio|clean|cutout|transparent|isolated|plain|white|squarish|portrait|main)\b|static\.nike\.com\/a\/images|\/t_pdp_|\/t_default_/i;
const CLEAN_BACKGROUND_RE =
  /\b(clean|cutout|transparent|isolated|plain|white|light|studio|packshot|product|pdp|gallery)\b|static\.nike\.com\/a\/images|\/t_pdp_/i;
const SIDE_PROFILE_RE =
  /\b(side|sideview|side-view|side_profile|profile|lateral|medial|left\s+profile|right\s+profile)\b/i;
const LEFT_FACING_RE =
  /\b(left[-_\s]?(facing|profile|side|lateral|view)|facing[-_\s]?left|toe[-_\s]?(?:points?[-_\s]?)?left|front[-_\s]?(?:points?[-_\s]?)?left|points?[-_\s]?left)\b/i;
const RIGHT_FACING_RE =
  /\b(right[-_\s]?(facing|profile|side|lateral|view)|facing[-_\s]?right|toe[-_\s]?(?:points?[-_\s]?)?right|front[-_\s]?(?:points?[-_\s]?)?right|points?[-_\s]?right)\b/i;
const MODEL_LIFESTYLE_RE =
  /\b(on[-_\s]?foot|on[-_\s]?feet|worn|wearing|lifestyle|editorial|campaign|model|athlete|person|people|human|leg|legs|feet|street|lookbook|styled)\b/i;
const DETAIL_RE =
  /\b(detail|close[-_\s]?up|zoom|macro|sole|outsole|bottom|underfoot|traction|insole|heel[-_\s]?detail|lace[-_\s]?detail|material|texture|logo[-_\s]?shot|box|shoebox|packaging)\b/i;
const GRID_COLLAGE_RE = /\b(grid|collage|composite|multi[-_\s]?image|tile|tiles|sprite)\b/i;
const PAIR_RE = /\b(pair|pairs|both[-_\s]?shoes|two[-_\s]?shoes)\b/i;

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/[_+%20-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function candidateSearchText(candidate: NikeFootwearImageCandidate) {
  let decodedUrl = candidate.url;
  try {
    decodedUrl = decodeURIComponent(candidate.url);
  } catch {
    decodedUrl = candidate.url;
  }
  return cleanText(`${decodedUrl} ${candidate.altText ?? ""}`);
}

function imageDimensionHints(candidate: NikeFootwearImageCandidate) {
  const values: number[] = [];
  if (typeof candidate.width === "number" && Number.isFinite(candidate.width) && candidate.width > 0) {
    values.push(candidate.width);
  }
  if (typeof candidate.height === "number" && Number.isFinite(candidate.height) && candidate.height > 0) {
    values.push(candidate.height);
  }
  try {
    const parsed = new URL(candidate.url);
    for (const key of ["imwidth", "width", "w", "sw", "height", "h", "sh"]) {
      const value = Number(parsed.searchParams.get(key) ?? 0);
      if (Number.isFinite(value) && value > 0) values.push(value);
    }
  } catch {
    // Path parsing below still handles common filename dimensions.
  }
  const lower = candidate.url.toLowerCase();
  for (const dim of lower.matchAll(/(?:_|-|\/)(\d{2,4})(?:x|_|-)(\d{2,4})(?:[._/?-]|$)/g)) {
    values.push(Number(dim[1]), Number(dim[2]));
  }
  return values.filter((value) => Number.isFinite(value) && value > 0);
}

function hasWideHorizontalHint(candidate: NikeFootwearImageCandidate) {
  if (
    typeof candidate.width === "number" &&
    typeof candidate.height === "number" &&
    Number.isFinite(candidate.width) &&
    Number.isFinite(candidate.height) &&
    candidate.width > 0 &&
    candidate.height > 0
  ) {
    return candidate.width / candidate.height >= 1.15;
  }
  const dimensions = imageDimensionHints(candidate);
  if (dimensions.length < 2) return false;
  const largest = Math.max(...dimensions);
  const smallest = Math.min(...dimensions);
  return largest / Math.max(1, smallest) >= 1.15;
}

export function isNikeProductUrlForImageRanking(sourceUrl?: string | null) {
  try {
    const host = new URL(String(sourceUrl ?? "")).hostname.toLowerCase();
    return host === "nike.com" || host === "www.nike.com";
  } catch {
    return false;
  }
}

export function isNikeFootwearProductText(params: {
  title?: string | null;
  description?: string | null;
  categoryHints?: Array<string | null | undefined>;
}) {
  const categoryText = cleanText((params.categoryHints ?? []).filter(Boolean).join(" "));
  if (/\b(footwear|shoes?|sneakers?|trainers?|boots?|sandals?|loafers?)\b/i.test(categoryText)) {
    return true;
  }
  return FOOTWEAR_RE.test(`${params.title ?? ""} ${params.description ?? ""}`);
}

export function scoreNikeFootwearImageCandidate(
  candidate: NikeFootwearImageCandidate,
  originalIndex = Number(candidate.sourceIndex ?? 0),
): RankedNikeFootwearImageCandidate {
  const text = candidateSearchText(candidate);
  const reasons: string[] = [];
  let score = Number(candidate.baseScore ?? 0);
  let confidence = 0;

  const hasProductHint = PRODUCT_IMAGE_RE.test(text);
  const hasCleanBackgroundHint =
    CLEAN_BACKGROUND_RE.test(text) ||
    candidate.isCleanProductImage === true ||
    candidate.isGarmentOnly === true ||
    candidate.bucket === "garment_only";
  const hasSideProfileHint = SIDE_PROFILE_RE.test(text) || candidate.isSideProfileFootwear === true;
  const hasLeftHint = LEFT_FACING_RE.test(text) || candidate.toePointsLeft === true;
  const hasRightHint = RIGHT_FACING_RE.test(text) || (candidate.isSideProfileFootwear === true && candidate.toePointsLeft === false);
  const hasWideHint = hasWideHorizontalHint(candidate);

  if (/\.(jpe?g|png|webp)(\?|$)/i.test(candidate.url)) {
    score += 6;
    reasons.push("image file");
  }
  if (/static\.nike\.com\/a\/images/i.test(candidate.url)) {
    score += 24;
    reasons.push("Nike product CDN");
  }
  if (hasProductHint) {
    score += 32;
    reasons.push("product/gallery hint");
  }
  if (hasCleanBackgroundHint) {
    score += 38;
    confidence += 1;
    reasons.push("clean or plain product hint");
  }
  if (candidate.hasFullProductVisible === true) {
    score += 34;
    confidence += 1;
    reasons.push("full shoe visible");
  }
  if (hasWideHint) {
    score += 26;
    confidence += 1;
    reasons.push("wide horizontal image hint");
  }
  if (hasSideProfileHint) {
    score += 86;
    confidence += 2;
    reasons.push("side-profile footwear hint");
  }
  if (hasLeftHint) {
    score += candidate.toePointsLeft === true ? 190 : 112;
    confidence += candidate.toePointsLeft === true ? 3 : 2;
    reasons.push("left-facing shoe hint");
  }
  if (hasRightHint && !hasLeftHint) {
    score -= 54;
    reasons.push("right-facing or not-left side profile hint");
  }

  const hasModelLifestyle = MODEL_LIFESTYLE_RE.test(text) || candidate.isModelImage === true || candidate.isLifestyleOrBanner === true;
  const hasDetail = DETAIL_RE.test(text) || candidate.isDetailCloseUp === true;
  const hasGridCollage = GRID_COLLAGE_RE.test(text) || candidate.containsMultipleGarments === true;
  const hasPair = PAIR_RE.test(text);
  const hasCrop = candidate.isCropped === true || candidate.isThumbnail === true;

  if (hasModelLifestyle) {
    score -= 180;
    confidence -= 3;
    reasons.push("model/on-foot/lifestyle penalty");
  }
  if (hasDetail) {
    score -= 170;
    confidence -= 3;
    reasons.push("sole/detail/box penalty");
  }
  if (hasGridCollage) {
    score -= 160;
    confidence -= 3;
    reasons.push("grid/collage penalty");
  }
  if (hasPair) {
    score -= 72;
    confidence -= 1;
    reasons.push("pair image penalty");
  }
  if (hasCrop) {
    score -= 120;
    confidence -= 2;
    reasons.push("cropped or thumbnail penalty");
  }

  const isRejectedNikeFootwearImage = hasModelLifestyle || hasDetail || hasGridCollage || hasCrop;
  const isConfidentLeftProfile =
    !isRejectedNikeFootwearImage &&
    hasLeftHint &&
    hasSideProfileHint &&
    (hasCleanBackgroundHint || hasProductHint || hasWideHint || candidate.hasFullProductVisible === true) &&
    confidence >= 4;

  return {
    ...candidate,
    originalIndex,
    nikeFootwearScore: score,
    leftFacingConfidence: confidence,
    isRejectedNikeFootwearImage,
    isConfidentLeftProfile,
    nikeFootwearReasons: reasons.length ? reasons : ["no Nike footwear-specific hints"],
    selectedImageReason: isConfidentLeftProfile ? NIKE_FOOTWEAR_LEFT_PROFILE_REASON : null,
  };
}

export function rankNikeFootwearImages(
  candidates: NikeFootwearImageCandidate[],
): RankedNikeFootwearImageCandidate[] {
  return candidates
    .map((candidate, index) => scoreNikeFootwearImageCandidate(candidate, index))
    .sort(
      (a, b) =>
        b.nikeFootwearScore - a.nikeFootwearScore ||
        b.leftFacingConfidence - a.leftFacingConfidence ||
        a.originalIndex - b.originalIndex ||
        a.url.localeCompare(b.url),
    );
}

export function applyNikeFootwearImagePreference<T extends NikeFootwearImageCandidate>(
  candidates: T[],
  context: {
    sourceUrl?: string | null;
    title?: string | null;
    description?: string | null;
    categoryHints?: Array<string | null | undefined>;
  },
): {
  candidates: T[];
  rankedCandidates: RankedNikeFootwearImageCandidate[];
  selectedImageReason: typeof NIKE_FOOTWEAR_LEFT_PROFILE_REASON | null;
} {
  if (
    !isNikeProductUrlForImageRanking(context.sourceUrl) ||
    !isNikeFootwearProductText({
      title: context.title,
      description: context.description,
      categoryHints: context.categoryHints,
    })
  ) {
    return { candidates, rankedCandidates: [], selectedImageReason: null };
  }

  const rankedCandidates = rankNikeFootwearImages(candidates);
  const preferred = rankedCandidates.find((candidate) => candidate.isConfidentLeftProfile);
  if (!preferred) {
    return { candidates, rankedCandidates, selectedImageReason: null };
  }

  const byUrl = new Map(candidates.map((candidate) => [candidate.url, candidate]));
  const preferredUrls = new Set(
    rankedCandidates
      .filter((candidate) => candidate.isConfidentLeftProfile)
      .map((candidate) => candidate.url),
  );
  const preferredCandidates = rankedCandidates
    .filter((candidate) => preferredUrls.has(candidate.url))
    .map((candidate) => byUrl.get(candidate.url))
    .filter((candidate): candidate is T => !!candidate);
  const rest = candidates.filter((candidate) => !preferredUrls.has(candidate.url));

  return {
    candidates: [...preferredCandidates, ...rest],
    rankedCandidates,
    selectedImageReason: NIKE_FOOTWEAR_LEFT_PROFILE_REASON,
  };
}
