import { FieldValue, Firestore } from "firebase-admin/firestore";

export type LaundryStatus = "clean" | "needs_wash" | "in_laundry";

type WardrobeItem = Record<string, unknown> & { id: string };

const LAUNDRY_RE = /\b(laundry|wash|washed|washing|dirty|clean|cleaned|needs?\s+wash(?:ing)?|in\s+the\s+wash|in\s+laundry)\b/i;
const CLEAN_RE = /\b(clean now|washed|cleaned|done washing|fresh|dry(?:er)? done)\b/i;
const IN_LAUNDRY_RE = /\b(in laundry|in the laundry|in the wash|washing|washer|laundry basket|put .* laundry|put .* wash)\b/i;
const NEEDS_WASH_RE = /\b(dirty|needs?\s+wash(?:ing)?|need to wash|needs?\s+clean(?:ing)?|worn|sweaty)\b/i;

const STOP_WORDS = new Set([
  "my",
  "the",
  "a",
  "an",
  "these",
  "those",
  "this",
  "that",
  "clothes",
  "items",
  "laundry",
  "wash",
  "washed",
  "washing",
  "dirty",
  "clean",
  "cleaned",
  "now",
  "put",
  "mark",
  "move",
  "to",
  "in",
  "as",
  "are",
  "is",
  "need",
  "needs",
]);

function tokens(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function itemLabel(item: WardrobeItem) {
  return String(
    item.name ||
      [item.primaryColor, item.colorLabel, item.brand, item.subCategory, item.category]
        .filter(Boolean)
        .join(" ")
  ).trim();
}

function itemTokens(item: WardrobeItem) {
  return tokens(
    [
      item.id,
      item.name,
      item.brand,
      item.category,
      item.subCategory,
      item.primaryColor,
      item.colorLabel,
      Array.isArray(item.colors) ? item.colors.join(" ") : "",
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function inferStatus(message: string): LaundryStatus | null {
  if (!LAUNDRY_RE.test(message)) return null;
  if (CLEAN_RE.test(message)) return "clean";
  if (IN_LAUNDRY_RE.test(message)) return "in_laundry";
  if (NEEDS_WASH_RE.test(message)) return "needs_wash";
  return null;
}

function legacyStatus(status: LaundryStatus) {
  if (status === "clean") return "AVAILABLE";
  if (status === "in_laundry") return "IN_LAUNDRY";
  return "WORN";
}

function rankItems(message: string, items: WardrobeItem[]) {
  const messageTokens = tokens(message);
  const query = new Set(messageTokens);
  return items
    .map((item) => {
      const fields = itemTokens(item);
      const overlap = fields.filter((token) => query.has(token));
      const phraseBoost = itemLabel(item).toLowerCase() && message.toLowerCase().includes(itemLabel(item).toLowerCase()) ? 3 : 0;
      return {
        item,
        score: overlap.length + phraseBoost,
        overlap,
      };
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);
}

function responseBase(reply: string) {
  return {
    presentation: "chat" as const,
    title: "Laundry",
    reply,
    reason: "",
    outfitItems: [],
    ownedPieces: [],
    recommendedAdditions: [],
    swapSuggestion: "",
    missingPieces: [],
    upgradeSuggestions: [],
    upgradeSuggestionItems: [],
    chips: [],
    look: null,
    lookOptions: [],
  };
}

function confirmationResponse(status: LaundryStatus, matches: ReturnType<typeof rankItems>, reply: string) {
  return {
    ...responseBase(reply),
    presentation: "laundry_confirmation" as const,
    laundryAction: {
      targetStatus: status,
      matches: matches.slice(0, 6).map(({ item }) => ({
        itemId: item.id,
        label: itemLabel(item) || "Wardrobe item",
        subtitle: [item.brand, item.primaryColor || item.colorLabel, item.category].filter(Boolean).join(" · "),
      })),
    },
  };
}

export async function handleLaundryIntent(params: {
  db: Firestore;
  uid: string;
  message: string;
  items: WardrobeItem[];
}) {
  const targetStatus = inferStatus(params.message);
  if (!targetStatus) return null;

  const matches = rankItems(params.message, params.items);
  if (!matches.length) {
    return responseBase("I could not find a matching closet item. Which piece should I update?");
  }

  const best = matches[0];
  const second = matches[1];
  const highConfidence = best.score >= 2 && (!second || best.score >= second.score + 2);

  if (!highConfidence) {
    const label = targetStatus === "clean" ? "clean" : targetStatus === "in_laundry" ? "in laundry" : "needs wash";
    return confirmationResponse(targetStatus, matches, `I found ${matches.length === 1 ? "one possible match" : `${Math.min(matches.length, 6)} possible matches`}. Which one should be ${label}?`);
  }

  await params.db.collection("users").doc(params.uid).collection("items").doc(best.item.id).update({
    status: legacyStatus(targetStatus),
    laundryStatus: targetStatus,
    laundryUpdatedAt: FieldValue.serverTimestamp(),
    ...(targetStatus === "clean"
      ? {
          wearCountSinceWash: 0,
          lastWashedDate: FieldValue.serverTimestamp(),
          lastWashedAt: FieldValue.serverTimestamp(),
        }
      : {}),
  });

  const label = itemLabel(best.item).toLowerCase();
  const actionText =
    targetStatus === "clean"
      ? "marked as clean"
      : targetStatus === "in_laundry"
        ? "moved to laundry"
        : "marked as needs wash";
  return responseBase(`Done — I ${actionText} ${label ? `your ${label}` : "that item"}.`);
}
