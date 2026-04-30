import OpenAI from "openai";

export type AuraAttachmentForOutfitAnalysis = {
  type?: "image" | "audio";
  uri?: string;
};

export type AuraDetectedOutfitPiece = {
  role: "top" | "bottom" | "footwear" | "outerwear" | "accessory";
  label: string;
  color?: string | null;
  confidence?: number | null;
  notes?: string | null;
};

export type AuraOutfitPhotoAnalysis = {
  detectedPieces: AuraDetectedOutfitPiece[];
  outfitVibe?: string | null;
  stylingNotes?: string[];
  missingToComplete?: string[];
};

const OUTFIT_PHOTO_INTENTS = new Set(["outfit_analysis", "worn_outfit_photo"]);

export function isOutfitPhotoIntent(clientIntent?: string | null) {
  return OUTFIT_PHOTO_INTENTS.has(String(clientIntent ?? ""));
}

function clampConfidence(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.5;
  return Math.max(0, Math.min(1, numeric));
}

function cleanString(value: unknown, fallback = "") {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function normalizeRole(value: unknown): AuraDetectedOutfitPiece["role"] | null {
  const role = cleanString(value).toLowerCase();
  if (role === "top") return "top";
  if (role === "bottom") return "bottom";
  if (role === "footwear" || role === "shoe" || role === "shoes") return "footwear";
  if (role === "outerwear" || role === "jacket") return "outerwear";
  if (role === "accessory" || role === "accessories") return "accessory";
  return null;
}

export function normalizeOutfitPhotoAnalysis(value: unknown): AuraOutfitPhotoAnalysis {
  const root = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const pieces = Array.isArray(root.detectedPieces) ? root.detectedPieces : [];
  const detectedPieces: AuraDetectedOutfitPiece[] = [];
  for (const entry of pieces) {
      const piece = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
      const role = normalizeRole(piece.role);
      const label = cleanString(piece.label);
      if (!role || !label || /not visible/i.test(label)) continue;
      detectedPieces.push({
        role,
        label,
        color: cleanString(piece.color) || null,
        confidence: clampConfidence(piece.confidence),
        notes: cleanString(piece.notes) || null,
      });
      if (detectedPieces.length >= 8) break;
  }

  const stylingNotes = (Array.isArray(root.stylingNotes) ? root.stylingNotes : [])
    .map((entry) => cleanString(entry))
    .filter(Boolean)
    .slice(0, 4);
  const missingToComplete = (Array.isArray(root.missingToComplete) ? root.missingToComplete : [])
    .map((entry) => cleanString(entry))
    .filter(Boolean)
    .slice(0, 5);

  for (const label of ["top", "bottom", "footwear"] as const) {
    if (!detectedPieces.some((piece) => piece.role === label)) {
      missingToComplete.push(`${label === "footwear" ? "shoes" : label} not visible`);
    }
  }

  return {
    detectedPieces,
    outfitVibe: cleanString(root.outfitVibe) || null,
    stylingNotes,
    missingToComplete: Array.from(new Set(missingToComplete)).slice(0, 5),
  };
}

export function outfitPhotoAnalysisResponse(
  analysis: AuraOutfitPhotoAnalysis,
  sourceImageUrl?: string | null,
) {
  return {
    presentation: "outfit_analysis" as const,
    title: "I found this outfit",
    reply: "I found this outfit. Review the pieces before saving or adding them to your closet.",
    reason: "",
    outfitItems: analysis.detectedPieces.map((piece) =>
      [piece.color, piece.label].filter(Boolean).join(" "),
    ),
    ownedPieces: [],
    recommendedAdditions: [],
    swapSuggestion: "",
    missingPieces: analysis.missingToComplete ?? [],
    upgradeSuggestions: [],
    upgradeSuggestionItems: [],
    chips: ["How do I improve this?", "Make it cleaner", "What is missing?"],
    look: null,
    lookOptions: [],
    outfitAnalysis: {
      ...analysis,
      sourceImageUrl: sourceImageUrl ?? null,
    },
  };
}

export async function analyzeOutfitPhoto(params: {
  client: OpenAI;
  attachments: AuraAttachmentForOutfitAnalysis[];
  userMessage: string;
}) {
  const images = params.attachments.filter(
    (attachment): attachment is AuraAttachmentForOutfitAnalysis & { uri: string } =>
      attachment.type === "image" && !!attachment.uri,
  );
  if (!images.length) return outfitPhotoAnalysisResponse(normalizeOutfitPhotoAnalysis({}));

  const response = await params.client.responses.create({
    model: "gpt-5.4",
    input: [
      {
        role: "developer",
        content:
          "You analyze worn outfit photos for a wardrobe app. Identify only visible clothing. Do not infer hidden items. Do not claim garment cutouts. Return JSON only.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `User request: ${params.userMessage || "Analyze this worn outfit photo."}\n\n` +
              "Return top, bottom, footwear, outerwear/jacket, and accessories only when visible. " +
              "Use confidence scores from 0 to 1. If shoes or accessories are cropped/hidden, omit them from detectedPieces and list them as not visible in missingToComplete.",
          },
          ...images.slice(0, 2).map((image) => ({
            type: "input_image" as const,
            image_url: image.uri,
            detail: "auto" as const,
          })),
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "outfit_photo_analysis",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            detectedPieces: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  role: { type: "string", enum: ["top", "bottom", "footwear", "outerwear", "accessory"] },
                  label: { type: "string" },
                  color: { type: ["string", "null"] },
                  confidence: { type: ["number", "null"] },
                  notes: { type: ["string", "null"] },
                },
                required: ["role", "label", "color", "confidence", "notes"],
              },
            },
            outfitVibe: { type: ["string", "null"] },
            stylingNotes: { type: "array", items: { type: "string" } },
            missingToComplete: { type: "array", items: { type: "string" } },
          },
          required: ["detectedPieces", "outfitVibe", "stylingNotes", "missingToComplete"],
        },
      },
    },
  });

  let parsed: unknown = {};
  try {
    parsed = JSON.parse(String(response.output_text || "{}"));
  } catch {
    parsed = {};
  }
  return outfitPhotoAnalysisResponse(normalizeOutfitPhotoAnalysis(parsed), images[0]?.uri ?? null);
}
