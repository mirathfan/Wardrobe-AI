import React from "react";
import { Text, View } from "react-native";

import { BasicsStep } from "../sections/BasicsStep";
import { DetailsStep } from "../sections/DetailsStep";
import { useAppTheme } from "@/src/hooks/useAppTheme";

export const ReviewDetailsStepScreen = React.memo(function ReviewDetailsStepScreen({
  controller,
}: {
  controller: any;
}) {
  const { derived } = controller;
  const { colors } = useAppTheme();
  const aiCardTone =
    controller.state.aiStatus === "error"
      ? {
          borderColor: "rgba(255,77,79,0.32)",
          backgroundColor: "rgba(255,77,79,0.09)",
          titleColor: colors.danger,
        }
      : controller.state.aiStatus === "running"
        ? {
            borderColor: colors.purpleBorder,
            backgroundColor: colors.purpleSurface,
            titleColor: colors.lightPurple,
          }
        : {
            borderColor: colors.border,
            backgroundColor: colors.chipBackground,
            titleColor: colors.text,
          };

  return (
    <View style={{ gap: 14 }}>
      {!controller.state.isEdit ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: aiCardTone.borderColor,
            backgroundColor: aiCardTone.backgroundColor,
            borderRadius: 16,
            padding: 12,
            gap: 4,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "900", color: aiCardTone.titleColor }}>
            {controller.state.aiStatus === "running"
              ? controller.state.aiStage
                ? `Analyzing photo: ${controller.state.aiStage}…`
                : "Analyzing photo…"
              : controller.state.aiStatus === "error"
                ? "AI couldn’t finish autofill"
                : "Review AI details"}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
            {controller.state.aiStatus === "running"
              ? "You can keep editing while the AI fills in category, color, and details."
              : controller.state.autofillError
                ? controller.state.autofillError
                : controller.state.lastAutofillSummary || "Detected fields will appear here as they arrive."}
          </Text>
        </View>
      ) : null}
      {derived.showBasics ? <BasicsStep controller={controller} /> : null}
      {derived.showDetails ? <DetailsStep controller={controller} /> : null}
    </View>
  );
});
