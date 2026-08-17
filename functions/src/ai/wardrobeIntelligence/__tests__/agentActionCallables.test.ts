import {
  handleDislikeAuraAgentOutfit,
  handleLogAuraAgentOutfitWear,
  handlePlanAuraAgentOutfit,
  handleSaveAuraAgentOutfit,
} from "../agentActionCallables";

function outfitPayload() {
  return {
    outfitId: "outfit-1",
    title: "Polished Blue & Black",
    vibe: "clean",
    occasion: "office",
    formality: "smart_casual",
    explanation: "A light shirt, black trousers, and loafers feel polished.",
    stylingTips: ["Keep accessories simple."],
    missingItems: [],
    scoreBreakdown: { total: 1 },
    diagnostics: { debug: true },
    items: [
      {
        itemId: "shirt-1",
        role: "top",
        name: "Blue shirt",
        category: "shirt",
        colors: ["blue"],
        imageUrl: null,
        aiMetadata: { debug: true },
        embeddingVector: [0.1, 0.2],
      },
      {
        itemId: "pants-1",
        role: "bottom",
        name: "Black trousers",
        category: "trousers",
        colors: ["black"],
        imageUrl: null,
      },
      {
        itemId: "shoe-1",
        role: "footwear",
        name: "Black loafers",
        category: "shoes",
        colors: ["black"],
        imageUrl: "https://example.com/shoe.png",
      },
    ],
  };
}

describe("agent action callables", () => {
  it("requires auth for save actions", async () => {
    await expect(handleSaveAuraAgentOutfit(undefined, {
      outfit: outfitPayload(),
    })).rejects.toThrow("Please sign in first.");
  });

  it("saves a lightweight outfit record and records save memory once", async () => {
    const savedWrites: Record<string, unknown>[] = [];
    const outfitEventWrites: Record<string, unknown>[] = [];
    const feedbackWrites: unknown[] = [];
    const result = await handleSaveAuraAgentOutfit("uid", {
      outfit: outfitPayload(),
      query: "Give me 3 outfits for office",
      sourceMessageId: "message-1",
      agentRunId: "run-1",
    }, {
      now: () => new Date("2026-06-01T12:00:00.000Z"),
      getSavedOutfit: async () => null,
      setSavedOutfit: async (_uid, _id, payload) => {
        savedWrites.push(payload);
      },
      setOutfitEvent: async (_uid, _id, payload) => {
        outfitEventWrites.push(payload);
      },
      recordFeedback: async (_uid, input) => {
        feedbackWrites.push(input);
      },
    });

    expect(result).toMatchObject({
      saved: true,
      alreadySaved: false,
      savedOutfitId: expect.stringMatching(/^aura_agent_/),
    });
    expect(savedWrites).toHaveLength(1);
    expect(outfitEventWrites).toHaveLength(1);
    expect(feedbackWrites).toHaveLength(1);
    expect(JSON.stringify(savedWrites[0])).not.toContain("scoreBreakdown");
    expect(JSON.stringify(savedWrites[0])).not.toContain("embeddingVector");
    expect(JSON.stringify(savedWrites[0])).not.toContain("aiMetadata");
    expect(savedWrites[0]).toMatchObject({
      source: "aura_agent",
      sourceQuery: "Give me 3 outfits for office",
      itemIds: ["shirt-1", "pants-1", "shoe-1"],
      savedAtMs: Date.parse("2026-06-01T12:00:00.000Z"),
    });
  });

  it("dedupes saved outfits by fingerprint without duplicate memory", async () => {
    const result = await handleSaveAuraAgentOutfit("uid", {
      outfit: outfitPayload(),
    }, {
      getSavedOutfit: async () => ({ id: "existing" }),
      setSavedOutfit: async () => {
        throw new Error("should not write duplicate");
      },
      recordFeedback: async () => {
        throw new Error("should not record duplicate feedback");
      },
    });

    expect(result).toMatchObject({
      saved: true,
      alreadySaved: true,
    });
  });

  it("logs a wear event, updates closet item wear metadata, and records wear memory", async () => {
    const wearWrites: Record<string, unknown>[] = [];
    const outfitEventWrites: Record<string, unknown>[] = [];
    const feedbackWrites: unknown[] = [];
    const wearMetadataWrites: { itemIds: string[]; date: Date }[] = [];
    const result = await handleLogAuraAgentOutfitWear("uid", {
      outfit: outfitPayload(),
      query: "office outfit",
      dateKey: "2026-05-31",
    }, {
      getWearEvent: async () => null,
      setWearEvent: async (_uid, _id, payload) => {
        wearWrites.push(payload);
      },
      setOutfitEvent: async (_uid, _id, payload) => {
        outfitEventWrites.push(payload);
      },
      updateWearMetadata: async (_uid, itemIds, date) => {
        wearMetadataWrites.push({ itemIds, date });
      },
      recordFeedback: async (_uid, input) => {
        feedbackWrites.push(input);
      },
    });

    expect(result).toMatchObject({
      logged: true,
      alreadyLogged: false,
      wearEventId: expect.stringContaining("2026-05-31"),
      dateKey: "2026-05-31",
    });
    expect(wearWrites).toHaveLength(1);
    expect(outfitEventWrites).toHaveLength(1);
    expect(feedbackWrites).toHaveLength(1);
    expect(wearMetadataWrites).toEqual([
      {
        itemIds: ["shirt-1", "pants-1", "shoe-1"],
        date: new Date("2026-05-31T12:00:00.000Z"),
      },
    ]);
    expect(wearWrites[0]).toMatchObject({
      source: "aura_agent",
      dateKey: "2026-05-31",
      itemIds: ["shirt-1", "pants-1", "shoe-1"],
      wornAt: Date.parse("2026-05-31T12:00:00.000Z"),
    });
    expect(outfitEventWrites[0]).toMatchObject({
      type: "worn",
      status: "worn",
      dateKey: "2026-05-31",
      outfitFingerprint: expect.any(String),
    });
  });

  it("plans a calendar-visible outfit with deterministic weather warnings", async () => {
    const outfitEventWrites: Record<string, unknown>[] = [];
    const dailyWrites: Record<string, unknown>[] = [];
    const result = await handlePlanAuraAgentOutfit("uid", {
      outfit: {
        ...outfitPayload(),
        items: [
          ...outfitPayload().items,
          {
            itemId: "suede-shoe",
            role: "footwear",
            name: "Brown suede loafers",
            category: "shoes",
            colors: ["brown"],
            imageUrl: null,
          },
        ],
      },
      query: "Save this for Friday",
      dateKey: "2026-06-05",
      weatherContext: {
        dateKey: "2026-06-05",
        condition: "Rain",
        precipitationChance: 80,
        temperatureLow: 4,
      },
    }, {
      getOutfitEvent: async () => null,
      setOutfitEvent: async (_uid, _id, payload) => {
        outfitEventWrites.push(payload);
      },
      setDailyOutfit: async (_uid, _dateKey, payload) => {
        dailyWrites.push(payload);
      },
    });

    expect(result).toMatchObject({
      planned: true,
      alreadyPlanned: false,
      dateKey: "2026-06-05",
      weatherWarnings: expect.arrayContaining([
        expect.objectContaining({ severity: "warning" }),
      ]),
    });
    expect(outfitEventWrites[0]).toMatchObject({
      type: "planned",
      status: "planned",
      dateKey: "2026-06-05",
      weatherWarnings: expect.any(Array),
    });
    expect(dailyWrites[0]).toMatchObject({
      dateKey: "2026-06-05",
      planned: true,
      plannedOutfit: expect.objectContaining({
        source: "aura_agent",
        title: "Polished Blue & Black",
        weatherWarnings: expect.any(Array),
      }),
    });
  });

  it("dedupes planned events by fingerprint and date", async () => {
    const result = await handlePlanAuraAgentOutfit("uid", {
      outfit: outfitPayload(),
      dateKey: "2026-06-05",
    }, {
      getOutfitEvent: async () => ({ id: "existing" }),
      setDailyOutfit: async () => {
        throw new Error("should not write duplicate daily plan");
      },
      setOutfitEvent: async () => {
        throw new Error("should not create duplicate planned event");
      },
    });

    expect(result).toMatchObject({
      planned: true,
      alreadyPlanned: true,
      dateKey: "2026-06-05",
    });
  });

  it("saves disliked outfits and visible outfit feedback with negative memory", async () => {
    const dislikedWrites: Record<string, unknown>[] = [];
    const feedbackLooks: Record<string, unknown>[] = [];
    const memoryWrites: unknown[] = [];
    const result = await handleDislikeAuraAgentOutfit("uid", {
      outfit: outfitPayload(),
      query: "not my vibe",
    }, {
      getDislikedOutfit: async () => null,
      setDislikedOutfit: async (_uid, _id, payload) => {
        dislikedWrites.push(payload);
      },
      setOutfitFeedback: async (_uid, _id, payload) => {
        feedbackLooks.push(payload);
      },
      setOutfitEvent: async () => undefined,
      recordFeedback: async (_uid, input) => {
        memoryWrites.push(input);
      },
    });

    expect(result).toMatchObject({
      disliked: true,
      alreadyDisliked: false,
    });
    expect(dislikedWrites[0]).toMatchObject({
      type: "disliked",
      active: true,
      itemIds: ["shirt-1", "pants-1", "shoe-1"],
    });
    expect(feedbackLooks[0]).toMatchObject({
      feedbackType: "outfit_disliked",
      itemIds: ["shirt-1", "pants-1", "shoe-1"],
    });
    expect(memoryWrites[0]).toMatchObject({
      feedbackType: "not_my_vibe",
      selectedItemIds: ["shirt-1", "pants-1", "shoe-1"],
    });
  });
});
