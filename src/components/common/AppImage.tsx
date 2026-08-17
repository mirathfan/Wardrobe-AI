import FastImage, { type FastImageProps, type ResizeMode } from "@d11/react-native-fast-image";
import React from "react";
import type { ImageProps } from "react-native";

type ReactNativeImageResizeMode = NonNullable<ImageProps["resizeMode"]>;

export type AppImageResizeMode = ResizeMode | ReactNativeImageResizeMode;

type AppImageProps = Omit<FastImageProps, "resizeMode"> & {
  resizeMode?: AppImageResizeMode;
};

function toFastImageResizeMode(resizeMode?: AppImageResizeMode): ResizeMode | undefined {
  switch (resizeMode) {
    case "contain":
    case "cover":
    case "stretch":
    case "center":
      return resizeMode;
    case "repeat":
      return "cover";
    default:
      return resizeMode as ResizeMode | undefined;
  }
}

function normalizeFastImageSource(source: FastImageProps["source"]) {
  if (!source || typeof source === "number" || Array.isArray(source)) return source;
  if (!source.uri) return source;
  return {
    priority: "normal" as const,
    cache: "immutable" as const,
    ...source,
  };
}

export default function AppImage({ resizeMode, source, ...props }: AppImageProps) {
  return <FastImage {...props} source={normalizeFastImageSource(source)} resizeMode={toFastImageResizeMode(resizeMode)} />;
}
