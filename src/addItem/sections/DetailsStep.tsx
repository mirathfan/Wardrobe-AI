import React from "react";
import { Text, View } from "react-native";
import { Category, isValidCategorySubCategory } from "../../shared/wardrobeTaxonomy";
import { makeDevThrottleLogger } from "../devPerf";
import { ChipRow } from "../ui/ChipRow";
import { Field } from "../ui/Field";
import { MemoTextInputField } from "../ui/MemoTextInputField";
import { Pill } from "../ui/Pill";
import { RequiredBadge } from "../ui/RequiredBadge";
import { SectionCard } from "../ui/SectionCard";
import { SectionTitle } from "../ui/SectionTitle";
import { useAppTheme } from "@/src/hooks/useAppTheme";

export const DetailsStep = React.memo(function DetailsStep({ controller }: { controller: any }) {
  const { state, derived, actions } = controller;
  const { colors } = useAppTheme();
  const logRender = React.useMemo(() => makeDevThrottleLogger("DetailsStep"), []);
  logRender({
    aiStatus: state.aiStatus,
    category: state.category,
    colors: state.selectedColors.length,
  });
  const statusPillStyles =
    derived.aiStatusPill.tone === "error"
      ? { borderColor: "rgba(255,77,79,0.32)", backgroundColor: "rgba(255,77,79,0.09)", color: colors.danger }
      : derived.aiStatusPill.tone === "ready"
        ? { borderColor: "rgba(34,197,94,0.26)", backgroundColor: "rgba(34,197,94,0.09)", color: colors.success }
        : derived.aiStatusPill.tone === "running"
          ? { borderColor: colors.purpleBorder, backgroundColor: colors.purpleSurface, color: colors.lightPurple }
          : { borderColor: colors.border, backgroundColor: colors.chipBackground, color: colors.textSecondary };

  return (
    <SectionCard>
      <SectionTitle title="Details" />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <View
          style={{
            borderWidth: 1,
            borderRadius: 999,
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderColor: statusPillStyles.borderColor,
            backgroundColor: statusPillStyles.backgroundColor,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "700", color: statusPillStyles.color }}>
            {derived.aiStatusPill.label}
          </Text>
        </View>
        {derived.canApplyAiSuggestions ? (
          <Pill label="Apply" active={false} onPress={actions.applyAiSuggestions} />
        ) : null}
      </View>
      {derived.aiStatusRows.length ? (
        <View style={controller.styles.inlineInfo}>
          {derived.aiStatusRows.map((line: string, index: number) => (
            <Text key={`${line}-${index}`} style={{ color: colors.textSecondary }}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
      {derived.aiSuggestions.length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, color: colors.textSecondary, fontWeight: "800" }}>Suggested</Text>
          <ChipRow>
            {derived.aiSuggestions.map((suggestion: any) => (
              <Pill key={suggestion.key} label={suggestion.label} active={false} onPress={suggestion.onPress} />
            ))}
          </ChipRow>
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>Category</Text>
          <RequiredBadge />
        </View>
        <ChipRow>
          <Pill
            label="Auto (AI)"
            active={!state.category}
            onPress={() => {
              actions.clearUserEdited("category", "subCategory");
              actions.setCategory(null);
              actions.setSubCategory("");
            }}
          />
          {derived.CATEGORIES.map((cat: string) => (
            <Pill
              key={cat}
              label={cat}
              active={state.category === cat}
              onPress={() => {
                actions.markUserEdited("category", "subCategory");
                actions.setCategory(cat as Category);
                actions.setSubCategory("");
              }}
            />
          ))}
        </ChipRow>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>Sub-category (optional)</Text>
        <ChipRow>
          <Pill
            label="Auto (AI)"
            active={!state.subCategory}
            onPress={() => {
              actions.clearUserEdited("subCategory");
              actions.setSubCategory("");
            }}
          />
          {derived.SUB_CATEGORIES[derived.selectedCategory].map((sub: string) => (
            <Pill
              key={sub}
              label={sub}
              active={state.subCategory === sub}
              onPress={() => {
                actions.markUserEdited("subCategory");
                if (isValidCategorySubCategory(derived.selectedCategory, sub)) {
                  actions.setSubCategory(sub);
                }
              }}
            />
          ))}
        </ChipRow>
      </View>

      <Field label="Colors">
        <ChipRow>
          <Pill
            label="Auto (AI)"
            active={state.selectedColors.length === 0}
            onPress={() => {
              actions.clearUserEdited("colors");
              actions.setSelectedColors([]);
              actions.setAddingCustomColor(false);
            }}
          />
          {derived.colorOptions.map((c: string) => (
            <Pill
              key={c}
              label={c}
              active={state.selectedColors.includes(c)}
              onPress={() => {
                actions.markUserEdited("colors");
                actions.toggleColor(c);
              }}
            />
          ))}
        </ChipRow>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
          Selected: {state.selectedColors.length ? state.selectedColors.join(" / ") : "Auto (AI)"}
        </Text>
      </Field>

      <Field label="Display Color">
        <MemoTextInputField
          value={state.displayColor}
          onCommit={(value) => {
            actions.markUserEdited("displayColor");
            actions.setDisplayColor(value);
          }}
          placeholder="e.g., light blue"
        />
        {state.displayColors.length ? (
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            Visible colors: {state.displayColors.join(" / ")}
          </Text>
        ) : null}
      </Field>
    </SectionCard>
  );
});
