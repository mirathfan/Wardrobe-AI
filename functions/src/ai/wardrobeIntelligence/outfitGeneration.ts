import OpenAI from "openai";
import { HttpsError } from "firebase-functions/v2/https";
import { requireOpenAiApiKey } from "../../shared/env";
import { outfitGenerationConfig } from "./config";
import {
  buildOutfitGenerationDeveloperPrompt,
  buildOutfitGenerationUserPrompt,
} from "./outfitPrompt";
import { normalizeOutfitRoleAlias } from "./outfitRole";
import type {
  GeneratedOutfit,
  GeneratedOutfitPayload,
  NormalizedOutfitGenerationInput,
  OutfitGenerationContext,
  OutfitValidationResult,
  OutfitValidationWarning,
  ValidatedOutfit,
} from "./outfitTypes";
import {
  buildValidatedOutfitResponse,
  validateGeneratedOutfits,
} from "./outfitValidation";

type ResponsesCreateArgs = {
  model: string;
  input: unknown;
  text: unknown;
};

export type OutfitOpenAIClient = {
  responses: {
    create: (args: ResponsesCreateArgs) => Promise<{ output_text?: string | null }>;
  };
};

export type GenerateOutfitsOptions = {
  client?: OutfitOpenAIClient;
  repair?: boolean;
};

type InvalidOutfit = {
  outfit: GeneratedOutfit;
  outfitIndex: number;
  errors: string[];
};

function defaultClient(): OutfitOpenAIClient {
  return new OpenAI({ apiKey: requireOpenAiApiKey() }) as OutfitOpenAIClient;
}

function text(value: unknown, fallback = ""): string {
  return String(value ?? fallback).trim();
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => text(entry)).filter(Boolean);
}

function formality(value: unknown): "casual" | "smart_casual" | "formal" {
  const raw = text(value).toLowerCase().replace(/\s+/g, "_");
  if (raw === "casual" || raw === "formal") return raw;
  return "smart_casual";
}

function generatedOutfitFromUnknown(value: unknown): GeneratedOutfit | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const items = Array.isArray(record.items)
    ? record.items.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const item = entry as Record<string, unknown>;
      const role = normalizeOutfitRoleAlias(item.role);
      if (role === "unknown") return [];
      const itemId = text(item.itemId);
      if (!itemId) return [];
      return [{
        itemId,
        role: role as GeneratedOutfit["items"][number]["role"],
        reason: text(item.reason, "Selected from closet context."),
      }];
    })
    : [];
  return {
    title: text(record.title, "Closet Outfit"),
    vibe: text(record.vibe, "closet-based"),
    occasion: text(record.occasion, "outfit"),
    formality: formality(record.formality),
    items,
    explanation: text(record.explanation),
    stylingTips: arrayOfStrings(record.stylingTips).slice(0, 5),
    missingItems: arrayOfStrings(record.missingItems).slice(0, 5),
    confidence: Number(record.confidence),
  };
}

export function parseGeneratedOutfitPayload(value: unknown): GeneratedOutfitPayload {
  const payload = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { outfits: [] };
  }
  const outfits = Array.isArray((payload as Record<string, unknown>).outfits)
    ? ((payload as Record<string, unknown>).outfits as unknown[]).flatMap((entry) => {
      const outfit = generatedOutfitFromUnknown(entry);
      return outfit ? [outfit] : [];
    })
    : [];
  return { outfits };
}

function outfitSchema(maxOutfits: number) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      outfits: {
        type: "array",
        minItems: 1,
        maxItems: maxOutfits,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            vibe: { type: "string" },
            occasion: { type: "string" },
            formality: { type: "string", enum: ["casual", "smart_casual", "formal"] },
            items: {
              type: "array",
              minItems: 2,
              maxItems: 6,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  itemId: { type: "string" },
                  role: { type: "string", enum: ["top", "bottom", "footwear", "outerwear", "accessory", "one_piece"] },
                  reason: { type: "string" },
                },
                required: ["itemId", "role", "reason"],
              },
            },
            explanation: { type: "string" },
            stylingTips: {
              type: "array",
              maxItems: 5,
              items: { type: "string" },
            },
            missingItems: {
              type: "array",
              maxItems: 5,
              items: { type: "string" },
            },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: [
            "title",
            "vibe",
            "occasion",
            "formality",
            "items",
            "explanation",
            "stylingTips",
            "missingItems",
            "confidence",
          ],
        },
      },
    },
    required: ["outfits"],
  };
}

async function requestOutfitJson(args: {
  client: OutfitOpenAIClient;
  input: NormalizedOutfitGenerationInput;
  context: OutfitGenerationContext;
  repairInstruction?: string;
}): Promise<GeneratedOutfitPayload> {
  const config = outfitGenerationConfig();
  const response = await args.client.responses.create({
    model: config.model,
    input: [
      {
        role: "developer",
        content: buildOutfitGenerationDeveloperPrompt(),
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              buildOutfitGenerationUserPrompt(args.input, args.context) +
              (args.repairInstruction ? `\n\nRepair instruction:\n${args.repairInstruction}` : ""),
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "aura_outfit_recommendations",
        schema: outfitSchema(args.input.count),
      },
    },
  });
  return parseGeneratedOutfitPayload(String(response.output_text || "{}"));
}

function rewriteOutfitPrefix(value: string, outfitIndex: number): string {
  return value.replace(/^outfit 1:/, `outfit ${outfitIndex + 1}:`);
}

function validateOutfitAtIndex(
  outfit: GeneratedOutfit,
  outfitIndex: number,
  context: OutfitGenerationContext,
  input: NormalizedOutfitGenerationInput,
): OutfitValidationResult {
  const result = validateGeneratedOutfits([outfit], context, input);
  return {
    ...result,
    errors: result.errors.map((error) => rewriteOutfitPrefix(error, outfitIndex)),
    warnings: result.warnings.map((warning) => rewriteOutfitPrefix(warning, outfitIndex)),
    validationWarnings: result.validationWarnings.map((warning) => ({
      ...warning,
      outfitIndex,
      issue: rewriteOutfitPrefix(warning.issue, outfitIndex),
    })),
  };
}

function outfitSignature(outfit: GeneratedOutfit): string {
  return outfit.items
    .map((item) => `${item.itemId}:${item.role}`)
    .sort()
    .join("|");
}

function dropWarning(outfitIndex: number, errors: string[]): OutfitValidationWarning {
  return {
    outfitIndex,
    issue: errors.join(" | ") || "Generated outfit failed validation.",
    action: "dropped",
  };
}

export async function generateOutfitsFromContext(
  input: NormalizedOutfitGenerationInput,
  context: OutfitGenerationContext,
  options: GenerateOutfitsOptions = {},
): Promise<GeneratedOutfitPayload> {
  const client = options.client ?? defaultClient();
  return requestOutfitJson({ client, input, context });
}

export async function generateValidatedOutfitsFromContext(
  input: NormalizedOutfitGenerationInput,
  context: OutfitGenerationContext,
  options: GenerateOutfitsOptions = {},
): Promise<{
  outfits: ValidatedOutfit[];
  validationErrors: string[];
  validationWarnings: OutfitValidationWarning[];
  repaired: boolean;
}> {
  const config = outfitGenerationConfig();
  const client = options.client ?? defaultClient();
  const first = await requestOutfitJson({ client, input, context });
  const validOutfits: GeneratedOutfit[] = [];
  const seenValidOutfits = new Set<string>();
  const invalidOutfits: InvalidOutfit[] = [];
  const payloadErrors = first.outfits.length
    ? []
    : validateGeneratedOutfits(first.outfits, context, input).errors;
  const validationErrors: string[] = [];
  const validationWarnings: OutfitValidationWarning[] = [];
  const repairedOutfitIndexes = new Set<number>();
  let repaired = false;

  first.outfits.forEach((outfit, outfitIndex) => {
    const validation = validateOutfitAtIndex(outfit, outfitIndex, context, input);
    validationWarnings.push(...validation.validationWarnings);
    if (validation.valid && validation.normalizedOutfits[0]) {
      const normalized = validation.normalizedOutfits[0];
      const signature = outfitSignature(normalized);
      if (!seenValidOutfits.has(signature)) {
        seenValidOutfits.add(signature);
        validOutfits.push(normalized);
      }
      return;
    }
    invalidOutfits.push({ outfit, outfitIndex, errors: validation.errors });
  });

  if ((invalidOutfits.length || payloadErrors.length) && (options.repair ?? config.enableRepair)) {
    repaired = true;
    const repairPayload = await requestOutfitJson({
      client,
      input,
      context,
      repairInstruction: [
        "Repair only the invalid outfit JSON entries once.",
        "Validation errors:",
        ...payloadErrors,
        ...invalidOutfits.flatMap((entry) => entry.errors),
        "Use only provided candidate itemIds.",
        "Use each item with its exact allowedRole.",
        `Return up to ${invalidOutfits.length} replacement outfit(s), not the already valid outfits.`,
        "Return valid JSON in the same schema.",
      ].join("\n"),
    });
    repairPayload.outfits.forEach((outfit, repairIndex) => {
      const original = invalidOutfits[Math.min(repairIndex, invalidOutfits.length - 1)];
      const outfitIndex = original?.outfitIndex ?? first.outfits.length + repairIndex;
      if (original) repairedOutfitIndexes.add(original.outfitIndex);
      const validation = validateOutfitAtIndex(outfit, outfitIndex, context, input);
      validationWarnings.push(...validation.validationWarnings);
      if (validation.valid && validation.normalizedOutfits[0]) {
        const normalized = validation.normalizedOutfits[0];
        const signature = outfitSignature(normalized);
        if (!seenValidOutfits.has(signature)) {
          seenValidOutfits.add(signature);
          validOutfits.push(normalized);
        }
        validationWarnings.push({
          outfitIndex,
          issue: "Invalid generated outfit was repaired successfully.",
          action: "repaired",
        });
        return;
      }
      validationErrors.push(...validation.errors);
      validationWarnings.push(dropWarning(outfitIndex, validation.errors));
    });
  }

  invalidOutfits.forEach((entry) => {
    if (!repaired || !repairedOutfitIndexes.has(entry.outfitIndex)) {
      validationErrors.push(...entry.errors);
      validationWarnings.push(dropWarning(entry.outfitIndex, entry.errors));
    }
  });
  if ((!repaired || !validOutfits.length) && payloadErrors.length) {
    validationErrors.push(...payloadErrors);
    validationWarnings.push(dropWarning(0, payloadErrors));
  }

  if (!validOutfits.length) {
    throw new HttpsError("failed-precondition", "Generated outfits failed validation.", {
      validationErrors,
      validationWarnings,
    });
  }

  return {
    outfits: buildValidatedOutfitResponse(validOutfits, context, input).slice(0, input.count),
    validationErrors,
    validationWarnings,
    repaired,
  };
}
