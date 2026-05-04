import type { ClothingItem } from "@/src/types/ClothingItem";
import { normalizeCurrencyCode } from "@/src/lib/currency";

export type InventoryValueSummary = {
  total: number;
  pricedItemCount: number;
  otherCurrencyItemCount: number;
};

function parseInventoryAmount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string") return null;

  const text = value.trim();
  if (!text) return null;
  const match = text.match(/\d(?:[\d,.]*\d)?/);
  if (!match) return null;

  const remainder = `${text.slice(0, match.index)}${text.slice((match.index ?? 0) + match[0].length)}`;
  const unsupportedRemainder = remainder
    .replace(/\b(?:USD|INR|EUR|GBP|CAD|AUD|AED)\b/gi, "")
    .replace(/US\$|CA\$|C\$|AU\$|A\$|\$|₹|€|£|د\.إ/gi, "")
    .replace(/[\s()/-]/g, "");
  if (unsupportedRemainder) return null;

  const numeric = match[0];
  const lastComma = numeric.lastIndexOf(",");
  const lastDot = numeric.lastIndexOf(".");
  let normalized = numeric;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized =
      lastComma > lastDot
        ? numeric.replace(/\./g, "").replace(",", ".")
        : numeric.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const decimalDigits = numeric.length - lastComma - 1;
    normalized = decimalDigits === 2 ? numeric.replace(",", ".") : numeric.replace(/,/g, "");
  }
  normalized = normalized.replace(/[^0-9.]/g, "");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return null;
  return Math.round(amount * 100) / 100;
}

export function itemInventoryValue(item: Partial<ClothingItem>): number | null {
  const candidates = [
    item.estimatedValue,
    item.purchasePrice,
    item.price,
    item.priceAmount,
    item.retailPrice,
    item.value,
  ];
  for (const candidate of candidates) {
    const value = parseInventoryAmount(candidate);
    if (value != null) return value;
  }
  return null;
}

export function summarizeInventoryValue(
  items: Partial<ClothingItem>[],
  preferredCurrency: string,
): InventoryValueSummary {
  const preferred = normalizeCurrencyCode(preferredCurrency) ?? "USD";
  return items.reduce<InventoryValueSummary>(
    (summary, item) => {
      const amount = itemInventoryValue(item);
      if (amount == null) return summary;
      const itemCurrency = normalizeCurrencyCode(item.currency ?? item.priceCurrency) ?? "USD";
      if (itemCurrency === preferred) {
        summary.total += amount;
        summary.pricedItemCount += 1;
      } else {
        summary.otherCurrencyItemCount += 1;
      }
      return summary;
    },
    { total: 0, pricedItemCount: 0, otherCurrencyItemCount: 0 },
  );
}
