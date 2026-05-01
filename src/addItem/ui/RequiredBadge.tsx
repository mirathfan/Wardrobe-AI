import React from "react";
import { Text, View } from "react-native";

import { useAppTheme } from "@/src/hooks/useAppTheme";

export const RequiredBadge = React.memo(function RequiredBadge() {
  const { colors } = useAppTheme();

  return (
    <View
      style={{
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 999,
        backgroundColor: colors.purpleSurface,
        borderWidth: 1,
        borderColor: colors.purpleBorder,
      }}
    >
      <Text style={{ color: colors.lightPurple, fontSize: 11, fontWeight: "900" }}>
        Required
      </Text>
    </View>
  );
});
