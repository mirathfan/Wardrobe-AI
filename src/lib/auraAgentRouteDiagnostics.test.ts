import {
  describeAuraAgentRouteDecision,
  getAuraAgentEnabledFlagValue,
  isAuraAgentEnabledFlag,
  logAuraAgentRoute,
} from "@/src/lib/auraAgentRouteDiagnostics";

describe("aura agent route diagnostics", () => {
  it("normalizes the public agent feature flag", () => {
    expect(getAuraAgentEnabledFlagValue(" 1 ")).toBe("1");
    expect(isAuraAgentEnabledFlag("1")).toBe(true);
    expect(isAuraAgentEnabledFlag("true")).toBe(true);
    expect(isAuraAgentEnabledFlag("yes")).toBe(true);
    expect(isAuraAgentEnabledFlag("0")).toBe(false);
    expect(isAuraAgentEnabledFlag(undefined)).toBe(false);
  });

  it("describes agent and fallback route decisions without prompt text", () => {
    expect(
      describeAuraAgentRouteDecision({
        enabled: true,
        flagValue: "1",
        shouldUseAgent: true,
        chatIntent: "GENERATE_OUTFIT",
        attachmentCount: 0,
      }),
    ).toMatchObject({
      route: "agent",
      reason: "agent route selected",
      flagValue: "1",
    });
    expect(
      describeAuraAgentRouteDecision({
        enabled: false,
        flagValue: "",
        shouldUseAgent: false,
        chatIntent: "GENERATE_OUTFIT",
        attachmentCount: 0,
      }),
    ).toMatchObject({
      route: "fallback",
      reason: "feature flag disabled",
      flagValue: null,
    });
  });

  it("logs route diagnostics with the route prefix", () => {
    const logger = { info: jest.fn() };
    logAuraAgentRoute("agent failed, fallback used", { code: "functions/unavailable" }, logger);
    expect(logger.info).toHaveBeenCalledWith(
      "[AURA_AGENT_ROUTE]",
      "agent failed, fallback used",
      { code: "functions/unavailable" },
    );
  });
});
