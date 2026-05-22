import {isConcreteOutfitIntent} from "./auraConcreteLook";

export type AuraConcreteLookIntentFixture = {
  message: string;
  hasContext?: boolean;
  expectedConcreteLookIntent: boolean;
};

export const AURA_CONCRETE_LOOK_INTENT_FIXTURES: AuraConcreteLookIntentFixture[] = [
  {
    message: "Suggest an outfit",
    expectedConcreteLookIntent: true,
  },
  {
    message: "style this item",
    expectedConcreteLookIntent: true,
  },
  {
    message: "make this outfit better",
    expectedConcreteLookIntent: true,
  },
  {
    message: "complete this look",
    expectedConcreteLookIntent: true,
  },
  {
    message: "what shoes should I wear?",
    expectedConcreteLookIntent: true,
  },
  {
    message: "thanks",
    expectedConcreteLookIntent: false,
  },
];

export function evaluateAuraConcreteLookIntentFixtures() {
  return AURA_CONCRETE_LOOK_INTENT_FIXTURES.map((fixture) => {
    const actual = isConcreteOutfitIntent(
      fixture.message,
      fixture.hasContext ?? false,
    );
    return {
      ...fixture,
      actualConcreteLookIntent: actual,
      pass: actual === fixture.expectedConcreteLookIntent,
    };
  });
}
