import React from "react";
import { View } from "react-native";

import { AddItemOptionalSections } from "../components/AddItemOptionalSections";

export const MoreDetailsStepScreen = React.memo(function MoreDetailsStepScreen({
  controller,
}: {
  controller: any;
}) {
  return (
    <View style={{ gap: 14 }}>
      <AddItemOptionalSections controller={controller} />
    </View>
  );
});
