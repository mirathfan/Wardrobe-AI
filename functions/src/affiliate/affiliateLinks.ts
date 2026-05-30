import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger, setLogContext, tracedHandler } from "../shared/logger";

import { assertFunctionRateLimit, RATE_LIMITS, redactUid } from "../shared/rateLimit";

type BuildAffiliateUrlOptions = {
  customId?: string | null;
};

const NON_MERCHANT_HOST_RE =
  /(^|\.)((google|googleadservices|gstatic|serpapi|skimresources)\.com|google\.[a-z.]+)$/i;

function normalizedHttpUrl(productUrl: string) {
  try {
    const url = new URL(productUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("unsupported_protocol");
    }
    return url.toString();
  } catch {
    throw new HttpsError("invalid-argument", "A valid product URL is required.");
  }
}

export function isDirectMerchantUrl(productUrl: string) {
  try {
    const url = new URL(productUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.replace(/^www\d*\./i, "").toLowerCase();
    if (!host || NON_MERCHANT_HOST_RE.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function cleanCustomId(customId?: string | null) {
  return String(customId ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]+/g, "-")
    .slice(0, 80);
}

export function buildAffiliateUrl(
  productUrl: string,
  options: BuildAffiliateUrlOptions = {},
) {
  const safeProductUrl = normalizedHttpUrl(productUrl);
  const parsedProductUrl = new URL(safeProductUrl);
  if (/skimresources\.com$/i.test(parsedProductUrl.hostname)) {
    return safeProductUrl;
  }
  if (!isDirectMerchantUrl(safeProductUrl)) {
    return safeProductUrl;
  }

  const skimlinksId = String(process.env.SKIMLINKS_ID ?? "").trim();
  if (!skimlinksId) {
    logger.warn("[AFFILIATE_LINKS] SKIMLINKS_ID missing; returning product URL.");
    return safeProductUrl;
  }

  const affiliateUrl = new URL("https://go.skimresources.com/");
  affiliateUrl.searchParams.set("id", skimlinksId);
  affiliateUrl.searchParams.set("xs", "1");
  affiliateUrl.searchParams.set("url", safeProductUrl);
  const customId = cleanCustomId(options.customId);
  if (customId) affiliateUrl.searchParams.set("xcust", customId);
  return affiliateUrl.toString();
}

export const wrapAffiliateLinks = onCall(tracedHandler(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Please sign in first.");
  }
  setLogContext({ uidHash: redactUid(uid) });
  await assertFunctionRateLimit(uid, "affiliateLinks", RATE_LIMITS.affiliateLinks);

  const urls: unknown[] = Array.isArray(request.data?.productUrls)
    ? request.data.productUrls
    : [request.data?.productUrl];
  const productUrls = urls
    .map((value: unknown) => String(value ?? "").trim())
    .filter(Boolean)
    .slice(0, 10);

  if (!productUrls.length) {
    throw new HttpsError("invalid-argument", "At least one product URL is required.");
  }

  return {
    ok: true,
    links: productUrls.map((productUrl: string, index: number) => {
      const safeProductUrl = normalizedHttpUrl(productUrl);
      return {
        productUrl: safeProductUrl,
        affiliateUrl: buildAffiliateUrl(safeProductUrl, {
          customId: `${uid}:${index}`,
        }),
      };
    }),
  };
}));
