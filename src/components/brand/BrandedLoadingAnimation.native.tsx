import React from "react";
import type { StyleProp, ViewStyle } from "react-native";
import LottieView from "lottie-react-native";

type BrandedLoadingAnimationProps = {
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function BrandedLoadingAnimation({
  animated = true,
  style,
}: BrandedLoadingAnimationProps) {
  return (
    <LottieView
      source={require("../../../assets/animations/loading.json")}
      autoPlay={animated}
      loop={animated}
      style={style}
    />
  );
}
