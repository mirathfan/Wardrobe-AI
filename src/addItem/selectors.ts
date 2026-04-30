export function makeCreateSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function norm(s: string) {
  return (s || "").trim();
}

export function normColor(s: string) {
  const t = norm(s);
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export function getRefineOptions(value: number) {
  const normalizedValue = Math.max(0, Math.min(1, value));
  const edgeTighten = 0.45 + normalizedValue * 0.2;
  return {
    threshold: 0.63 + normalizedValue * 0.03,
    cleanupRadius: Math.round(2 + normalizedValue),
    feather: 0,
    edgeTighten,
    maskToAlpha: true,
  };
}

export function getRefineRequestKey(uri: string, value: number) {
  const { threshold, cleanupRadius, feather, edgeTighten } = getRefineOptions(value);
  return [uri, threshold.toFixed(2), cleanupRadius, feather, edgeTighten.toFixed(2)].join("|");
}

export function normalizeIngestionStatus(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["pending", "processing", "done", "failed"].includes(normalized)) {
    return normalized as "pending" | "processing" | "done" | "failed";
  }
  return null;
}

export function buildPhotoHash(asset: {
  fileSize?: number;
  width?: number;
  height?: number;
  fileName?: string;
  assetId?: string;
}) {
  return [
    asset.fileSize ?? 0,
    `${asset.width ?? 0}x${asset.height ?? 0}`,
    asset.fileName ?? "",
    asset.assetId ?? "",
  ].join("-");
}

export function getWarmthLabel(warmthPreference: number | null) {
  if (warmthPreference == null) return "Auto";
  if (warmthPreference < 0.34) return "Light";
  if (warmthPreference < 0.67) return "Balanced";
  return "Warm";
}

export function getSetupProgress(args: {
  hasPhoto: boolean;
  hasCategory: boolean;
  hasColors: boolean;
  hasBrandOrName: boolean;
  hasMaterialOrPattern: boolean;
}) {
  const slots = [
    args.hasPhoto,
    args.hasCategory,
    args.hasColors,
    args.hasBrandOrName,
    args.hasMaterialOrPattern,
  ];
  const completed = slots.filter(Boolean).length;
  const total = slots.length;
  const ratio = completed / total;
  return { completed, total, ratio, percent: Math.round(ratio * 100) };
}
