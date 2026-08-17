import React from "react";
import { View } from "react-native";

import { DetailsStep } from "../sections/DetailsStep";

export const ReviewDetailsStepScreen = React.memo(function ReviewDetailsStepScreen({
  controller,
}: {
  controller: any;
}) {
  return (
    <View style={{ gap: 14 }}>
      <DetailsStep controller={controller} />
    </View>
  );
});
