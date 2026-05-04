import React from "react";
import { Pressable, Text, View } from "react-native";

import { Category, isValidCategorySubCategory } from "../../shared/wardrobeTaxonomy";
import { titleCaseLabel } from "../controllerShared";
import { Field } from "../ui/Field";
import { MemoTextInputField } from "../ui/MemoTextInputField";
import { SectionCard } from "../ui/SectionCard";
import { useAppTheme } from "@/src/hooks/useAppTheme";

export const AddItemDetailsPanel = React.memo(function AddItemDetailsPanel({
  controller,
}: {
  controller: any;
}) {
  const { state, derived, actions } = controller;
  const { colors } = useAppTheme();
  const [showAllSubCategories, setShowAllSubCategories] = React.useState(false);
  const [showAllColors, setShowAllColors] = React.useState(false);

  const categoryLabel = state.category ? titleCaseLabel(state.category) : "Choose category";
  const subCategoryOptions = derived.SUB_CATEGORIES[derived.selectedCategory] ?? [];
  const visibleSubCategories = compactOptions(subCategoryOptions, state.subCategory, showAllSubCategories ? 100 : 5);
  const colorOptions = compactOptions(derived.colorOptions, state.selectedColors[0], showAllColors ? 100 : 6);
  const selectedColorLabel = state.selectedColors.length ? state.selectedColors.join(" / ") : "Choose color";
  const aiStatusColor =
    derived.aiStatusPill.tone === "error"
      ? colors.danger
      : derived.aiStatusPill.tone === "warning"
        ? colors.warning
        : derived.aiStatusPill.tone === "running"
          ? colors.lightPurple
          : derived.aiStatusPill.tone === "ready"
            ? colors.success
            : colors.textSecondary;

  return (
    <SectionCard>
      <View style={{ gap: 16 }}>
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <View style={{ gap: 2, flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: "900" }}>
                Details
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }} numberOfLines={2}>
                Required fields are grouped here.
              </Text>
            </View>
            <View
              style={{
                maxWidth: 190,
                minHeight: 30,
                paddingHorizontal: 10,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(251,228,216,0.10)",
                backgroundColor: "rgba(43,18,76,0.34)",
              }}
            >
              <Text style={{ color: aiStatusColor, fontSize: 11.5, lineHeight: 15, fontWeight: "900" }} numberOfLines={1}>
                {derived.aiStatusPill.label}
              </Text>
            </View>
          </View>

          {derived.canApplyAiSuggestions ? (
            <Pressable
              onPress={actions.applyAiSuggestions}
              hitSlop={6}
              style={({ pressed }) => ({
                minHeight: 40,
                alignSelf: "flex-start",
                justifyContent: "center",
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.purpleBorder,
                backgroundColor: colors.purpleSurface,
                opacity: pressed ? 0.78 : 1,
              })}
            >
              <Text style={{ color: colors.ctaCream, fontSize: 12, lineHeight: 16, fontWeight: "900" }}>
                Apply AI suggestions
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ gap: 12 }}>
          <Field
            label="Brand"
            right={
              !String(state.brand ?? "").trim() ? (
                <InlineTextAction
                  label="Unbranded"
                  onPress={() => {
                    actions.markUserEdited("brand");
                    actions.setBrand("Unbranded");
                  }}
                />
              ) : null
            }
          >
            <MemoTextInputField
              value={state.brand}
              onCommit={(value) => {
                actions.markUserEdited("brand");
                actions.setBrand(value);
              }}
              placeholder="e.g., Uniqlo"
            />
            {state.detectedBrand ? (
              <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
                Detected: {state.detectedBrand}
                {typeof state.detectedBrandConfidence === "number"
                  ? ` (${Math.round(state.detectedBrandConfidence * 100)}%)`
                  : ""}
              </Text>
            ) : null}
            {!String(state.brand ?? "").trim() ? <InlineWarning message="Brand is required." /> : null}
          </Field>

          <Field label="Item name">
            <MemoTextInputField
              value={state.name}
              onCommit={(value) => {
                actions.markUserEdited("name");
                actions.setName(value);
              }}
              placeholder="e.g., Blue relaxed denim jeans"
            />
            {!String(state.name ?? "").trim() ? <InlineWarning message="Item name is required." /> : null}
          </Field>
        </View>

        <SelectorBlock
          label="Category"
          selected={categoryLabel}
          error={!state.category ? "Choose a category." : null}
        >
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {derived.CATEGORIES.map((cat: string) => (
              <CompactChip
                key={cat}
                label={titleCaseLabel(cat)}
                active={state.category === cat}
                onPress={() => {
                  actions.markUserEdited("category", "subCategory");
                  actions.setCategory(cat as Category);
                  actions.setSubCategory("");
                }}
              />
            ))}
          </View>
        </SelectorBlock>

        <SelectorBlock
          label="Subcategory"
          selected={state.subCategory ? titleCaseLabel(state.subCategory) : "Auto"}
        >
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <CompactChip
              label="Auto"
              active={!state.subCategory}
              onPress={() => {
                actions.clearUserEdited("subCategory");
                actions.setSubCategory("");
              }}
            />
            {visibleSubCategories.map((sub: string) => (
              <CompactChip
                key={sub}
                label={titleCaseLabel(sub)}
                active={state.subCategory === sub}
                onPress={() => {
                  actions.markUserEdited("subCategory");
                  if (isValidCategorySubCategory(derived.selectedCategory, sub)) {
                    actions.setSubCategory(sub);
                  }
                }}
              />
            ))}
            {subCategoryOptions.length > 5 ? (
              <CompactChip
                label={showAllSubCategories ? "Less" : "More"}
                active={showAllSubCategories}
                onPress={() => setShowAllSubCategories((prev) => !prev)}
              />
            ) : null}
          </View>
        </SelectorBlock>

        <SelectorBlock
          label="Color"
          selected={selectedColorLabel}
          error={state.selectedColors.length === 0 ? "Choose at least one color." : null}
        >
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {colorOptions.map((color: string) => (
              <CompactChip
                key={color}
                label={color}
                active={state.selectedColors.includes(color)}
                onPress={() => {
                  actions.markUserEdited("colors");
                  actions.toggleColor(color);
                }}
              />
            ))}
            {derived.colorOptions.length > 6 ? (
              <CompactChip
                label={showAllColors ? "Less" : "More"}
                active={showAllColors}
                onPress={() => setShowAllColors((prev) => !prev)}
              />
            ) : null}
          </View>
          {state.aiColorNeedsReview ? (
            <Text style={{ color: colors.warning, fontSize: 12, lineHeight: 17, fontWeight: "700" }}>
              {"Closest color selected from AURA's display color. Confirm if needed."}
            </Text>
          ) : null}
        </SelectorBlock>

        <Field label="Display color">
          <MemoTextInputField
            value={state.displayColor}
            onCommit={(value) => {
              actions.markUserEdited("displayColor");
              actions.setDisplayColor(value);
            }}
            placeholder="e.g., light blue"
          />
          {state.displayColors.length ? (
            <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
              Visible colors: {state.displayColors.join(" / ")}
            </Text>
          ) : null}
        </Field>
      </View>
    </SectionCard>
  );
});

function compactOptions(options: readonly string[], selected: string | null | undefined, limit: number) {
  const next = selected ? [selected, ...options.filter((option) => option !== selected)] : options;
  return next.slice(0, limit);
}

const SelectorBlock = React.memo(function SelectorBlock({
  label,
  selected,
  error,
  children,
}: {
  label: string;
  selected: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  const { colors } = useAppTheme();

  return (
    <View style={{ gap: 9 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Text style={{ color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: "900" }}>
          {label}
        </Text>
        <Text
          style={{ color: error ? colors.warning : colors.ctaCream, fontSize: 13, lineHeight: 18, fontWeight: "800" }}
          numberOfLines={1}
        >
          {selected}
        </Text>
      </View>
      {children}
      {error ? <InlineWarning message={error} /> : null}
    </View>
  );
});

const CompactChip = React.memo(function CompactChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        minHeight: 40,
        justifyContent: "center",
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? colors.purpleBorder : colors.border,
        backgroundColor: active ? colors.purpleSurface : colors.chipBackground,
        opacity: pressed ? 0.76 : 1,
      })}
    >
      <Text
        style={{
          color: active ? colors.ctaCream : colors.textSecondary,
          fontSize: 12.5,
          lineHeight: 16,
          fontWeight: "900",
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
});

const InlineTextAction = React.memo(function InlineTextAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();

  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text style={{ color: colors.ctaCream, fontSize: 12, lineHeight: 17, fontWeight: "900" }}>
        {label}
      </Text>
    </Pressable>
  );
});

const InlineWarning = React.memo(function InlineWarning({ message }: { message: string }) {
  const { colors } = useAppTheme();

  return (
    <Text style={{ color: colors.warning, fontSize: 12, lineHeight: 17, fontWeight: "700" }}>
      {message}
    </Text>
  );
});
