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

export default function AppImage({ resizeMode, ...props }: AppImageProps) {
  return <FastImage {...props} resizeMode={toFastImageResizeMode(resizeMode)} />;
}
