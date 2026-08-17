jest.mock("@/src/lib/firebase", () => ({
  db: {},
}));

jest.mock("firebase/firestore", () => ({
  doc: jest.fn(),
  onSnapshot: jest.fn(),
}));

import {
  EARLY_ACCESS_BACKEND_ERRORS,
  EARLY_ACCESS_LIMITED_PREVIEW,
  earlyAccessFeatureLabel,
} from "@/src/lib/earlyAccess";

describe("early access UI copy", () => {
  it("uses neutral wording for unavailable features", () => {
    const forbidden = [
      "power" + " user",
      "standard" + " user",
      "selected" + " tester",
      "limited" + " group",
      "not" + " allowed",
      "no" + " access",
    ];
    const visibleCopy = [
      EARLY_ACCESS_LIMITED_PREVIEW.title,
      EARLY_ACCESS_LIMITED_PREVIEW.body,
      EARLY_ACCESS_LIMITED_PREVIEW.cta,
      EARLY_ACCESS_BACKEND_ERRORS.featureNotAvailable.message,
      EARLY_ACCESS_BACKEND_ERRORS.limitReached.message,
      earlyAccessFeatureLabel("aiPolish", 3),
      earlyAccessFeatureLabel("outfitExtraction", 2),
    ].join("\n").toLowerCase();

    for (const phrase of forbidden) {
      expect(visibleCopy).not.toContain(phrase);
    }
  });
});
