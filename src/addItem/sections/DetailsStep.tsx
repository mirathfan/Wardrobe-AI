import React from "react";
import { Text, View } from "react-native";
import { Category, isValidCategorySubCategory } from "../../shared/wardrobeTaxonomy";
import { makeDevThrottleLogger } from "../devPerf";
import { ChipRow } from "../ui/ChipRow";
import { Field } from "../ui/Field";
import { Pill } from "../ui/Pill";
import { RequiredBadge } from "../ui/RequiredBadge";
import { SectionCard } from "../ui/SectionCard";
import { SectionTitle } from "../ui/SectionTitle";

export const DetailsStep = React.memo(function DetailsStep({ controller }: { controller: any }) {
  const { state, derived, actions } = controller;
  const logRender = React.useMemo(() => makeDevThrottleLogger("DetailsStep"), []);
  logRender({
    aiStatus: state.aiStatus,
    category: state.category,
    colors: state.selectedColors.length,
  });
  const statusPillStyles =
    derived.aiStatusPill.tone === "error"
      ? { borderColor: "#fca5a5", backgroundColor: "#fef2f2", color: "#b91c1c" }
      : derived.aiStatusPill.tone === "ready"
        ? { borderColor: "#86efac", backgroundColor: "#f0fdf4", color: "#166534" }
        : derived.aiStatusPill.tone === "running"
          ? { borderColor: "#cbd5e1", backgroundColor: "#f8fafc", color: "#334155" }
          : { borderColor: "#e5e7eb", backgroundColor: "#fff", color: "#4b5563" };

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
            <Text key={`${line}-${index}`} style={{ color: "#666" }}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
      {derived.aiSuggestions.length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, color: "#666", fontWeight: "700" }}>Suggested</Text>
          <ChipRow>
            {derived.aiSuggestions.map((suggestion: any) => (
              <Pill key={suggestion.key} label={suggestion.label} active={false} onPress={suggestion.onPress} />
            ))}
          </ChipRow>
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: "700" }}>Category</Text>
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
        <Text style={{ fontSize: 16, fontWeight: "700" }}>Sub-category (optional)</Text>
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
        <Text style={{ color: "#666" }}>
          Selected: {state.selectedColors.length ? state.selectedColors.join(" / ") : "Auto (AI)"}
        </Text>
      </Field>
    </SectionCard>
  );
});
