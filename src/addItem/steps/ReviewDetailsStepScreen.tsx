import React from "react";
import { Text, View } from "react-native";

import { BasicsStep } from "../sections/BasicsStep";
import { DetailsStep } from "../sections/DetailsStep";

export const ReviewDetailsStepScreen = React.memo(function ReviewDetailsStepScreen({
  controller,
}: {
  controller: any;
}) {
  const { derived } = controller;

  return (
    <View style={{ gap: 14 }}>
      {!controller.state.isEdit ? (
        <View
          style={{
            borderWidth: 1,
            borderColor:
              controller.state.aiStatus === "error"
                ? "#fca5a5"
                : controller.state.aiStatus === "running"
                  ? "#cbd5e1"
                  : "#e5e7eb",
            backgroundColor:
              controller.state.aiStatus === "error"
                ? "#fef2f2"
                : controller.state.aiStatus === "running"
                  ? "#f8fafc"
                  : "#fff",
            borderRadius: 16,
            padding: 12,
            gap: 4,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "800", color: "#111" }}>
            {controller.state.aiStatus === "running"
              ? controller.state.aiStage
                ? `Analyzing photo: ${controller.state.aiStage}…`
                : "Analyzing photo…"
              : controller.state.aiStatus === "error"
                ? "AI couldn’t finish autofill"
                : "Review AI details"}
          </Text>
          <Text style={{ color: "#666", fontSize: 13 }}>
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
