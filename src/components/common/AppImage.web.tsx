import React from "react";
import { Image, type ImageProps, type ImageSourcePropType } from "react-native";

type ReactNativeImageResizeMode = NonNullable<ImageProps["resizeMode"]>;

export type AppImageResizeMode = ReactNativeImageResizeMode | "contain" | "cover" | "stretch" | "center";

type FastImageLikeSource =
  | ImageSourcePropType
  | {
      uri?: string;
      headers?: Record<string, string>;
      priority?: "low" | "normal" | "high";
      cache?: "immutable" | "web" | "cacheOnly";
    };

type AppImageProps = Omit<ImageProps, "source" | "resizeMode"> & {
  source?: FastImageLikeSource;
  resizeMode?: AppImageResizeMode;
};

function toImageResizeMode(resizeMode?: AppImageResizeMode): ReactNativeImageResizeMode | undefined {
  switch (resizeMode) {
    case "contain":
    case "cover":
    case "stretch":
    case "repeat":
    case "center":
      return resizeMode;
    default:
      return undefined;
  }
}

function toImageSource(source?: FastImageLikeSource): ImageSourcePropType | undefined {
  if (!source || typeof source === "number" || Array.isArray(source)) {
    return source;
  }

  const { uri, headers } = source;
  return uri ? { uri, headers } : undefined;
}

export default function AppImage({ resizeMode, source, ...props }: AppImageProps) {
  return <Image {...props} source={toImageSource(source)} resizeMode={toImageResizeMode(resizeMode)} />;
}
