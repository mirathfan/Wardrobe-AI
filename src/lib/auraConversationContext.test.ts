import {
  buildAuraAgentConversationContext,
  buildAuraConversationContext,
} from "@/src/lib/auraConversationContext";
import type { AIMessage } from "@/src/components/ai/chatTypes";

function message(overrides: Partial<AIMessage>): AIMessage {
  return {
    id: overrides.id ?? `msg-${Math.random()}`,
    type: overrides.type ?? "user",
    text: overrides.text,
    createdAt: overrides.createdAt ?? Date.now(),
    ...overrides,
  };
}

describe("buildAuraConversationContext", () => {
  it("keeps recent user and assistant messages with outfit-card context", () => {
    const context = buildAuraConversationContext([
      message({ id: "u1", type: "user", text: "Give me an outfit for a hotel date" }),
      message({
        id: "a1",
        type: "assistant",
        kind: "aura_card",
        assistantIntroText: "Got you - keeping it polished for the hotel date.",
        aura: {
          presentation: "card",
          title: "Hotel Date",
          reply: "This keeps the date vibe polished.",
          reason: "",
          outfitItems: [],
          swapSuggestion: "",
          chips: [],
          lookOptions: [
            {
              lookTitle: "Loafer Date Night",
              occasion: "date_night",
              vibe: "polished hotel date",
              shortExplanation: "",
              stylingNote: "",
              personalizationLabel: "clean_luxury",
              stylingIntelligence: {
                overallScore: 88,
                fitScore: 88,
                colorScore: 88,
                styleScore: 88,
                occasionFit: 91,
                scoreLabel: "Strong",
                styleIdentity: "date_night",
                paletteLabel: "dark neutral",
                silhouetteLabel: "tailored",
              },
              pieces: [
                {
                  role: "bottom",
                  itemName: "Black trousers",
                  source: "closet",
                  itemId: "pants-1",
                  imageUrl: null,
                },
                {
                  role: "shoes",
                  itemName: "Black loafers",
                  source: "closet",
                  itemId: "shoe-1",
                  imageUrl: null,
                },
              ],
              fromCloset: ["Black trousers", "Black loafers"],
              addToComplete: ["silver watch"],
              alternates: [],
              actions: [],
            },
          ],
        },
      }),
    ]);

    expect(context).toHaveLength(2);
    expect(context[0]).toEqual({
      role: "user",
      text: "Give me an outfit for a hotel date",
    });
    expect(context[1].role).toBe("assistant");
    expect(context[1].text).toContain("Rendered outfit-card context for follow-ups");
    expect(context[1].text).toContain("Occasion: date_night");
    expect(context[1].text).toContain("Vibe: polished hotel date");
    expect(context[1].text).toContain("Loafer Date Night");
    expect(context[1].text).toContain("Missing or suggested pieces: silver watch");
  });

  it("limits context to the last twelve relevant chat messages", () => {
    const messages = Array.from({ length: 14 }, (_, index) =>
      message({
        id: `u${index}`,
        type: "user",
        text: `Message ${index}`,
        createdAt: index,
      }),
    );

    const context = buildAuraConversationContext(messages);

    expect(context).toHaveLength(12);
    expect(context[0].text).toBe("Message 2");
    expect(context[11].text).toBe("Message 13");
  });

  it("builds bounded structured agent context with selected outfit and feedback", () => {
    const context = buildAuraAgentConversationContext([
      message({ id: "u1", type: "user", text: "Give me 3 outfits for a date" }),
      message({
        id: "a1",
        type: "assistant",
        kind: "aura_agent",
        text: "I found 3 options.",
        agentActionStates: {
          "outfit-2": { moreLikeThis: true, updatedAt: 1 },
          "outfit-3": { notMyVibe: true, updatedAt: 2 },
        },
        agentResponse: {
          mode: "generate_outfit",
          intent: {
            mode: "generate_outfit",
            query: "date",
            normalizedQuery: "date",
            confidence: 1,
            reason: "test",
            constraints: {
              formality: "smart_casual",
              preferredColors: [],
              requiredColors: [],
              requiredCategories: [],
              styleHints: [],
              avoidItemIds: [],
              avoidCategories: [],
              avoidTerms: [],
              selectedItemIds: [],
            },
          },
          message: "I found 3 options.",
          suggestedActions: [],
          outfits: [
            {
              outfitId: "outfit-1",
              title: "Date one",
              vibe: "polished",
              occasion: "dinner",
              formality: "smart_casual",
              items: [
                { itemId: "shirt-1", role: "top", reason: "", name: "Shirt", category: "top", colors: [], imageUrl: null },
                { itemId: "pants-1", role: "bottom", reason: "", name: "Pants", category: "bottom", colors: [], imageUrl: null },
              ],
              explanation: "",
              stylingTips: [],
              missingItems: [],
              confidence: 0.8,
            },
            {
              outfitId: "outfit-2",
              title: "Date two",
              vibe: "casual polish",
              occasion: "dinner",
              formality: "smart_casual",
              items: [
                { itemId: "cargo-1", role: "bottom", reason: "", name: "Black cargos", category: "bottom", colors: ["black"], imageUrl: null },
                { itemId: "shoe-1", role: "footwear", reason: "", name: "Loafers", category: "footwear", colors: ["black"], imageUrl: null },
              ],
              explanation: "",
              stylingTips: [],
              missingItems: [],
              confidence: 0.82,
            },
          ],
        },
      }),
    ], {
      selectedOutfit: {
        outfitId: "outfit-2",
        title: "Date two",
        vibe: "casual polish",
        occasion: "dinner",
        formality: "smart_casual",
        items: [
          { itemId: "cargo-1", role: "bottom", reason: "", name: "Black cargos", category: "bottom", colors: ["black"], imageUrl: null },
          { itemId: "shoe-1", role: "footwear", reason: "", name: "Loafers", category: "footwear", colors: ["black"], imageUrl: null },
        ],
        explanation: "",
        stylingTips: [],
        missingItems: [],
        confidence: 0.82,
      },
      selectedItemIds: ["manual-anchor"],
    });

    expect(context?.recentTurns).toHaveLength(2);
    expect(context?.selectedOutfitId).toBe("outfit-2");
    expect(context?.selectedItemIds).toEqual(["manual-anchor", "cargo-1", "shoe-1"]);
    expect(context?.priorOutfitRefs.map((entry) => entry.outfitId)).toEqual(["outfit-1", "outfit-2"]);
    expect(context?.priorOutfitRefs[1].index).toBe(2);
    expect(context?.feedbackSignals).toEqual(expect.arrayContaining([
      "positive feedback: more like outfit outfit-2",
      "negative feedback: avoid outfit outfit-3",
    ]));
  });
});
