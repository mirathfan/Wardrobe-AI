import React from "react";
import { Text } from "react-native";
import { makeDevThrottleLogger } from "../devPerf";
import { Field } from "../ui/Field";
import { MemoTextInputField } from "../ui/MemoTextInputField";
import { SectionCard } from "../ui/SectionCard";
import { SectionTitle } from "../ui/SectionTitle";
import { useAppTheme } from "@/src/hooks/useAppTheme";

export const BasicsStep = React.memo(function BasicsStep({ controller }: { controller: any }) {
  const { state, actions } = controller;
  const { colors } = useAppTheme();
  const logRender = React.useMemo(() => makeDevThrottleLogger("BasicsStep"), []);
  logRender({ brand: !!state.brand, name: !!state.name });

  return (
    <SectionCard>
      <SectionTitle title="Basics" />
      <Field label="Brand">
        <MemoTextInputField
          value={state.brand}
          onCommit={(value) => {
            actions.markUserEdited("brand");
            actions.setBrand(value);
          }}
          placeholder="e.g., Nike"
        />
        {state.detectedBrand ? (
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
            Auto (AI): {state.detectedBrand}
            {typeof state.detectedBrandConfidence === "number"
              ? ` (${Math.round(state.detectedBrandConfidence * 100)}%)`
              : ""}
          </Text>
        ) : null}
      </Field>
      <Field label="Product name">
        <MemoTextInputField
          value={state.name}
          onCommit={(value) => {
            actions.markUserEdited("name");
            actions.setName(value);
          }}
          placeholder="e.g., Air Jordan 2"
        />
      </Field>
    </SectionCard>
  );
});
