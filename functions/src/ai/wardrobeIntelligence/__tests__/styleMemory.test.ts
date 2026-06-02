import { HttpsError } from "firebase-functions/v2/https";
import {
  buildStyleMemoryEmbeddingText,
  buildStyleMemoriesFromFeedback,
  buildStyleProfileFromMemories,
  defaultStyleProfile,
  inferMemoryOccasionFromQuery,
  outfitStyleMemoryContextFromResponse,
  recordStyleMemoryFeedback,
  retrieveStyleMemoryContextForUser,
  serializeStyleMemoryForClient,
  styleMemoryFingerprint,
} from "../styleMemory";
import {
  handleDeleteStyleMemory,
  handleGetStyleProfile,
  handleListStyleMemories,
  handleRecordOutfitFeedback,
  handleSoftDeleteAllStyleMemories,
} from "../styleMemoryCallables";
import type { StyleMemory, StyleMemoryFeedbackInput, StyleProfile } from "../styleMemoryTypes";

function outfit() {
  return {
    outfitId: "outfit-1",
    title: "Office fit",
    items: [
      {
        itemId: "polo",
        role: "top",
        allowedRole: "top",
        category: "top",
        name: "Navy knit polo",
        colors: ["navy"],
        brand: "AURA",
        aiMetadata: {
          category: "top",
          styleTags: ["smart casual", "minimal"],
          fit: "regular",
          material: "cotton",
        },
      },
      {
        itemId: "loafers",
        role: "footwear",
        allowedRole: "footwear",
        category: "footwear",
        name: "Black leather loafers",
        colors: ["black"],
        aiMetadata: {
          category: "shoes",
          styleTags: ["classic"],
          material: "leather",
        },
      },
    ],
    scoreBreakdown: {},
  };
}

function streetwearOutfit() {
  return {
    outfitId: "outfit-streetwear",
    title: "Streetwear fit",
    items: [
      {
        itemId: "jersey",
        role: "top",
        allowedRole: "top",
        category: "top",
        subcategory: "football shirt",
        name: "Red graphic football jersey",
        colors: ["red"],
        brand: "AURA",
        aiMetadata: {
          category: "top",
          subcategory: "football shirt",
          styleTags: ["streetwear", "graphic", "jersey"],
          fit: "oversized",
          material: "polyester",
        },
      },
      {
        itemId: "baggy-jeans",
        role: "bottom",
        allowedRole: "bottom",
        category: "bottom",
        subcategory: "baggy jeans",
        name: "Baggy denim jeans",
        colors: ["blue"],
        aiMetadata: {
          category: "bottom",
          subcategory: "baggy jeans",
          styleTags: ["streetwear"],
          fit: "baggy",
          material: "denim",
        },
      },
      {
        itemId: "logo-cap",
        role: "accessory",
        allowedRole: "accessory",
        category: "accessory",
        subcategory: "logo cap",
        name: "Mole cotton twill logo cap",
        colors: ["black"],
        aiMetadata: {
          category: "accessory",
          subcategory: "logo cap",
          styleTags: ["streetwear", "logo"],
          fit: "regular",
          material: "cotton",
        },
      },
    ],
    scoreBreakdown: {},
  };
}

function input(feedbackType: StyleMemoryFeedbackInput["feedbackType"], overrides: Partial<StyleMemoryFeedbackInput> = {}): StyleMemoryFeedbackInput {
  return {
    query: "office outfit",
    occasion: "office",
    formality: "smart_casual",
    outfit: outfit(),
    outfitId: "outfit-1",
    feedbackType,
    ...overrides,
  };
}

function memoryFrom(
  feedbackType: StyleMemoryFeedbackInput["feedbackType"],
  uid = "uid",
  overrides: Partial<StyleMemoryFeedbackInput> = {},
): StyleMemory {
  const draft = buildStyleMemoriesFromFeedback(input(feedbackType, overrides))[0];
  const id = styleMemoryFingerprint(uid, draft);
  return {
    ...draft,
    id,
    userId: uid,
    fingerprint: id,
    reinforcementCount: 1,
    embeddingText: draft.text,
    embeddingHash: "hash",
    embeddingModel: "test",
    embeddingDimensions: 3,
    active: true,
  };
}

function memoryStore() {
  const memories = new Map<string, StyleMemory>();
  let profile: StyleProfile | null = null;
  return {
    memories,
    get profile() {
      return profile;
    },
    deps: {
      createEmbedding: async () => [0.1, 0.2, 0.3],
      getMemory: async (_uid: string, id: string) => memories.get(id) ?? null,
      createMemory: async (_uid: string, memory: StyleMemory) => {
        memories.set(memory.id, memory);
      },
      updateMemory: async (_uid: string, id: string, patch: Partial<StyleMemory>) => {
        const existing = memories.get(id);
        if (!existing) throw new Error(`Missing memory ${id}`);
        memories.set(id, { ...existing, ...patch });
      },
      listActiveMemories: async () => [...memories.values()].filter((memory) => memory.active !== false),
      writeStyleProfile: async (_uid: string, nextProfile: StyleProfile) => {
        profile = nextProfile;
      },
    },
  };
}

describe("buildStyleMemoriesFromFeedback", () => {
  it("creates positive memories for likes", () => {
    const drafts = buildStyleMemoriesFromFeedback(input("like"));
    expect(drafts[0]).toMatchObject({
      polarity: "positive",
      type: "positive_preference",
      strength: 3,
    });
    expect(drafts[0].text).toContain("likes");
  });

  it("creates negative memories for dislikes", () => {
    const drafts = buildStyleMemoriesFromFeedback(input("dislike"));
    expect(drafts[0]).toMatchObject({
      polarity: "negative",
      type: "negative_preference",
      strength: 3,
    });
  });

  it("creates formality preference memories for too formal", () => {
    const drafts = buildStyleMemoriesFromFeedback(input("too_formal"));
    expect(drafts[0]).toMatchObject({
      polarity: "negative",
      type: "formality_preference",
    });
    expect(drafts[0].text).toContain("less formal");
  });

  it("creates streetwear preference memories", () => {
    const drafts = buildStyleMemoriesFromFeedback(input("more_streetwear"));
    expect(drafts[0].entities.styleTags).toContain("streetwear");
  });

  it("creates item-level avoidance memories", () => {
    const drafts = buildStyleMemoriesFromFeedback(input("like", {
      itemFeedback: [{ itemId: "loafers", feedbackType: "avoid_item" }],
    }));
    expect(drafts[1]).toMatchObject({
      polarity: "negative",
      type: "avoidance",
      source: "item_feedback",
    });
    expect(drafts[1].entities.itemIds).toContain("loafers");
  });

  it("scopes negative outfit feedback to exact items and distinctive signals", () => {
    const draft = buildStyleMemoriesFromFeedback(input("not_my_vibe", {
      query: "streetwear outfit",
      occasion: "streetwear",
      outfit: streetwearOutfit(),
      outfitId: "outfit-streetwear",
    }))[0];

    expect(draft.entities.itemIds).toEqual(["jersey", "baggy-jeans", "logo-cap"]);
    expect(draft.entities.categories).toEqual([]);
    expect(draft.entities.materials).toEqual([]);
    expect(draft.entities.colors).toEqual(["red"]);
    expect(draft.entities.styleTags).toEqual(expect.arrayContaining(["graphic", "jersey"]));
    expect(draft.entities.styleTags).not.toContain("streetwear");
  });

  it("stores too_formal as formality-only memory semantics", () => {
    const draft = buildStyleMemoriesFromFeedback(input("too_formal"))[0];

    expect(draft.type).toBe("formality_preference");
    expect(draft.entities.itemIds).toEqual([]);
    expect(draft.entities.colors).toEqual([]);
    expect(draft.entities.categories).toEqual([]);
    expect(draft.entities.materials).toEqual([]);
    expect(draft.entities.styleTags).toEqual([]);
  });

  it("stores streetwear adjustments as only the streetwear tag", () => {
    const draft = buildStyleMemoriesFromFeedback(input("more_streetwear"))[0];

    expect(draft.entities.styleTags).toEqual(["streetwear"]);
    expect(draft.entities.itemIds).toEqual([]);
    expect(draft.entities.categories).toEqual([]);
    expect(draft.entities.materials).toEqual([]);
  });

  it("stores item feedback as item-only memory semantics", () => {
    const drafts = buildStyleMemoriesFromFeedback(input("like", {
      itemFeedback: [{ itemId: "loafers", feedbackType: "avoid_item" }],
    }));
    const itemDraft = drafts[1];

    expect(itemDraft.entities.itemIds).toEqual(["loafers"]);
    expect(itemDraft.entities.colors).toEqual([]);
    expect(itemDraft.entities.categories).toEqual([]);
    expect(itemDraft.entities.materials).toEqual([]);
    expect(itemDraft.entities.styleTags).toEqual([]);
  });

  it("builds precise negative outfit embedding text without generic metadata lines", () => {
    const draft = buildStyleMemoriesFromFeedback(input("not_my_vibe", {
      query: "streetwear outfit",
      occasion: "streetwear",
      outfit: streetwearOutfit(),
      outfitId: "outfit-streetwear",
    }))[0];
    const embeddingText = buildStyleMemoryEmbeddingText(draft);

    expect(embeddingText).toContain("Negative preference:");
    expect(embeddingText).toContain("Red graphic football jersey");
    expect(embeddingText).toContain("sports jersey");
    expect(embeddingText).toContain("football shirt");
    expect(embeddingText).toContain("logo heavy");
    expect(embeddingText).not.toContain("Categories:");
    expect(embeddingText).not.toContain("Materials:");
    expect(embeddingText).not.toContain("Colors:");
    expect(embeddingText).not.toMatch(/\btop\b/);
    expect(embeddingText).not.toMatch(/\bfootwear\b/);
    expect(embeddingText).not.toMatch(/\bcotton, denim\b/);
  });

  it("builds formality-only embedding text for too_formal", () => {
    const draft = buildStyleMemoriesFromFeedback(input("too_formal"))[0];
    const embeddingText = buildStyleMemoryEmbeddingText(draft);

    expect(embeddingText).toBe("Formality preference: User prefers less formal outfits for office.");
    expect(embeddingText).not.toContain("Colors:");
    expect(embeddingText).not.toContain("Categories:");
    expect(embeddingText).not.toContain("Materials:");
    expect(embeddingText).not.toContain("loafers");
  });

  it("keeps broader style signals in positive embedding text", () => {
    const draft = buildStyleMemoriesFromFeedback(input("like"))[0];
    const embeddingText = buildStyleMemoryEmbeddingText(draft);

    expect(embeddingText).toContain("Categories:");
    expect(embeddingText).toContain("Colors:");
    expect(embeddingText).toContain("Materials:");
    expect(embeddingText).toContain("Items:");
  });
});

describe("recordStyleMemoryFeedback", () => {
  it("reinforces similar like memories", async () => {
    const store = memoryStore();
    await recordStyleMemoryFeedback("uid", input("like"), store.deps);
    const second = await recordStyleMemoryFeedback("uid", input("like"), store.deps);

    expect(second.createdMemoryCount).toBe(0);
    expect(second.reinforcedMemoryCount).toBe(1);
    expect([...store.memories.values()][0].reinforcementCount).toBe(2);
  });

  it("does not merge like and dislike memories", async () => {
    const store = memoryStore();
    await recordStyleMemoryFeedback("uid", input("like"), store.deps);
    await recordStyleMemoryFeedback("uid", input("dislike"), store.deps);

    expect(store.memories.size).toBe(2);
  });

  it("does not merge different occasions", async () => {
    const store = memoryStore();
    await recordStyleMemoryFeedback("uid", input("like", { occasion: "office" }), store.deps);
    await recordStyleMemoryFeedback("uid", input("like", { occasion: "dinner", query: "dinner outfit" }), store.deps);

    expect(store.memories.size).toBe(2);
  });

  it("omits embedding vectors from callable-safe feedback responses", async () => {
    const store = memoryStore();
    const response = await recordStyleMemoryFeedback("uid", input("like"), store.deps);

    expect(response.memories[0]).not.toHaveProperty("embeddingVector");
    expect(JSON.stringify(response.memories[0])).not.toContain("embeddingVector");
    expect(JSON.stringify(response.memories[0])).not.toContain("_values");
    expect([...store.memories.values()][0].embeddingVector).toEqual([0.1, 0.2, 0.3]);
  });
});

describe("style profile", () => {
  it("aggregates preferred colors, avoided style tags, and item affinities", () => {
    const positive = memoryFrom("like");
    const negative = memoryFrom("less_streetwear");
    const profile = buildStyleProfileFromMemories("uid", [positive, negative]);

    expect(profile.preferredColors.map((signal) => signal.value)).toContain("black");
    expect(profile.avoidedStyleTags.map((signal) => signal.value)).toContain("streetwear");
    expect(profile.itemAffinities.map((signal) => signal.value)).toEqual(expect.arrayContaining(["polo", "loafers"]));
    expect(profile.summary).toContain("Prefers");
  });

  it("does not aggregate generic negative outfit signals into broad avoid lists", () => {
    const negative = memoryFrom("dislike");
    const profile = buildStyleProfileFromMemories("uid", [negative]);

    expect(profile.avoidedCategories.map((signal) => signal.value)).not.toEqual(expect.arrayContaining(["top", "footwear"]));
    expect(profile.avoidedColors.map((signal) => signal.value)).not.toEqual(expect.arrayContaining(["black", "navy"]));
    expect(profile.avoidedMaterials.map((signal) => signal.value)).not.toEqual(expect.arrayContaining(["cotton", "leather"]));
    expect(profile.summary).not.toContain("avoids top");
    expect(profile.summary).not.toContain("avoids colors black");
  });

  it("keeps explicit less streetwear as an avoided style tag", () => {
    const negative = memoryFrom("less_streetwear");
    const profile = buildStyleProfileFromMemories("uid", [negative]);

    expect(profile.avoidedStyleTags.map((signal) => signal.value)).toContain("streetwear");
  });

  it("aggregates avoided item IDs and outfit fingerprints", () => {
    const negative = memoryFrom("not_my_vibe");
    const profile = buildStyleProfileFromMemories("uid", [negative]);

    expect(profile.avoidedItemIds.map((signal) => signal.value)).toEqual(expect.arrayContaining(["polo", "loafers"]));
    expect(profile.avoidedOutfitFingerprints.length).toBeGreaterThan(0);
    expect(profile.occasionProfiles.office.avoidedItemIds.map((signal) => signal.value)).toEqual(expect.arrayContaining(["polo", "loafers"]));
  });

  it("applies too_formal only as an occasion formality bias", () => {
    const negative = memoryFrom("too_formal");
    const profile = buildStyleProfileFromMemories("uid", [negative]);

    expect(profile.formalityBiasByOccasion.office).toBeLessThan(0);
    expect(profile.occasionProfiles.office.formalityAdjustment).toBeLessThan(0);
    expect(profile.avoidedCategories).toEqual([]);
    expect(profile.avoidedColors).toEqual([]);
    expect(profile.avoidedItemIds).toEqual([]);
  });
});

describe("retrieveStyleMemoryContextForUser", () => {
  it("separates positive and negative active memories and caps limit", async () => {
    const positive = memoryFrom("like");
    const negative = memoryFrom("dislike");
    const inactive = { ...memoryFrom("save"), id: "inactive", active: false };
    const response = await retrieveStyleMemoryContextForUser("uid", {
      query: "office outfit",
      limit: 99,
      includeDiagnostics: true,
    }, {
      createEmbedding: async () => [0.1, 0.2, 0.3],
      vectorSearchMemories: async () => [positive, negative, inactive],
      getStyleProfile: async () => buildStyleProfileFromMemories("uid", [positive, negative]),
    });

    expect(response.positiveMemories).toHaveLength(1);
    expect(response.negativeMemories).toHaveLength(1);
    expect(response.positiveMemories[0].id).toBe(positive.id);
    expect(response.diagnostics?.returnedMemoryCount).toBe(2);
    expect(outfitStyleMemoryContextFromResponse(response).profileSummary).toBeTruthy();
    expect(response.positiveMemories[0]).not.toHaveProperty("embeddingVector");
    expect(JSON.stringify(response)).not.toContain("embeddingVector");
  });

  it("filters retrieved memories by occasion compatibility and reports exclusions", async () => {
    const officePositive = memoryFrom("like", "uid", { occasion: "office", query: "office outfit" });
    const streetwearNegative = memoryFrom("not_my_vibe", "uid", {
      query: "streetwear outfit",
      occasion: "streetwear",
      outfit: streetwearOutfit(),
      outfitId: "outfit-streetwear",
    });
    const datePositive = memoryFrom("like", "uid", { occasion: "date night", query: "date night outfit" });
    const memories = [officePositive, streetwearNegative, datePositive].map((memory, index) => ({
      ...memory,
      embeddingVector: [0.1, 0.2, index],
      styleMemoryDistance: 0.1,
    }));

    const officeResponse = await retrieveStyleMemoryContextForUser("uid", {
      query: "office outfit",
      occasion: "office",
      includeDiagnostics: true,
    }, {
      createEmbedding: async () => [0.1, 0.2, 0.3],
      vectorSearchMemories: async () => memories,
      getStyleProfile: async () => buildStyleProfileFromMemories("uid", memories),
    });
    const officeIds = [...officeResponse.positiveMemories, ...officeResponse.negativeMemories].map((memory) => memory.id);
    expect(officeIds).toContain(officePositive.id);
    expect(officeIds).not.toContain(streetwearNegative.id);
    expect(officeResponse.diagnostics?.excludedMemoryCount).toBeGreaterThan(0);

    const streetwearResponse = await retrieveStyleMemoryContextForUser("uid", {
      query: "streetwear outfit",
      occasion: "streetwear",
    }, {
      createEmbedding: async () => [0.1, 0.2, 0.3],
      vectorSearchMemories: async () => memories,
      getStyleProfile: async () => buildStyleProfileFromMemories("uid", memories),
    });
    expect(streetwearResponse.negativeMemories.map((memory) => memory.id)).toContain(streetwearNegative.id);

    const dinnerResponse = await retrieveStyleMemoryContextForUser("uid", {
      query: "dinner outfit",
      occasion: "dinner",
    }, {
      createEmbedding: async () => [0.1, 0.2, 0.3],
      vectorSearchMemories: async () => memories,
      getStyleProfile: async () => buildStyleProfileFromMemories("uid", memories),
    });
    expect(dinnerResponse.positiveMemories.map((memory) => memory.id)).toContain(datePositive.id);
    expect(dinnerResponse.positiveMemories[0]).not.toHaveProperty("embeddingVector");
  });

  it("infers streetwear occasion from query and excludes office memory when occasion is omitted", async () => {
    const officePositive = memoryFrom("like", "uid", { occasion: "office", query: "office outfit" });
    const streetwearNegative = memoryFrom("not_my_vibe", "uid", {
      query: "streetwear outfit",
      occasion: "streetwear",
      outfit: streetwearOutfit(),
      outfitId: "outfit-streetwear",
    });
    const response = await retrieveStyleMemoryContextForUser("uid", {
      query: "Streetwear outfit",
      includeDiagnostics: true,
    }, {
      createEmbedding: async () => [0.1, 0.2, 0.3],
      vectorSearchMemories: async () => [officePositive, streetwearNegative],
      getStyleProfile: async () => buildStyleProfileFromMemories("uid", [officePositive, streetwearNegative]),
    });

    expect(response.positiveMemories.map((memory) => memory.id)).not.toContain(officePositive.id);
    expect(response.negativeMemories.map((memory) => memory.id)).toContain(streetwearNegative.id);
    expect(response.diagnostics?.inputOccasion).toBeNull();
    expect(response.diagnostics?.inferredOccasion).toBe("streetwear");
    expect(response.diagnostics?.resolvedOccasion).toBe("streetwear");
    expect(response.diagnostics?.occasionSource).toBe("inferred");
    expect(response.diagnostics?.excludedMemoriesPreview).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: officePositive.id, reason: expect.stringContaining("hard occasion mismatch") }),
    ]));
  });

  it("overrides conflicting input occasion by default for streetwear queries", async () => {
    const officePositive = memoryFrom("like", "uid", { occasion: "office", query: "office outfit" });
    const streetwearNegative = memoryFrom("not_my_vibe", "uid", {
      query: "streetwear outfit",
      occasion: "streetwear",
      outfit: streetwearOutfit(),
      outfitId: "outfit-streetwear",
    });
    const response = await retrieveStyleMemoryContextForUser("uid", {
      query: "Streetwear outfit",
      occasion: "office",
      respectInputOccasion: false,
      includeDiagnostics: true,
    }, {
      createEmbedding: async () => [0.1, 0.2, 0.3],
      vectorSearchMemories: async () => [officePositive, streetwearNegative],
      getStyleProfile: async () => buildStyleProfileFromMemories("uid", [officePositive, streetwearNegative]),
    });

    expect(response.diagnostics?.inputOccasion).toBe("office");
    expect(response.diagnostics?.inferredOccasion).toBe("streetwear");
    expect(response.diagnostics?.resolvedOccasion).toBe("streetwear");
    expect(response.diagnostics?.occasionSource).toBe("input_conflict_overridden");
    expect(response.diagnostics?.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "occasion_conflict_resolved",
        inputOccasion: "office",
        inferredOccasion: "streetwear",
        resolvedOccasion: "streetwear",
      }),
    ]));
    expect(response.positiveMemories.map((memory) => memory.id)).not.toContain(officePositive.id);
    expect(response.negativeMemories.map((memory) => memory.id)).toContain(streetwearNegative.id);
  });

  it("respects conflicting input occasion when explicitly requested but warns", async () => {
    const officePositive = memoryFrom("like", "uid", { occasion: "office", query: "office outfit" });
    const response = await retrieveStyleMemoryContextForUser("uid", {
      query: "Streetwear outfit",
      occasion: "office",
      respectInputOccasion: true,
      includeDiagnostics: true,
    }, {
      createEmbedding: async () => [0.1, 0.2, 0.3],
      vectorSearchMemories: async () => [officePositive],
      getStyleProfile: async () => buildStyleProfileFromMemories("uid", [officePositive]),
    });

    expect(response.diagnostics?.inputOccasion).toBe("office");
    expect(response.diagnostics?.inferredOccasion).toBe("streetwear");
    expect(response.diagnostics?.resolvedOccasion).toBe("office");
    expect(response.diagnostics?.occasionSource).toBe("input_respected_conflict");
    expect(response.diagnostics?.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "occasion_conflict_resolved",
        resolvedOccasion: "office",
      }),
    ]));
    expect(response.positiveMemories.map((memory) => memory.id)).toContain(officePositive.id);
  });

  it("infers office occasion from query and includes office memory when occasion is omitted", async () => {
    const officePositive = memoryFrom("like", "uid", { occasion: "office", query: "office outfit" });
    const response = await retrieveStyleMemoryContextForUser("uid", {
      query: "Office outfit with black shoes",
      includeDiagnostics: true,
    }, {
      createEmbedding: async () => [0.1, 0.2, 0.3],
      vectorSearchMemories: async () => [officePositive],
      getStyleProfile: async () => buildStyleProfileFromMemories("uid", [officePositive]),
    });

    expect(response.positiveMemories.map((memory) => memory.id)).toContain(officePositive.id);
    expect(response.diagnostics?.resolvedOccasion).toBe("office");
    expect(response.diagnostics?.occasionSource).toBe("inferred");
  });

  it("infers date night and summer casual occasions from query", async () => {
    expect(inferMemoryOccasionFromQuery("Date night outfit")).toBe("date_night");
    expect(inferMemoryOccasionFromQuery("summer casual outfit")).toBe("vacation");

    const datePositive = memoryFrom("like", "uid", { occasion: "date night", query: "date night outfit" });
    const vacationPositive = memoryFrom("like", "uid", { occasion: "vacation", query: "summer vacation outfit" });
    const dinnerResponse = await retrieveStyleMemoryContextForUser("uid", {
      query: "Date night outfit",
      includeDiagnostics: true,
    }, {
      createEmbedding: async () => [0.1, 0.2, 0.3],
      vectorSearchMemories: async () => [datePositive, vacationPositive],
      getStyleProfile: async () => buildStyleProfileFromMemories("uid", [datePositive, vacationPositive]),
    });
    const summerResponse = await retrieveStyleMemoryContextForUser("uid", {
      query: "Summer casual outfit",
      includeDiagnostics: true,
    }, {
      createEmbedding: async () => [0.1, 0.2, 0.3],
      vectorSearchMemories: async () => [datePositive, vacationPositive],
      getStyleProfile: async () => buildStyleProfileFromMemories("uid", [datePositive, vacationPositive]),
    });

    expect(dinnerResponse.positiveMemories.map((memory) => memory.id)).toContain(datePositive.id);
    expect(dinnerResponse.diagnostics?.resolvedOccasion).toBe("date_night");
    expect(summerResponse.positiveMemories.map((memory) => memory.id)).toContain(vacationPositive.id);
    expect(summerResponse.diagnostics?.resolvedOccasion).toBe("vacation");
  });

  it("infers occasion from legacy memory text when memory entities omit occasion", async () => {
    const legacyOfficePositive = {
      ...memoryFrom("like", "uid", { occasion: undefined, query: "office outfit" }),
      entities: {
        ...memoryFrom("like", "uid", { occasion: undefined, query: "office outfit" }).entities,
        occasion: undefined,
        query: "",
      },
      text: "User likes this office outfit style: light blue linen shirt, black trousers, dress loafers.",
    };
    const response = await retrieveStyleMemoryContextForUser("uid", {
      query: "Streetwear outfit",
      includeDiagnostics: true,
    }, {
      createEmbedding: async () => [0.1, 0.2, 0.3],
      vectorSearchMemories: async () => [legacyOfficePositive],
      getStyleProfile: async () => buildStyleProfileFromMemories("uid", [legacyOfficePositive]),
    });

    expect(response.positiveMemories).toEqual([]);
    expect(response.diagnostics?.excludedMemoryCount).toBe(1);
  });
});

describe("style memory callables", () => {
  it("rejects unauthenticated recordOutfitFeedback", async () => {
    await expect(handleRecordOutfitFeedback(undefined, input("like"))).rejects.toThrow(HttpsError);
  });

  it("getStyleProfile returns an empty default profile if none exists", async () => {
    const profile = await handleGetStyleProfile("uid", {
      getStyleProfile: async () => null,
    });
    expect(profile).toMatchObject(defaultStyleProfile("uid"));
  });

  it("deleteStyleMemory requires confirm string", async () => {
    await expect(handleDeleteStyleMemory("uid", { memoryId: "abc" })).rejects.toThrow(HttpsError);
  });

  it("listStyleMemories returns client-safe memories without nested vector payloads", async () => {
    const rawMemory = {
      ...memoryFrom("like"),
      embeddingVector: { _values: [0.1, 0.2, 0.3] },
      embeddingRaw: [0.1, 0.2, 0.3],
      nested: { _values: [0.4, 0.5] },
    } as StyleMemory & { embeddingRaw: number[]; nested: { _values: number[] } };
    const response = await handleListStyleMemories("uid", { limit: 1 }, {
      listStyleMemories: async () => [rawMemory],
    });

    expect(JSON.stringify(response)).not.toContain("embeddingVector");
    expect(JSON.stringify(response)).not.toContain("embeddingRaw");
    expect(JSON.stringify(response)).not.toContain("_values");
    expect(response.memories[0]).toHaveProperty("embeddingText");
  });

  it("shared serializer removes vector-like fields recursively", () => {
    const rawMemory = {
      ...memoryFrom("like"),
      embeddingVector: { _values: [0.1, 0.2] },
      embeddingRaw: [0.1, 0.2],
      nested: { vector: [0.3], keep: "yes" },
    } as StyleMemory & { embeddingRaw: number[]; nested: { vector: number[]; keep: string } };
    const serialized = serializeStyleMemoryForClient(rawMemory);

    expect(JSON.stringify(serialized)).not.toContain("embeddingVector");
    expect(JSON.stringify(serialized)).not.toContain("embeddingRaw");
    expect(JSON.stringify(serialized)).not.toContain("_values");
    expect(JSON.stringify(serialized)).not.toContain("vector");
    expect(JSON.stringify(serialized)).toContain("yes");
  });

  it("softDeleteAllStyleMemories requires confirm string", async () => {
    await expect(handleSoftDeleteAllStyleMemories("uid", {})).rejects.toThrow(HttpsError);
  });

  it("soft deletes all active style memories and resets the profile", async () => {
    const memories = [memoryFrom("like"), memoryFrom("dislike")];
    const updates = new Map<string, Partial<StyleMemory>>();
    const writtenProfiles: StyleProfile[] = [];

    const response = await handleSoftDeleteAllStyleMemories("uid", {
      confirm: "SOFT_DELETE_ALL_STYLE_MEMORIES",
    }, {
      listMemories: async () => memories,
      updateMemory: async (_uid, memoryId, patch) => {
        updates.set(memoryId, patch);
      },
      writeStyleProfile: async (_uid, profile) => {
        writtenProfiles.push(profile);
      },
    });

    expect(response.softDeletedCount).toBe(2);
    expect([...updates.values()].every((patch) => patch.active === false)).toBe(true);
    expect(writtenProfiles[0]?.memoryCount).toBe(0);
    expect(response.styleProfilePreview).toMatchObject(defaultStyleProfile("uid"));
  });
});
