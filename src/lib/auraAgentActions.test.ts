import {
  auraAgentActionStateKey,
  buildAuraAgentActionRequest,
  buildAuraAgentInitialRequest,
  decorateAuraAgentActionForState,
  extractRequestedOutfitCount,
  shouldRouteToAuraStylingAgent,
} from "@/src/lib/auraAgentActions";
import type { AuraAgentOutfit, AuraAgentSuggestedAction } from "@/src/types/auraAgent";

const outfit: AuraAgentOutfit = {
  outfitId: "outfit-1",
  title: "Office neutrals",
  vibe: "clean",
  occasion: "office",
  formality: "business_casual",
  items: [
    {
      itemId: "shirt-1",
      role: "top",
      reason: "Balances the trousers.",
      name: "White oxford",
      category: "top",
      colors: ["white"],
      imageUrl: null,
    },
    {
      itemId: "shoe-1",
      role: "footwear",
      reason: "Keeps it polished.",
      name: "Black loafers",
      category: "footwear",
      colors: ["black"],
      imageUrl: null,
    },
  ],
  explanation: "The outfit keeps contrast simple.",
  stylingTips: ["Keep accessories minimal."],
  missingItems: [],
  confidence: 0.82,
};

describe("aura agent action helpers", () => {
  it("extracts requested outfit counts from natural language prompts", () => {
    expect(extractRequestedOutfitCount("give me 3 outfits for office")).toBe(3);
    expect(extractRequestedOutfitCount("Give me 3 outfits for a date")).toBe(3);
    expect(extractRequestedOutfitCount("show me three looks")).toBe(3);
    expect(extractRequestedOutfitCount("give me two options")).toBe(2);
    expect(extractRequestedOutfitCount("a couple outfits for dinner")).toBe(2);
    expect(extractRequestedOutfitCount("a few outfits")).toBe(3);
    expect(extractRequestedOutfitCount("give me 8 outfits")).toBe(5);
    expect(extractRequestedOutfitCount("style me today")).toBeUndefined();
    expect(extractRequestedOutfitCount("office outfit with black shoes")).toBeUndefined();
  });

  it("routes styling and refinement prompts only when the feature flag is enabled", () => {
    expect(
      shouldRouteToAuraStylingAgent({
        enabled: false,
        prompt: "style me today",
        attachmentCount: 0,
        chatIntent: "GENERATE_OUTFIT",
      }),
    ).toBe(false);
    expect(
      shouldRouteToAuraStylingAgent({
        enabled: true,
        prompt: "style me today",
        attachmentCount: 0,
        chatIntent: "GENERATE_OUTFIT",
      }),
    ).toBe(true);
    expect(
      shouldRouteToAuraStylingAgent({
        enabled: true,
        prompt: "explain why this works",
        attachmentCount: 1,
        chatIntent: "GENERAL_CHAT",
        hasPreviousOutfit: true,
      }),
    ).toBe(false);
  });

  it("builds a refine request with previous outfit context", () => {
    const action: AuraAgentSuggestedAction = {
      id: "refine-less-formal",
      label: "Make it less formal",
      type: "refine",
      payload: { mode: "refine_outfit", query: "make it less formal" },
    };
    const request = buildAuraAgentActionRequest({ action, outfit });
    expect(request).toMatchObject({
      mode: "refine_outfit",
      query: "make it less formal",
      outfitId: "outfit-1",
      selectedItemIds: ["shirt-1", "shoe-1"],
    });
    expect(request?.previousOutfit).toMatchObject({
      outfitId: "outfit-1",
      title: "Office neutrals",
    });
  });

  it("builds feedback requests for save and wear actions", () => {
    const request = buildAuraAgentActionRequest({
      action: {
        id: "agent-wear-feedback",
        label: "Wore This",
        type: "feedback",
        payload: { mode: "feedback", feedbackType: "wear" },
      },
      outfit,
    });
    expect(request).toMatchObject({
      mode: "feedback",
      feedbackType: "wear",
      outfitId: "outfit-1",
    });
  });

  it("tracks production action state keys and completed labels", () => {
    const saveAction: AuraAgentSuggestedAction = {
      id: "agent-save-preference",
      label: "Save Preference",
      type: "feedback",
      payload: { mode: "feedback", feedbackType: "save" },
    };
    const moreAction: AuraAgentSuggestedAction = {
      id: "agent-more-like-this",
      label: "More Like This",
      type: "feedback",
      payload: { mode: "feedback", feedbackType: "more_like_this" },
    };
    const dislikeAction: AuraAgentSuggestedAction = {
      id: "agent-not-my-vibe",
      label: "Not My Vibe",
      type: "feedback",
      payload: { mode: "feedback", feedbackType: "not_my_vibe" },
    };
    const planAction: AuraAgentSuggestedAction = {
      id: "agent-plan-outfit",
      label: "Plan this",
      type: "feedback",
      payload: { mode: "feedback", feedbackType: "manual_note", action: "plan_outfit" },
    };

    expect(auraAgentActionStateKey(saveAction)).toBe("saved");
    expect(auraAgentActionStateKey(moreAction)).toBe("moreLikeThis");
    expect(auraAgentActionStateKey(dislikeAction)).toBe("notMyVibe");
    expect(auraAgentActionStateKey(planAction)).toBe("planned");
    expect(decorateAuraAgentActionForState(saveAction, { saved: true })).toMatchObject({
      label: "Saved",
      disabled: true,
    });
    expect(decorateAuraAgentActionForState(moreAction, { moreLikeThis: true })).toMatchObject({
      label: "Preference saved",
      disabled: true,
    });
    expect(decorateAuraAgentActionForState(dislikeAction, { notMyVibe: true })).toMatchObject({
      label: "Noted",
      disabled: true,
    });
    expect(decorateAuraAgentActionForState(planAction, { planned: true })).toMatchObject({
      label: "Planned",
      disabled: true,
    });
  });

  it("builds selected-outfit requests for More Like This and Different Shoes", () => {
    const moreLikeThis = buildAuraAgentActionRequest({
      action: {
        id: "agent-more-like-this",
        label: "More Like This",
        type: "feedback",
        payload: { mode: "feedback", feedbackType: "more_like_this" },
      },
      outfit,
    });
    const differentShoes = buildAuraAgentActionRequest({
      action: {
        id: "agent-different-shoes",
        label: "Different shoes",
        type: "refine",
        payload: { mode: "refine_outfit", query: "Different shoes" },
      },
      outfit,
    });

    expect(moreLikeThis).toMatchObject({
      mode: "feedback",
      feedbackType: "more_like_this",
      outfitId: "outfit-1",
      selectedItemIds: ["shirt-1", "shoe-1"],
    });
    expect(differentShoes).toMatchObject({
      mode: "refine_outfit",
      query: "Different shoes",
      outfitId: "outfit-1",
      selectedItemIds: ["shirt-1", "shoe-1"],
    });
    expect(differentShoes?.previousOutfit).toMatchObject({ outfitId: "outfit-1" });
  });

  it("includes prior outfit context for explanation follow-ups", () => {
    const request = buildAuraAgentInitialRequest({
      prompt: "explain why this outfit works",
      chatIntent: "GENERAL_CHAT",
      previousAgentOutfit: outfit,
    });
    expect(request.mode).toBe("explain_outfit");
    expect(request.previousOutfit).toMatchObject({ outfitId: "outfit-1" });
  });

  it("passes requested outfit count through initial generation requests", () => {
    const request = buildAuraAgentInitialRequest({
      prompt: "Give me 3 outfits for a date",
      chatIntent: "GENERATE_OUTFIT",
    });

    expect(request).toMatchObject({
      mode: "generate_outfit",
      query: "Give me 3 outfits for a date",
      count: 3,
    });
  });

  it("defaults initial generation requests to one outfit when no count is requested", () => {
    const request = buildAuraAgentInitialRequest({
      prompt: "style me today",
      chatIntent: "GENERATE_OUTFIT",
    });

    expect(request.count).toBe(1);
  });
});
