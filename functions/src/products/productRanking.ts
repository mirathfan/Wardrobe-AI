import type { NormalizedSearchRequest, ProductOption, ProductTier } from "./types";

const BLOCKED_RE =
  /\b(kids?|toddler|baby|costume|cosplay|doll|toy|sewing pattern|wholesale|replica|fake|dupe|used|pre-owned|preowned|refurbished|ebay|poshmark|mercari)\b/i;

const KNOWN_FASHION_MERCHANTS = [
  "Nike",
  "Adidas",
  "Nordstrom",
  "Macy's",
  "H&M",
  "Zara",
  "ASOS",
  "SSENSE",
  "Farfetch",
  "Net-a-Porter",
  "Bloomingdale's",
  "Uniqlo",
  "Abercrombie",
  "Urban Outfitters",
  "Revolve",
  "END Clothing",
  "Gap",
  "Banana Republic",
  "J.Crew",
  "COS",
  "Mango",
];

const CATEGORY_TERMS: Record<NonNullable<NormalizedSearchRequest["category"]>, string[]> = {
  tops: ["shirt", "tee", "t-shirt", "top", "polo", "sweater", "blouse", "oxford"],
  bottoms: ["trouser", "pant", "jean", "chino", "skirt", "short"],
  footwear: ["sneaker", "shoe", "boot", "loafer", "sandal"],
  outerwear: ["jacket", "coat", "blazer", "bomber", "overshirt", "outerwear"],
  accessories: ["belt", "watch", "bag", "hat", "cap", "sunglasses", "scarf"],
};

function clean(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s'-]+/g, " ")
    .replace(/\s+/g, " ");
}

function tokens(value: string) {
  return clean(value).split(/\s+/).filter((token) => token.length > 2);
}

function merchantKnown(merchant: string) {
  const cleanMerchant = clean(merchant);
  return KNOWN_FASHION_MERCHANTS.some((known) => cleanMerchant.includes(clean(known)));
}

function hasAny(text: string, values: string[]) {
  const cleanText = clean(text);
  return values.some((value) => cleanText.includes(clean(value)));
}

function titleWordScore(title: string, itemType: string) {
  const titleText = clean(title);
  const itemTokens = tokens(itemType);
  if (!itemTokens.length) return 0;
  return itemTokens.reduce((score, token) => score + (titleText.includes(token) ? 6 : 0), 0);
}

function priceTierScore(productTier: ProductTier, request: NormalizedSearchRequest) {
  if (request.budgetPreference && productTier === request.budgetPreference) return 12;
  if (request.priceTiers.includes(productTier)) return 8;
  return -2;
}

function scoreProduct(product: ProductOption, request: NormalizedSearchRequest) {
  const title = clean(product.title);
  const merchant = clean(product.merchant);
  const badText = `${title} ${merchant}`;
  if (BLOCKED_RE.test(badText)) return -999;

  let score = 0;
  if (product.affiliateEligible) score += 14;
  if (product.imageUrl) score += 10;
  if (typeof product.price === "number") score += 9;
  score += titleWordScore(product.title, request.itemType);
  if (request.preferredColors.some((color) => title.includes(clean(color)))) score += 8;
  if (request.category && hasAny(product.title, CATEGORY_TERMS[request.category])) score += 9;
  if (request.styleTags.some((tag) => title.includes(clean(tag)))) score += 4;
  if (merchantKnown(product.merchant)) score += 9;
  if (typeof product.rating === "number" && product.rating >= 4) score += 4;
  if (typeof product.reviews === "number" && product.reviews > 20) score += 3;
  score += priceTierScore(product.tier, request);
  if (!product.productUrl) score -= 50;
  if (!titleWordScore(product.title, request.itemType)) score -= 8;
  return score;
}

function diversifyByTier(products: ProductOption[], maxResults: number) {
  const selected: ProductOption[] = [];
  const seenMerchants = new Set<string>();
  const tiers: ProductTier[] = ["budget", "mid", "premium"];

  for (const tier of tiers) {
    if (selected.length >= maxResults) break;
    const candidate = products.find((product) => {
      const merchant = clean(product.merchant);
      return product.tier === tier && !selected.includes(product) && !seenMerchants.has(merchant);
    });
    if (!candidate) continue;
    selected.push(candidate);
    seenMerchants.add(clean(candidate.merchant));
  }

  for (const product of products) {
    if (selected.length >= maxResults) break;
    const merchant = clean(product.merchant);
    if (selected.includes(product) || seenMerchants.has(merchant)) continue;
    selected.push(product);
    seenMerchants.add(merchant);
  }

  for (const product of products) {
    if (selected.length >= maxResults) break;
    if (!selected.includes(product)) selected.push(product);
  }

  return selected;
}

export function rankAndFilterProducts(
  products: ProductOption[],
  request: NormalizedSearchRequest,
) {
  const scored = products
    .map((product) => ({
      product,
      score: scoreProduct(product, request),
    }))
    .filter((entry) => entry.score >= 30)
    .sort((a, b) => b.score - a.score)
    .map((entry) => ({
      ...entry.product,
      confidenceScore: Math.max(0, Math.min(100, Math.round(entry.score))),
    }));

  return diversifyByTier(scored, request.maxResults);
}
