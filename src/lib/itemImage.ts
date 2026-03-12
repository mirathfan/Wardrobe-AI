type ImageLikeItem = {
  photoUrl?: string | null;
  photoUri?: string | null;
  cleanedUrl?: string | null;
  cleanedPhotoUrl?: string | null;
  cleanedLocalUri?: string | null;
  pendingPhotoUri?: string | null;
  photos?: {
    cleanedUrl?: string | null;
    cleanedPhotoUrl?: string | null;
    cleanedThumbUrl?: string | null;
    thumbUrl?: string | null;
    croppedUrl?: string | null;
    primaryUrl?: string | null;
    urls?: string[];
  };
};

function firstValidUrl(values: (string | null | undefined)[]): string | null {
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
      item.photos?.cleanedPhotoUrl,
      item.cleanedPhotoUrl,
      item.photos?.cleanedUrl,
      item.cleanedUrl,
      item.cleanedLocalUri,
      item.photoUrl,
      item.photoUri,
      item.photos?.primaryUrl,
      item.photos?.cleanedThumbUrl,
      item.photos?.thumbUrl,
      item.photos?.croppedUrl,
      item.pendingPhotoUri,
      item.photos?.urls?.[0],
    ]);
  }

  return firstValidUrl([
    item.photos?.cleanedPhotoUrl,
    item.cleanedPhotoUrl,
    item.photos?.cleanedUrl,
    item.cleanedUrl,
    item.cleanedLocalUri,
    item.photos?.cleanedThumbUrl,
    item.photoUrl,
    item.photoUri,
    item.photos?.thumbUrl,
    item.photos?.croppedUrl,
    item.photos?.primaryUrl,
    item.pendingPhotoUri,
    item.photos?.urls?.[0],
  ]);
}
