type ImageLikeItem = {
  photoUrl?: string | null;
  photos?: {
    cleanedUrl?: string | null;
    cleanedThumbUrl?: string | null;
    thumbUrl?: string | null;
    croppedUrl?: string | null;
    primaryUrl?: string | null;
    urls?: string[];
  };
};

function firstValidUrl(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const url = String(value ?? "").trim();
    if (url) return url;
  }
  return null;
}

export function getItemImageUrl(
  item: ImageLikeItem | null | undefined,
  options: { variant: "thumb" | "hero" }
): string | null {
  if (!item) return null;

  if (options.variant === "hero") {
    return firstValidUrl([
      item.photos?.cleanedUrl,
      item.photos?.cleanedThumbUrl,
      item.photos?.thumbUrl,
      item.photos?.croppedUrl,
      item.photos?.primaryUrl,
      item.photoUrl,
      item.photos?.urls?.[0],
    ]);
  }

  return firstValidUrl([
    item.photos?.cleanedThumbUrl,
    item.photos?.cleanedUrl,
    item.photos?.thumbUrl,
    item.photos?.croppedUrl,
    item.photos?.primaryUrl,
    item.photoUrl,
    item.photos?.urls?.[0],
  ]);
}

