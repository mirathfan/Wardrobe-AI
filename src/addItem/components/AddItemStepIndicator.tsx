import React from "react";
import { Text, View } from "react-native";

import { useAppTheme } from "@/src/hooks/useAppTheme";

type StepMeta = {
  id: string;
  label: string;
};

export const AddItemStepIndicator = React.memo(function AddItemStepIndicator({
  steps,
  currentStep,
}: {
  steps: readonly StepMeta[];
  currentStep: number;
}) {
  const { colors } = useAppTheme();
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {steps.map((step, index) => {
          const active = index === currentStep;
          const complete = index < currentStep;
          return (
            <View key={step.id} style={{ flex: 1, minWidth: 0, gap: 5 }}>
              <Text
                style={{
                  color: active ? colors.ctaCream : complete ? colors.text : colors.textMuted,
                  fontSize: 12,
                  lineHeight: 16,
                  fontWeight: active ? "900" : "800",
                  textAlign: "center",
                }}
                numberOfLines={1}
              >
                {step.label}
              </Text>
              <View
                style={{
                  height: 3,
                  borderRadius: 999,
                  backgroundColor: active || complete ? colors.ctaCream : colors.border,
                  opacity: active ? 1 : complete ? 0.55 : 1,
                }}
              />
            </View>
          );
        })}
      </View>
      <View
        style={{
          height: 2,
          borderRadius: 999,
          backgroundColor: "rgba(251,228,216,0.08)",
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${progress}%`,
            height: "100%",
            borderRadius: 999,
            backgroundColor: colors.ctaCream,
            opacity: 0.5,
          }}
        />
      </View>
    </View>
  );
});
