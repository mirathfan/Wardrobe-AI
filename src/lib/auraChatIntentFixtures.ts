import type { AIMessage } from "@/src/components/ai/chatTypes";
import {
  classifyAuraChatIntent,
  wantsStructuredOutfitRequest,
} from "@/src/lib/auraChatHelpers";

export type AuraChatIntentFixture = {
  prompt: string;
  hasPreviousLook?: boolean;
  hasRecentItemAnchor?: boolean;
  expectedIntent: ReturnType<typeof classifyAuraChatIntent>;
  expectedStructuredOutfit: boolean;
};

export const AURA_CHAT_INTENT_FIXTURES: AuraChatIntentFixture[] = [
  {
    prompt: "what should I wear today?",
    expectedIntent: "GENERATE_OUTFIT",
    expectedStructuredOutfit: true,
  },
  {
    prompt: "style this item",
    hasRecentItemAnchor: true,
    expectedIntent: "GENERATE_OUTFIT",
    expectedStructuredOutfit: true,
  },
  {
    prompt: "style this item",
    expectedIntent: "STYLE_EXISTING",
    expectedStructuredOutfit: false,
  },
  {
    prompt: "make this outfit better",
    hasPreviousLook: true,
    expectedIntent: "MODIFY_OUTFIT",
    expectedStructuredOutfit: true,
  },
  {
    prompt: "give me another version",
    hasPreviousLook: true,
    expectedIntent: "GENERATE_MORE",
    expectedStructuredOutfit: true,
  },
  {
    prompt: "switch the shoes",
    hasPreviousLook: true,
    expectedIntent: "MODIFY_OUTFIT",
    expectedStructuredOutfit: true,
  },
  {
    prompt: "nah too loud, something cleaner",
    hasPreviousLook: true,
    expectedIntent: "MODIFY_OUTFIT",
    expectedStructuredOutfit: true,
  },
  {
    prompt: "what should I wear for a first date?",
    expectedIntent: "GENERATE_OUTFIT",
    expectedStructuredOutfit: true,
  },
  {
    prompt: "complete this look",
    hasRecentItemAnchor: true,
    expectedIntent: "GENERATE_OUTFIT",
    expectedStructuredOutfit: true,
  },
  {
    prompt: "thanks",
    expectedIntent: "GENERAL_CHAT",
    expectedStructuredOutfit: false,
  },
];

function fixtureMessages(hasPreviousLook?: boolean): AIMessage[] {
  if (!hasPreviousLook) return [];
  return [{
    id: "fixture-look",
    type: "assistant",
    kind: "aura_card",
    text: "Fixture look",
    createdAt: 1,
    aura: {
      title: "Fixture",
      presentation: "card",
      reply: "Fixture",
      reason: "",
      outfitItems: [],
      ownedPieces: [],
      recommendedAdditions: [],
      swapSuggestion: "",
      chips: [],
      look: {
        id: "fixture-look",
        lookTitle: "Fixture look",
        vibe: "fixture",
        shortExplanation: "Fixture look.",
        pieces: [
          { role: "top", itemName: "White tee", source: "closet", itemId: "top-1" },
          { role: "bottom", itemName: "Blue jeans", source: "closet", itemId: "bottom-1" },
          { role: "shoes", itemName: "White sneakers", source: "closet", itemId: "shoe-1" },
        ],
        fromCloset: ["White tee", "Blue jeans", "White sneakers"],
        addToComplete: [],
        alternates: [],
        actions: [],
      },
    },
  }];
}

export function evaluateAuraChatIntentFixtures() {
  return AURA_CHAT_INTENT_FIXTURES.map((fixture) => {
    const messages = fixtureMessages(fixture.hasPreviousLook);
    const intent = classifyAuraChatIntent(fixture.prompt, {
      hasPreviousLook: fixture.hasPreviousLook,
      hasRecentItemAnchor: fixture.hasRecentItemAnchor,
    });
    const structuredOutfit = wantsStructuredOutfitRequest(
      fixture.prompt,
      0,
      messages,
      { hasRecentItemAnchor: fixture.hasRecentItemAnchor },
    );
    return {
      ...fixture,
      actualIntent: intent,
      actualStructuredOutfit: structuredOutfit,
      pass:
        intent === fixture.expectedIntent &&
        structuredOutfit === fixture.expectedStructuredOutfit,
    };
  });
}
