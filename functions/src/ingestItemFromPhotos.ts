import { createHash } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { Category, SUB_CATEGORIES, isValidCategorySubCategory, wearSlot } from "./shared/wardrobeTaxonomy";

if (!getApps().length) {
  initializeApp();
}

type IngestionStatus = "pending" | "processing" | "done" | "failed";

type ItemDoc = {
  category?: string;
  subCategory?: string;
  photos?: {
    primaryUrl?: string | null;
    urls?: string[];
  };
  photoUrl?: string | null;
  photoUri?: string | null;
  ingestion?: {
    status?: IngestionStatus;
    lastRunAt?: Timestamp | { toMillis?: () => number } | number | null;
    error?: { message: string; code?: string };
    lastProcessedPhotoHash?: string;
  };
};

type RawExtraction = {
  category?: string;
  subCategory?: string;
  colors?: string[];
  pattern?: string;
  material?: string;
  formalityScore?: number;
  warmthScore?: number;
};
type LastRunAtValue = Timestamp | { toMillis?: () => number } | number | null | undefined;

const MODEL = "gpt-4.1-mini";
const HOUR_MS = 60 * 60 * 1000;
const ALLOWED_PATTERNS = new Set([
  "solid",
  "striped",
  "graphic",
  "checked",
  "textured",
  "unknown",
]);
const ALLOWED_COLORS = new Set([
  "black",
  "white",
  "grey",
  "navy",
  "blue",
  "green",
  "red",
  "brown",
  "beige",
  "cream",
  "yellow",
  "orange",
  "purple",
  "pink",
]);

function toMillis(value: LastRunAtValue): number | null {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (typeof value === "object" && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  return null;
}

function extractPhotoUrls(item: ItemDoc): string[] {
  const values = [
    item.photos?.primaryUrl ?? "",
    ...(Array.isArray(item.photos?.urls) ? item.photos!.urls : []),
    item.photoUrl ?? "",
    item.photoUri ?? "",
  ];

  const deduped = Array.from(new Set(values.map((v) => String(v).trim()).filter(Boolean)));
  return deduped.filter((url) => /^https?:\/\//i.test(url));
}

function hashPhotoUrls(urls: string[]): string {
  return createHash("sha1").update(urls.join("|")).digest("hex");
}

function clampScore(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function normalizePattern(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (ALLOWED_PATTERNS.has(raw)) return raw;
  return "unknown";
}

function normalizeMaterial(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw || "unknown";
}

function normalizeCategory(value: unknown): Category | null {
  const raw = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!raw) return null;
  if (raw === "shoes" || raw === "shoe") return Category.FOOTWEAR;
  if (raw === "onepiece") return Category.ONE_PIECE;
  if (Object.values(Category).includes(raw as Category)) return raw as Category;
  return null;
}

function normalizeSubCategory(value: unknown): string | null {
  const raw = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  return raw || null;
}

function normalizeColors(values: unknown): string[] {
  if (!Array.isArray(values)) return [];

  const out: string[] = [];
  for (const entry of values) {
    const raw = String(entry ?? "").trim().toLowerCase();
    if (!raw) continue;

    const mapped =
      raw === "gray" ? "grey" :
      raw === "tan" ? "beige" :
      raw === "off white" || raw === "off-white" ? "cream" :
      raw === "light blue" || raw === "sky blue" || raw === "baby blue" ? "blue" :
      raw === "maroon" ? "red" :
      raw === "olive" ? "green" :
      raw;

    if (ALLOWED_COLORS.has(mapped) && !out.includes(mapped)) {
      out.push(mapped);
    }
  }

  return out;
}

function applyScoreConstraints(
  category: Category,
  subCategory: string,
  formalityScore: number,
  warmthScore: number
): { formalityScore: number; warmthScore: number } {
  let nextFormality = formalityScore;
  let nextWarmth = warmthScore;

  if (subCategory === "tshirt") {
    nextFormality = Math.min(nextFormality, 0.5);
    nextWarmth = Math.min(nextWarmth, 0.4);
  }

  if (
    category === Category.TOP &&
    ["hoodie", "sweatshirt", "sweater"].includes(subCategory)
  ) {
    nextWarmth = Math.max(nextWarmth, 0.6);
  }

  return {
    formalityScore: clampScore(nextFormality),
    warmthScore: clampScore(nextWarmth),
  };
}

function safeJsonExtract(text: string): RawExtraction | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  const raw = text.slice(start, end + 1);
  try {
    return JSON.parse(raw) as RawExtraction;
  } catch {
    return null;
  }
}

async function extractWithOpenAI(photoUrl: string): Promise<RawExtraction> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: {type: "json_object"},
      messages: [
        {
          role: "system",
          content: [
            "Classify one clothing item from the image.",
            "Return strict JSON only with keys:",
            "category, subCategory, colors, pattern, material, formalityScore, warmthScore.",
            "No markdown, no extra keys, no prose.",
            "Do not hallucinate brand names or logos.",
            "Extract garment color only; ignore background objects, lighting casts, shadows, and skin tones.",
            "If uncertain about material or pattern, return 'unknown'.",
            "Use strict scoring rubric with anchors:",
            "formalityScore: 0.0 gym/lounge tee, 0.3 casual everyday, 0.5 smart-casual knit, 0.7 business-casual shirt/blazer mix, 0.9 formal tailoring.",
            "warmthScore: 0.0 very light sleeveless/summer fabric, 0.3 light short-sleeve cotton, 0.5 midweight long-sleeve, 0.7 hoodie/sweater, 0.9 heavy coat/insulated outerwear.",
            "Hard constraints: if subCategory is tshirt then formalityScore <= 0.5 and warmthScore <= 0.4.",
            "Hard constraints: if category is top and subCategory is hoodie, sweatshirt, or sweater then warmthScore >= 0.6.",
            `Valid categories: ${Object.values(Category).join(", ")}.`,
            `Valid subCategory map: ${JSON.stringify(SUB_CATEGORIES)}.`,
          ].join(" "),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "Analyze this garment photo.",
                "Prefer visible garment type.",
                "If uncertain, pick the closest valid category/subCategory and use unknown for uncertain fields.",
                "Keep colors to simple lowercase names.",
              ].join(" "),
            },
            {
              type: "image_url",
              image_url: {url: photoUrl},
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${body.slice(0, 240)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content ?? "";
  const parsed = safeJsonExtract(content);
  if (!parsed) {
    throw new Error("OpenAI returned invalid JSON payload");
  }

  return parsed;
}

export const ingestItemFromPhotos = onDocumentWritten(
  {
    document: "users/{uid}/items/{itemId}",
    secrets: ["OPENAI_API_KEY"],
  },
  async (event) => {
    const uid = String(event.params.uid ?? "");
    const itemId = String(event.params.itemId ?? "");
    const before = event.data?.before.data() as ItemDoc | undefined;
    const after = event.data?.after.data() as ItemDoc | undefined;
    if (!after) return;

    const photoUrls = extractPhotoUrls(after);
    if (photoUrls.length === 0) {
      logger.info("Skipping ingestion: no photo URLs", {uid, itemId});
      return;
    }

    const photoHash = hashPhotoUrls(photoUrls);
    const status = after.ingestion?.status;
    const lastRunAtMs = toMillis(after.ingestion?.lastRunAt);
    const lastHash = after.ingestion?.lastProcessedPhotoHash ?? before?.ingestion?.lastProcessedPhotoHash ?? "";
    const hasNewPhoto = lastHash !== photoHash;

    const retryBlocked =
      status === "failed" &&
      !hasNewPhoto &&
      !!lastRunAtMs &&
      Date.now() - lastRunAtMs < HOUR_MS;

    const shouldRun =
      (!status || status === "pending") ||
      ((status === "done" || status === "processing" || status === "failed") && hasNewPhoto);

    if (!shouldRun || retryBlocked) {
      logger.info("Skipping ingestion: conditions not met", {
        uid,
        itemId,
        status: status ?? "missing",
        hasNewPhoto,
        retryBlocked,
      });
      return;
    }

    const db = getFirestore();
    const ref = db.doc(`users/${uid}/items/${itemId}`);

    logger.info("Ingestion transition", {uid, itemId, from: status ?? "missing", to: "processing"});
    await ref.set({
      ingestion: {
        status: "processing",
        lastRunAt: FieldValue.serverTimestamp(),
        lastProcessedPhotoHash: photoHash,
      },
    }, {merge: true});

    try {
      const extracted = await extractWithOpenAI(photoUrls[0]);
      let warning: string | null = null;

      let category = normalizeCategory(extracted.category);
      let subCategory = normalizeSubCategory(extracted.subCategory);

      if (!category) {
        category = Category.TOP;
        subCategory = "tshirt";
        warning = "Invalid category from classifier; fallback applied.";
      } else if (!subCategory) {
        subCategory = SUB_CATEGORIES[category][0];
        warning = "Sub-category missing; defaulted by category.";
      } else if (!isValidCategorySubCategory(category, subCategory)) {
        subCategory = SUB_CATEGORIES[category][0];
        warning = "Invalid sub-category from classifier; defaulted by category.";
      }

      const pattern = normalizePattern(extracted.pattern);
      const material = normalizeMaterial(extracted.material);
      const colors = normalizeColors(extracted.colors);
      const constrainedScores = applyScoreConstraints(
        category,
        subCategory,
        clampScore(extracted.formalityScore),
        clampScore(extracted.warmthScore)
      );
      const formalityScore = constrainedScores.formalityScore;
      const warmthScore = constrainedScores.warmthScore;

      await ref.set({
        category,
        subCategory,
        wearSlot: wearSlot(category),
        pattern,
        material,
        colors,
        formalityScore,
        warmthScore,
        photos: {
          primaryUrl: photoUrls[0],
          urls: photoUrls,
        },
        ingestion: {
          status: "done",
          lastRunAt: FieldValue.serverTimestamp(),
          lastProcessedPhotoHash: photoHash,
          ...(warning ? {error: {message: warning, code: "warning"}} : {}),
        },
      }, {merge: true});

      logger.info("Ingestion transition", {
        uid,
        itemId,
        from: "processing",
        to: "done",
        category,
        subCategory,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown ingestion error";
      logger.error("Ingestion failed", {uid, itemId, error: message});

      await ref.set({
        ingestion: {
          status: "failed",
          lastRunAt: FieldValue.serverTimestamp(),
          lastProcessedPhotoHash: photoHash,
          error: {message},
        },
      }, {merge: true});
    }
  }
);
