type ImageLikeItem = {
  photoUrl?: string | null;
  photoUri?: string | null;
  normalizedUrl?: string | null;
  cleanedUrl?: string | null;
  cleanedPhotoUrl?: string | null;
  cleanedSource?: string | null;
  cleanedLocalUri?: string | null;
  pendingPhotoUri?: string | null;
  photos?: {
    originalUrl?: string | null;
    normalizedUrl?: string | null;
    previewUrl?: string | null;
    cleanedUrl?: string | null;
    cleanedPhotoUrl?: string | null;
    cleanedSource?: string | null;
    cleanedThumbUrl?: string | null;
    thumbUrl?: string | null;
    croppedUrl?: string | null;
    primaryUrl?: string | null;
    urls?: string[];
  };
};

function isValidImageUrl(value: string | null | undefined): boolean {
  const url = String(value ?? "").trim();
  if (!url) return false;
  if (url.startsWith("file://")) return true;
  if (!/^https?:\/\//i.test(url)) return false;
  return true;
}

function firstValidUrl(values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const url = String(value ?? "").trim();
    if (isValidImageUrl(url)) return url;
  }
  return null;
}

function getCleanedSource(item: ImageLikeItem): string {
  const explicit = String(item.photos?.cleanedSource ?? item.cleanedSource ?? "")
    .trim()
    .toLowerCase();
  if (explicit) return explicit;

  const cleanedCandidate = String(
    item.photos?.normalizedUrl ??
      item.normalizedUrl ??
      item.photos?.cleanedUrl ??
      item.cleanedUrl ??
      item.photos?.cleanedPhotoUrl ??
      item.cleanedPhotoUrl ??
      ""
  ).trim().toLowerCase();

  if (
    cleanedCandidate.endsWith(".png") ||
    cleanedCandidate.includes(".cleaned.png") ||
    cleanedCandidate.includes("%2fitems%2f") && cleanedCandidate.includes(".cleaned.png") ||
    cleanedCandidate.includes("vision-cutout")
  ) {
    return "vision";
  }

  return "";
}

export function getItemImageUrl(
  item: ImageLikeItem | null | undefined,
  options: { variant: "thumb" | "hero" }
): string | null {
  if (!item) return null;
  const cleanedSource = getCleanedSource(item);
  const preferredVisionCleaned =
    cleanedSource === "vision"
      ? [
          item.photos?.normalizedUrl,
          item.normalizedUrl,
          item.photos?.previewUrl,
          item.photos?.cleanedUrl,
          item.cleanedUrl,
          item.photos?.cleanedPhotoUrl,
          item.cleanedPhotoUrl,
        ]
      : [];
  const fallbackCleaned = [
    item.photos?.normalizedUrl,
    item.normalizedUrl,
    item.photos?.previewUrl,
    item.photos?.cleanedUrl,
    item.cleanedUrl,
    item.photos?.cleanedPhotoUrl,
    item.cleanedPhotoUrl,
  ];

  if (options.variant === "hero") {
    return firstValidUrl([
      ...preferredVisionCleaned,
      item.photos?.primaryUrl,
      item.photoUrl,
      item.photoUri,
      ...fallbackCleaned,
      item.cleanedLocalUri,
      item.pendingPhotoUri,
      item.photos?.cleanedThumbUrl,
      item.photos?.thumbUrl,
      item.photos?.croppedUrl,
      item.photos?.urls?.[0],
    ]);
  }

  return firstValidUrl([
    ...preferredVisionCleaned,
    item.photos?.primaryUrl,
    item.photoUrl,
    item.photoUri,
    ...fallbackCleaned,
    item.cleanedLocalUri,
    item.pendingPhotoUri,
    item.photos?.cleanedThumbUrl,
    item.photos?.thumbUrl,
    item.photos?.croppedUrl,
    item.photos?.urls?.[0],
  ]);
}
