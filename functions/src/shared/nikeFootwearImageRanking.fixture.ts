import {
  NIKE_FOOTWEAR_LEFT_PROFILE_REASON,
  applyNikeFootwearImagePreference,
  rankNikeFootwearImages,
  type NikeFootwearImageCandidate,
} from "./nikeFootwearImageRanking";

type FixtureResult = {
  name: string;
  passed: boolean;
  details: Record<string, unknown>;
};

function fixtureCandidate(
  url: string,
  overrides: Partial<NikeFootwearImageCandidate> = {},
): NikeFootwearImageCandidate {
  return {
    url,
    sourceIndex: Number(overrides.sourceIndex ?? 0),
    baseScore: Number(overrides.baseScore ?? 80),
    hasFullProductVisible: true,
    width: Number(overrides.width ?? 1400),
    height: Number(overrides.height ?? 900),
    ...overrides,
  };
}

export function runNikeFootwearImageRankingFixture() {
  const leftProfile = fixtureCandidate(
    "https://static.nike.com/a/images/t_PDP_1728_v1/f_auto,q_auto:eco/air-max-left-facing-side-profile.png",
    {
      sourceIndex: 1,
      altText: "Nike Air Max left-facing side profile on white background",
      isSideProfileFootwear: true,
      toePointsLeft: true,
    },
  );
  const rightProfile = fixtureCandidate(
    "https://static.nike.com/a/images/t_PDP_1728_v1/f_auto,q_auto:eco/air-max-right-facing-side-profile.png",
    {
      sourceIndex: 0,
      altText: "Nike Air Max right-facing side profile on white background",
      isSideProfileFootwear: true,
      toePointsLeft: false,
    },
  );
  const onFoot = fixtureCandidate(
    "https://static.nike.com/a/images/t_PDP_1728_v1/f_auto,q_auto:eco/air-max-on-foot-lifestyle-model.png",
    {
      sourceIndex: 2,
      altText: "Nike Air Max on foot lifestyle model shot",
      isSideProfileFootwear: false,
      isModelImage: true,
      isLifestyleOrBanner: true,
    },
  );
  const soleDetail = fixtureCandidate(
    "https://static.nike.com/a/images/t_PDP_1728_v1/f_auto,q_auto:eco/air-max-outsole-detail-bottom.png",
    {
      sourceIndex: 3,
      altText: "Nike Air Max outsole detail bottom view",
      isSideProfileFootwear: false,
      isDetailCloseUp: true,
    },
  );

  const ranked = rankNikeFootwearImages([rightProfile, leftProfile, onFoot, soleDetail]);
  const preferred = applyNikeFootwearImagePreference([rightProfile, leftProfile, onFoot, soleDetail], {
    sourceUrl: "https://www.nike.com/t/air-max-mens-shoes-ABC123-001",
    title: "Nike Air Max Men's Shoes",
    description: "Men's shoes",
    categoryHints: ["Footwear", "Shoes"],
  });
  const nonNikeOriginal = [rightProfile, leftProfile];
  const nonNike = applyNikeFootwearImagePreference(nonNikeOriginal, {
    sourceUrl: "https://www.adidas.com/us/example-shoes",
    title: "Example Shoes",
    description: "Shoes",
    categoryHints: ["Footwear"],
  });

  const results: FixtureResult[] = [
    {
      name: "left-facing side profile ranks first",
      passed: ranked[0]?.url === leftProfile.url,
      details: {
        firstUrl: ranked[0]?.url,
        firstReasons: ranked[0]?.nikeFootwearReasons,
      },
    },
    {
      name: "right-facing profile loses to left-facing profile",
      passed:
        (ranked.findIndex((entry) => entry.url === leftProfile.url) ?? -1) <
        (ranked.findIndex((entry) => entry.url === rightProfile.url) ?? -1),
      details: {
        leftScore: ranked.find((entry) => entry.url === leftProfile.url)?.nikeFootwearScore,
        rightScore: ranked.find((entry) => entry.url === rightProfile.url)?.nikeFootwearScore,
      },
    },
    {
      name: "on-foot lifestyle image is penalized",
      passed: ranked.find((entry) => entry.url === onFoot.url)?.isRejectedNikeFootwearImage === true,
      details: {
        reasons: ranked.find((entry) => entry.url === onFoot.url)?.nikeFootwearReasons,
      },
    },
    {
      name: "sole detail image is penalized",
      passed: ranked.find((entry) => entry.url === soleDetail.url)?.isRejectedNikeFootwearImage === true,
      details: {
        reasons: ranked.find((entry) => entry.url === soleDetail.url)?.nikeFootwearReasons,
      },
    },
    {
      name: "non-Nike retailer order is unchanged",
      passed:
        nonNike.selectedImageReason === null &&
        nonNike.candidates[0]?.url === nonNikeOriginal[0]?.url &&
        nonNike.candidates[1]?.url === nonNikeOriginal[1]?.url,
      details: {
        selectedImageReason: nonNike.selectedImageReason,
        urls: nonNike.candidates.map((candidate) => candidate.url),
      },
    },
    {
      name: "Nike preference returns debug reason",
      passed:
        preferred.candidates[0]?.url === leftProfile.url &&
        preferred.selectedImageReason === NIKE_FOOTWEAR_LEFT_PROFILE_REASON,
      details: {
        selectedImageReason: preferred.selectedImageReason,
        firstUrl: preferred.candidates[0]?.url,
      },
    },
  ];

  return {
    passed: results.every((result) => result.passed),
    results,
  };
}
