import React from "react";
import { Text, View } from "react-native";
import { Category, isValidCategorySubCategory } from "../../../../src/shared/wardrobeTaxonomy";
import { ChipRow } from "../ui/ChipRow";
import { Field } from "../ui/Field";
import { Pill } from "../ui/Pill";
import { RequiredBadge } from "../ui/RequiredBadge";
import { SectionCard } from "../ui/SectionCard";
import { SectionTitle } from "../ui/SectionTitle";

export const DetailsStep = React.memo(function DetailsStep({ controller }: { controller: any }) {
  const { state, derived, actions } = controller;

  return (
    <SectionCard>
      <SectionTitle title="Details" />
      <View style={controller.styles.inlineInfo}>
        {derived.aiStatusRows.map((line: string, index: number) => (
          <Text key={`${line}-${index}`} style={{ color: "#666" }}>
            {line}
          </Text>
        ))}
      </View>
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
