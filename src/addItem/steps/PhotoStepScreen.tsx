import React from "react";
import { View } from "react-native";

import { PhotoStep } from "../sections/PhotoStep";

export const PhotoStepScreen = React.memo(function PhotoStepScreen({
  controller,
}: {
  controller: any;
}) {
  return (
    <View style={{ gap: 14 }}>
      <PhotoStep controller={controller} />
    </View>
  );
});
