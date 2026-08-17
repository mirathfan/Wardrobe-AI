import {
  AURA_HARDENING_FRIENDLY_ERROR,
  AuraHardeningTimeoutError,
  auraUserScopedPath,
  containsAuraPrivatePayloadKeys,
  getAuraFriendlyErrorMessage,
  runWithLoadingCleanup,
  sanitizeAuraClientPayload,
  withTimeout,
} from "@/src/lib/auraHardening";

describe("AURA hardening helpers", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("withTimeout rejects and labels timeout errors", async () => {
    jest.useFakeTimers();
    const promise = withTimeout(new Promise(() => {}), 25, "runAuraStylingAgent");

    jest.advanceTimersByTime(25);

    await expect(promise).rejects.toMatchObject({
      name: "AuraHardeningTimeoutError",
      code: "aura/timeout",
      label: "runAuraStylingAgent",
      timeoutMs: 25,
    });
    await expect(promise).rejects.toBeInstanceOf(AuraHardeningTimeoutError);
  });

  it("loading cleanup helper clears state after success", async () => {
    const loading: boolean[] = [];
    const cleanup = jest.fn();

    await expect(
      runWithLoadingCleanup({
        setLoading: (value) => loading.push(value),
        cleanup,
        run: async () => "done",
      }),
    ).resolves.toBe("done");

    expect(loading).toEqual([true, false]);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("loading cleanup helper clears state after failure", async () => {
    const loading: boolean[] = [];
    const cleanup = jest.fn();

    await expect(
      runWithLoadingCleanup({
        setLoading: (value) => loading.push(value),
        cleanup,
        run: async () => {
          throw new Error("boom");
        },
      }),
    ).rejects.toThrow("boom");

    expect(loading).toEqual([true, false]);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("sanitizes vectors, raw internals, diagnostics, ai metadata, and secrets recursively", () => {
    const sanitized = sanitizeAuraClientPayload({
      message: "safe",
      diagnostics: { trace: "debug" },
      scoreBreakdown: { total: 1 },
      apiKey: "secret",
      nested: {
        embeddingVector: [1, 2, 3],
        rawLangGraphState: { node: "private" },
        aiMetadata: { rawVector: [4] },
        keep: "yes",
      },
      items: [
        {
          name: "Loafers",
          queryVector: [5],
          keep: true,
        },
      ],
    });

    expect(sanitized).toEqual({
      message: "safe",
      nested: { keep: "yes" },
      items: [{ name: "Loafers", keep: true }],
    });
    expect(containsAuraPrivatePayloadKeys(sanitized)).toBe(false);
  });

  it("maps technical errors to user-friendly copy", () => {
    expect(getAuraFriendlyErrorMessage(new Error("LangGraph function error: missing vector index"))).toBe(
      AURA_HARDENING_FRIENDLY_ERROR,
    );
    expect(getAuraFriendlyErrorMessage({ code: "functions/failed-precondition", message: "not enough indexed closet items" })).toBe(
      "I need a few more closet items to style this.",
    );
  });

  it("builds only user-scoped Firestore paths", () => {
    expect(auraUserScopedPath("uid-1", "savedOutfits", "outfit-1")).toBe(
      "users/uid-1/savedOutfits/outfit-1",
    );
    expect(() => auraUserScopedPath("uid-1/other", "items")).toThrow("Invalid AURA user id");
    expect(() => auraUserScopedPath("uid-1", "../items")).toThrow("Invalid AURA path segment");
  });
});
