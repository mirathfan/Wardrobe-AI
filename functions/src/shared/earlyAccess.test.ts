import { HttpsError } from "firebase-functions/v2/https";

import {
  EARLY_ACCESS_ERRORS,
  checkAndConsumeEarlyAccessUse,
  getCachedEarlyAccessResult,
  getEarlyAccessFeatureState,
  setCachedEarlyAccessResult,
} from "./earlyAccess";

type DocRef = {
  path: string;
  collection: (name: string) => CollectionRef;
  get: () => Promise<{ data: () => Record<string, unknown> | undefined }>;
  set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void>;
};

type CollectionRef = {
  path: string;
  doc: (id: string) => DocRef;
};

const store = new Map<string, Record<string, unknown>>();

function collectionRef(path: string): CollectionRef {
  return {
    path,
    doc: (id: string) => docRef(`${path}/${id}`),
  };
}

function docRef(path: string): DocRef {
  return {
    path,
    collection: (name: string) => collectionRef(`${path}/${name}`),
    get: jest.fn(async () => ({
      data: () => store.get(path),
    })),
    set: jest.fn(async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
      store.set(path, options?.merge ? { ...(store.get(path) ?? {}), ...data } : data);
    }),
  };
}

const firestore = {
  collection: (name: string) => collectionRef(name),
  runTransaction: jest.fn(async <T>(callback: (transaction: unknown) => Promise<T>) => {
    const transaction = {
      get: jest.fn(async (ref: DocRef) => ({
        data: () => store.get(ref.path),
      })),
      set: jest.fn((ref: DocRef, data: Record<string, unknown>, options?: { merge?: boolean }) => {
        store.set(ref.path, options?.merge ? { ...(store.get(ref.path) ?? {}), ...data } : data);
      }),
    };
    return callback(transaction);
  }),
};

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: () => firestore,
  FieldValue: {
    serverTimestamp: () => ({ serverTimestamp: true }),
  },
  Timestamp: {
    now: () => ({ millis: Date.now() }),
  },
}));

function seed(path: string, data: Record<string, unknown>) {
  store.set(path, data);
}

async function cachedOrConsume(params: {
  uid: string;
  imageHash: string;
  modelVersion: string;
}) {
  const state = await getEarlyAccessFeatureState(params.uid, "aiPolish");
  if (!state.allowed) {
    throw new HttpsError("failed-precondition", EARLY_ACCESS_ERRORS.featureNotAvailable.message, {
      code: EARLY_ACCESS_ERRORS.featureNotAvailable.code,
      message: EARLY_ACCESS_ERRORS.featureNotAvailable.message,
    });
  }
  const cached = await getCachedEarlyAccessResult(
    params.uid,
    "aiPolish",
    params.imageHash,
    params.modelVersion,
  );
  if (cached) return cached.result;
  await checkAndConsumeEarlyAccessUse(params.uid, "aiPolish", {
    runKey: params.imageHash,
  });
  return { ok: false };
}

describe("early access feature gates", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-06-09T12:00:00.000Z"));
    store.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("defaults a missing betaRole to standard", async () => {
    seed("users/missing-role", {
      featureAccess: { aiPolish: true },
    });

    await expect(getEarlyAccessFeatureState("missing-role", "aiPolish")).resolves.toMatchObject({
      betaRole: "standard",
      allowed: false,
      periodKey: "2026-06",
      remaining: 0,
    });
  });

  it("blocks standard users before paid AI can run", async () => {
    seed("users/standard", {
      betaRole: "standard",
      featureAccess: { aiPolish: true, outfitExtraction: true },
    });

    await expect(
      checkAndConsumeEarlyAccessUse("standard", "aiPolish", { runKey: "one" }),
    ).rejects.toMatchObject({
      code: "failed-precondition",
      details: { code: "FEATURE_NOT_AVAILABLE" },
    });
    expect(store.get("users/standard/usage/earlyAccess")).toBeUndefined();
  });

  it("lets enabled users run AI Polish up to 3 times", async () => {
    seed("users/polish", {
      betaRole: "power",
      featureAccess: { aiPolish: true },
    });

    await expect(checkAndConsumeEarlyAccessUse("polish", "aiPolish", { runKey: "one" }))
      .resolves.toMatchObject({ used: 1, remaining: 2 });
    await expect(checkAndConsumeEarlyAccessUse("polish", "aiPolish", { runKey: "two" }))
      .resolves.toMatchObject({ used: 2, remaining: 1 });
    await expect(checkAndConsumeEarlyAccessUse("polish", "aiPolish", { runKey: "three" }))
      .resolves.toMatchObject({ used: 3, remaining: 0 });

    await expect(
      checkAndConsumeEarlyAccessUse("polish", "aiPolish", { runKey: "four" }),
    ).rejects.toBeInstanceOf(HttpsError);
  });

  it("lets enabled users run Outfit Extraction up to 2 times", async () => {
    seed("users/outfit", {
      betaRole: "power",
      featureAccess: { outfitExtraction: true },
    });

    await expect(checkAndConsumeEarlyAccessUse("outfit", "outfitExtraction", { runKey: "one" }))
      .resolves.toMatchObject({ used: 1, remaining: 1 });
    await expect(checkAndConsumeEarlyAccessUse("outfit", "outfitExtraction", { runKey: "two" }))
      .resolves.toMatchObject({ used: 2, remaining: 0 });
  });

  it("returns EARLY_ACCESS_LIMIT_REACHED when the monthly limit is used", async () => {
    seed("users/limited", {
      betaRole: "power",
      featureAccess: { outfitExtraction: true },
    });
    seed("users/limited/usage/earlyAccess", {
      periodKey: "2026-06",
      outfitExtractionUsed: 2,
    });

    await expect(
      checkAndConsumeEarlyAccessUse("limited", "outfitExtraction", { runKey: "next" }),
    ).rejects.toMatchObject({
      code: "failed-precondition",
      details: { code: "EARLY_ACCESS_LIMIT_REACHED" },
    });
  });

  it("returns cached results without consuming another use", async () => {
    seed("users/cached", {
      betaRole: "power",
      featureAccess: { aiPolish: true },
    });
    seed("users/cached/usage/earlyAccess", {
      periodKey: "2026-06",
      aiPolishUsed: 2,
    });
    await setCachedEarlyAccessResult("cached", "aiPolish", "same-image", "model-v1", {
      ok: true,
      cached: true,
    });

    await expect(cachedOrConsume({
      uid: "cached",
      imageHash: "same-image",
      modelVersion: "model-v1",
    })).resolves.toEqual({ ok: true, cached: true });
    expect(store.get("users/cached/usage/earlyAccess")?.aiPolishUsed).toBe(2);
  });

  it("blocks direct backend calls when featureAccess is missing", async () => {
    seed("users/direct", {
      betaRole: "power",
    });

    await expect(
      checkAndConsumeEarlyAccessUse("direct", "outfitExtraction", { runKey: "direct-call" }),
    ).rejects.toMatchObject({
      code: "failed-precondition",
      details: { code: "FEATURE_NOT_AVAILABLE" },
    });
  });

  it("does not let cached results bypass feature availability", async () => {
    seed("users/no-cache-bypass", {
      betaRole: "standard",
      featureAccess: { aiPolish: true },
    });
    await setCachedEarlyAccessResult("no-cache-bypass", "aiPolish", "same-image", "model-v1", {
      ok: true,
    });

    await expect(cachedOrConsume({
      uid: "no-cache-bypass",
      imageHash: "same-image",
      modelVersion: "model-v1",
    })).rejects.toMatchObject({
      code: "failed-precondition",
      details: { code: "FEATURE_NOT_AVAILABLE" },
    });
  });
});
