import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { Fonts, type AppColors } from "@/constants/theme";
import AuraPressable from "@/src/components/aura/AuraPressable";
import AuraAgentOutfitCarousel, {
  getCurrentAgentCarouselOutfit,
} from "@/src/components/aura/AuraAgentOutfitCarousel";
import {
  AuraAgentOutfitDetailsPanel,
  prepareAuraAgentOldStyleOutfitCardModel,
} from "@/src/components/aura/AuraAgentOldStyleOutfitCard";
import {
  auraCardStyle,
  auraSpacing,
  auraTypography,
} from "@/src/components/ui/auraStylePrimitives";
import { decorateAuraAgentActionForState } from "@/src/lib/auraAgentActions";
import type {
  AuraAgentOutfit,
  AuraAgentOutfitActionState,
  AuraAgentResponse,
  AuraAgentSuggestedAction,
} from "@/src/types/auraAgent";

import AuraAgentActionRail from "./AuraAgentActionRail";

function actionKey(action: AuraAgentSuggestedAction) {
  const payload = action.payload ?? {};
  return [
    action.type,
    payload.feedbackType ?? action.id,
    payload.mode ?? "",
    payload.query ?? "",
  ].join(":");
}

function withDefaultActions(
  actions: AuraAgentSuggestedAction[],
  hasOutfit: boolean,
) {
  const visible = actions.filter((action) => action.type !== "debug" || __DEV__);
  if (!hasOutfit) return visible;
  const defaults: AuraAgentSuggestedAction[] = [
    {
      id: "agent-save-preference",
      label: "Save Preference",
      type: "feedback",
      payload: { mode: "feedback", feedbackType: "save" },
    },
    {
      id: "agent-wear-feedback",
      label: "Wore This",
      type: "feedback",
      payload: { mode: "feedback", feedbackType: "wear" },
    },
    {
      id: "agent-plan-outfit",
      label: "Plan this",
      type: "feedback",
      payload: { mode: "feedback", feedbackType: "manual_note", action: "plan_outfit" },
    },
    {
      id: "agent-more-like-this",
      label: "More Like This",
      type: "feedback",
      payload: { mode: "feedback", feedbackType: "more_like_this" },
    },
    {
      id: "agent-not-my-vibe",
      label: "Not My Vibe",
      type: "feedback",
      payload: { mode: "feedback", feedbackType: "not_my_vibe" },
    },
    {
      id: "agent-explain-outfit",
      label: "Explain",
      type: "explain",
      payload: { mode: "explain_outfit", query: "Explain why this outfit works" },
    },
    {
      id: "agent-less-formal",
      label: "Make it less formal",
      type: "refine",
      payload: { mode: "refine_outfit", query: "Make it less formal" },
    },
    {
      id: "agent-different-shoes",
      label: "Different shoes",
      type: "refine",
      payload: { mode: "refine_outfit", query: "Different shoes" },
    },
  ];
  const merged: AuraAgentSuggestedAction[] = [];
  const seen = new Set<string>();
  for (const action of defaults) {
    if (seen.has(actionKey(action))) continue;
    merged.push(action);
    seen.add(actionKey(action));
  }
  for (const action of visible) {
    if (seen.has(actionKey(action))) continue;
    merged.push(action);
    seen.add(actionKey(action));
  }
  return merged.slice(0, 8);
}

function ExplanationBlock({
  colors,
  response,
  showRationales,
}: {
  colors: AppColors;
  response: AuraAgentResponse;
  showRationales: boolean;
}) {
  const rationales = showRationales ? response.explanation?.itemRationales ?? [] : [];
  if (!rationales.length && !response.feedback) return null;
  return (
    <View
      style={{
        ...auraCardStyle(colors, "inset"),
        gap: auraSpacing.sm,
      }}
    >
      {response.feedback ? (
        <View style={{ gap: 4 }}>
          <Text style={[auraTypography.eyebrow, { color: colors.textMuted }]}>
            Preference
          </Text>
          <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary, fontFamily: Fonts.sans }]}>
            {response.feedback.message}
          </Text>
        </View>
      ) : null}
      {rationales.length ? (
        <View style={{ gap: auraSpacing.sm }}>
          <Text style={[auraTypography.eyebrow, { color: colors.textMuted }]}>
            Why It Works
          </Text>
          {rationales.slice(0, 6).map((entry, index) => (
            <View key={`${entry.name}-${entry.role}-${index}`} style={{ gap: 2 }}>
              <Text
                style={[auraTypography.body, { color: colors.text, fontWeight: "700", fontFamily: Fonts.sans }]}
                numberOfLines={1}
              >
                {[entry.role, entry.name].filter(Boolean).join(" • ")}
              </Text>
              <Text style={[auraTypography.caption, { color: colors.textSecondary, fontFamily: Fonts.sans }]}>
                {entry.reason}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function DevDiagnosticsBlock({
  colors,
  diagnostics,
  requestedCount,
  returnedOutfitCount,
  selectedOutfitIndex,
  selectedOutfit,
}: {
  colors: AppColors;
  diagnostics?: Record<string, unknown>;
  requestedCount?: number;
  returnedOutfitCount: number;
  selectedOutfitIndex: number;
  selectedOutfit?: AuraAgentOutfit | null;
}) {
  const [open, setOpen] = React.useState(false);
  if (!__DEV__) return null;

  const keys = Object.keys(diagnostics ?? {}).slice(0, 4);

  return (
    <View style={{ gap: 6, alignItems: "flex-start" }}>
      <AuraPressable
        onPress={() => setOpen((current) => !current)}
        haptic="selection"
        hapticTrigger="press"
        pressedOpacity={0.84}
        pressedScale={0.98}
        accessibilityRole="button"
        accessibilityLabel={open ? "Hide AURA diagnostics" : "Show AURA diagnostics"}
        style={{
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.borderSoft,
          backgroundColor: colors.surfaceMuted,
          minHeight: 30,
          paddingHorizontal: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Text style={[auraTypography.caption, { color: colors.textMuted, fontFamily: Fonts.sans, fontWeight: "700" }]}>
          Dev details
        </Text>
      </AuraPressable>
      {open ? (
        <View style={{ gap: 4 }}>
          <Text style={[auraTypography.caption, { color: colors.textMuted, fontFamily: Fonts.mono }]}>
            requestedCount: {requestedCount ?? "n/a"} · returnedOutfitCount: {returnedOutfitCount} · selectedOutfitIndex: {selectedOutfitIndex}
          </Text>
          <Text style={[auraTypography.caption, { color: colors.textMuted, fontFamily: Fonts.mono }]}>
            selectedOutfit: {selectedOutfit?.outfitId ?? "n/a"} · {selectedOutfit?.title ?? "n/a"} · confidence {selectedOutfit?.confidence == null ? "n/a" : Number(selectedOutfit.confidence).toFixed(2)}
          </Text>
          <Text style={[auraTypography.caption, { color: colors.textMuted, fontFamily: Fonts.mono }]}>
            Diagnostics keys: {keys.length ? keys.join(", ") : "available"}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function SelectedOutfitWhyThisWorks({
  colors,
  outfit,
}: {
  colors: AppColors;
  outfit: AuraAgentOutfit | null;
}) {
  const [open, setOpen] = React.useState(false);
  const model = React.useMemo(
    () => (outfit ? prepareAuraAgentOldStyleOutfitCardModel(outfit) : null),
    [outfit],
  );

  if (!outfit || !model) return null;

  return (
    <View testID="aura-agent-selected-details" style={{ alignItems: "flex-start", gap: auraSpacing.sm }}>
      <AuraPressable
        onPress={() => setOpen((current) => !current)}
        haptic="selection"
        hapticTrigger="press"
        pressedOpacity={0.84}
        pressedScale={0.98}
        accessibilityRole="button"
        accessibilityLabel={open ? "Hide selected outfit details" : "Show why this works"}
        style={{
          alignItems: "center",
          backgroundColor: colors.chipBackground,
          borderColor: colors.borderSoft,
          borderRadius: 999,
          borderWidth: 1,
          flexDirection: "row",
          gap: 6,
          minHeight: 34,
          paddingHorizontal: 12,
        }}
      >
        <Text style={[auraTypography.body, { color: colors.textSecondary, fontFamily: Fonts.sans, fontSize: 13, fontWeight: "800", lineHeight: 17 }]}>
          Why this works
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={15}
          color={colors.textSecondary}
        />
      </AuraPressable>
      {open ? <AuraAgentOutfitDetailsPanel colors={colors} model={model} /> : null}
    </View>
  );
}

export default function AuraAgentMessage({
  colors,
  response,
  selectedOutfitId,
  disabled = false,
  loadingActionId = null,
  agentActionStates,
  onSelectOutfit,
  onAction,
}: {
  colors: AppColors;
  response: AuraAgentResponse;
  selectedOutfitId?: string | null;
  disabled?: boolean;
  loadingActionId?: string | null;
  agentActionStates?: Record<string, AuraAgentOutfitActionState>;
  onSelectOutfit?: (outfit: AuraAgentOutfit) => void;
  onAction?: (action: AuraAgentSuggestedAction, outfit?: AuraAgentOutfit | null) => void;
}) {
  const outfits = React.useMemo(() => response.outfits ?? [], [response.outfits]);
  const [activeOutfitId, setActiveOutfitId] = React.useState<string | null>(
    selectedOutfitId ?? outfits[0]?.outfitId ?? null,
  );
  const selectedOutfitIdInResponse = selectedOutfitId && outfits.some((outfit) => outfit.outfitId === selectedOutfitId)
    ? selectedOutfitId
    : null;
  const effectiveSelectedOutfitId = selectedOutfitIdInResponse ?? activeOutfitId;
  const selectedOutfit =
    getCurrentAgentCarouselOutfit(outfits, effectiveSelectedOutfitId, 0);
  const selectedOutfitIndex = Math.max(
    0,
    selectedOutfit
      ? outfits.findIndex((outfit) => outfit.outfitId === selectedOutfit.outfitId)
      : -1,
  );
  const selectedActionState = selectedOutfit
    ? agentActionStates?.[selectedOutfit.outfitId]
    : undefined;
  const actions = React.useMemo(
    () =>
      withDefaultActions(response.suggestedActions ?? [], !!selectedOutfit).map((action) =>
        decorateAuraAgentActionForState(action, selectedActionState),
      ),
    [response.suggestedActions, selectedActionState, selectedOutfit],
  );
  React.useEffect(() => {
    setActiveOutfitId((current) => {
      if (selectedOutfitIdInResponse) return selectedOutfitIdInResponse;
      if (current && outfits.some((outfit) => outfit.outfitId === current)) return current;
      return outfits[0]?.outfitId ?? null;
    });
  }, [outfits, selectedOutfitIdInResponse]);

  const handleSelectedOutfitChange = React.useCallback(
    (outfit: AuraAgentOutfit) => {
      setActiveOutfitId(outfit.outfitId);
      onSelectOutfit?.(outfit);
    },
    [onSelectOutfit],
  );

  return (
    <View style={{ alignSelf: "stretch", gap: auraSpacing.md, width: "100%" }}>
      <AuraAgentOutfitCarousel
        colors={colors}
        outfits={outfits}
        selectedOutfitId={effectiveSelectedOutfitId}
        onSelectedOutfitChange={handleSelectedOutfitChange}
      />
      <SelectedOutfitWhyThisWorks colors={colors} outfit={selectedOutfit} />
      {!selectedOutfit ? <ExplanationBlock colors={colors} response={response} showRationales /> : null}
      {actions.length ? (
        <View style={{ alignSelf: "stretch", paddingTop: 2, paddingBottom: 22, width: "100%" }}>
          <AuraAgentActionRail
            colors={colors}
            actions={actions}
            disabled={disabled}
            loadingActionId={loadingActionId}
            onAction={(action) => onAction?.(action, selectedOutfit)}
          />
        </View>
      ) : null}
      <DevDiagnosticsBlock
        colors={colors}
        diagnostics={response.diagnostics}
        requestedCount={response.requestedCount}
        returnedOutfitCount={outfits.length}
        selectedOutfitIndex={selectedOutfitIndex}
        selectedOutfit={selectedOutfit}
      />
    </View>
  );
}
