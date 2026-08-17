import OpenAI from "openai";
import { requireOpenAiApiKey } from "../../../shared/env";
import type { ValidatedOutfit } from "../outfitTypes";
import type { AuraEvalCase, AuraJudgeResult } from "./evalTypes";

type JudgeResponseCreateArgs = {
  model: string;
  input: unknown;
  text: unknown;
};

export type AuraEvalJudgeClient = {
  responses: {
    create: (args: JudgeResponseCreateArgs) => Promise<{ output_text?: string | null }>;
  };
};

function numberScore(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(5, Math.round(parsed)));
}

function textArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => String(entry ?? "").trim()).filter(Boolean).slice(0, 8)
    : [];
}

function cleanJsonText(value: string): string {
  return value
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

export function llmJudgeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.AURA_EVAL_USE_LLM_JUDGE ?? "").toLowerCase() === "true";
}

export function parseAuraJudgeResult(value: unknown): AuraJudgeResult {
  const parsed = typeof value === "string" ? JSON.parse(cleanJsonText(value)) as unknown : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AURA eval judge returned a non-object payload.");
  }
  const data = parsed as Record<string, unknown>;
  const overallScore = numberScore(data.overallScore);
  const verdict = data.verdict === "pass" || data.verdict === "fail"
    ? data.verdict
    : overallScore >= 4 ? "pass" : "fail";
  return {
    occasionScore: numberScore(data.occasionScore),
    coherenceScore: numberScore(data.coherenceScore),
    styleScore: numberScore(data.styleScore),
    weatherScore: numberScore(data.weatherScore),
    requestSatisfactionScore: numberScore(data.requestSatisfactionScore),
    closetFaithfulnessScore: numberScore(data.closetFaithfulnessScore),
    overallScore,
    issues: textArray(data.issues),
    verdict,
  };
}

function outfitSummary(outfits: ValidatedOutfit[]): Record<string, unknown>[] {
  return outfits.map((outfit) => ({
    title: outfit.title,
    occasion: outfit.occasion,
    formality: outfit.formality,
    itemNames: outfit.items.map((item) => `${item.role}: ${item.name}`),
    explanation: outfit.explanation.slice(0, 500),
  }));
}

function defaultClient(): AuraEvalJudgeClient {
  return new OpenAI({ apiKey: requireOpenAiApiKey() }) as AuraEvalJudgeClient;
}

export async function runOptionalAuraLlmJudge(args: {
  evalCase: AuraEvalCase;
  outfits: ValidatedOutfit[];
  enabled?: boolean;
  client?: AuraEvalJudgeClient;
}): Promise<AuraJudgeResult | null> {
  if (!(args.enabled ?? llmJudgeEnabled())) return null;
  const client = args.client ?? defaultClient();
  const response = await client.responses.create({
    model: process.env.AURA_EVAL_JUDGE_MODEL || "gpt-4.1-mini",
    input: [
      {
        role: "developer",
        content: [
          "You are an offline evaluator for a synthetic wardrobe recommendation test.",
          "Score only the provided sanitized outfit summary. Do not infer private user data.",
          "Return JSON only with scores 1-5, issues, and verdict.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          query: args.evalCase.query,
          expected: args.evalCase.expected,
          weather: args.evalCase.weather,
          outfits: outfitSummary(args.outfits),
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "aura_eval_judge",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            occasionScore: { type: "number", minimum: 1, maximum: 5 },
            coherenceScore: { type: "number", minimum: 1, maximum: 5 },
            styleScore: { type: "number", minimum: 1, maximum: 5 },
            weatherScore: { type: "number", minimum: 1, maximum: 5 },
            requestSatisfactionScore: { type: "number", minimum: 1, maximum: 5 },
            closetFaithfulnessScore: { type: "number", minimum: 1, maximum: 5 },
            overallScore: { type: "number", minimum: 1, maximum: 5 },
            issues: { type: "array", items: { type: "string" }, maxItems: 8 },
            verdict: { type: "string", enum: ["pass", "fail"] },
          },
          required: [
            "occasionScore",
            "coherenceScore",
            "styleScore",
            "weatherScore",
            "requestSatisfactionScore",
            "closetFaithfulnessScore",
            "overallScore",
            "issues",
            "verdict",
          ],
        },
      },
    },
  });
  return parseAuraJudgeResult(response.output_text || "{}");
}
