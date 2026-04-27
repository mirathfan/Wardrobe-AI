export type HomeDeferredFeature = {
  key:
    | "shopping_card"
    | "favorites_card"
    | "soon_badges"
    | "feature_hub_presentation"
    | "separate_today_outfit_section";
  title: string;
  status: "deferred";
  summary: string;
  rationale: string;
};

// Intentional non-rendered record for future Home passes.
export const HOME_DEFERRED_FEATURES: HomeDeferredFeature[] = [
  {
    key: "shopping_card",
    title: "Shopping card on Home",
    status: "deferred",
    summary: "A dedicated shopping utility card was removed from the Home tools surface.",
    rationale: "Home now prioritizes deciding what to wear today before wish-list or gap-filling flows.",
  },
  {
    key: "favorites_card",
    title: "Favorites card on Home",
    status: "deferred",
    summary: "A dedicated favorites utility card was removed from the Home tools surface.",
    rationale: "Favorites can return later if they support daily styling momentum without competing with the hero.",
  },
  {
    key: "soon_badges",
    title: "Soon badges on Home",
    status: "deferred",
    summary: "Visible coming-soon labels were removed from Home UI.",
    rationale: "The current direction avoids roadmap clutter and keeps Home production-usable.",
  },
  {
    key: "feature_hub_presentation",
    title: "Older feature-hub presentation",
    status: "deferred",
    summary: "The broader dashboard / feature-hub framing was replaced by a styling-first hierarchy.",
    rationale: "Utilities remain useful, but they are intentionally secondary to today's outfit flow.",
  },
  {
    key: "separate_today_outfit_section",
    title: "Separate TodayOutfitCard-style top section",
    status: "deferred",
    summary: "A standalone Today outfit section above the fold was folded into the main hero.",
    rationale: "The hero now owns the daily-styling job to avoid duplicate top-of-screen competition.",
  },
];
