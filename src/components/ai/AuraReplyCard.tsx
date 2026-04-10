import React from "react";
import { Text, View } from "react-native";

import { Fonts } from "@/constants/theme";
import { AuraLookCard } from "@/src/components/aura/AuraLookCard";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { sanitizeDisplayText } from "@/src/lib/text";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { AuraResponse } from "@/src/types/aura";

export default function AuraReplyCard({
  data,
  itemsById,
  onAction,
}: {
  data: AuraResponse;
  itemsById: Map<string, ClothingItem>;
  onAction?: (action: import("@/src/types/aura").AuraLookAction) => void;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const ownedPieces = data.ownedPieces?.filter(Boolean) ?? [];
  const recommendedAdditions = data.recommendedAdditions?.filter(Boolean) ?? [];
  const fallbackItems =
    !ownedPieces.length && !recommendedAdditions.length
      ? data.outfitItems?.filter(Boolean).slice(0, 5) ?? []
      : [];

  if (data.look) {
    return (
      <View style={{ gap: 12, width: "100%" }}>
        {(!!data.reply || !!data.title) && (
          <View style={{ gap: 6, paddingHorizontal: 2 }}>
            <Text
              style={{
                color: "rgba(255,255,255,0.42)",
                fontSize: 10.5,
                fontWeight: "700",
                letterSpacing: 0.95,
                fontFamily: Fonts.sans,
              }}
            >
              AURA
            </Text>
            {!!data.reply && (
              <Text
                style={{
                  color: colors.text,
                  fontSize: 15.5,
                  lineHeight: 22,
                  fontWeight: "500",
                  fontFamily: Fonts.sans,
                  maxWidth: "94%",
                }}
              >
                {sanitizeDisplayText(data.reply)}
              </Text>
            )}
          </View>
        )}

        <AuraLookCard colors={colors} look={data.look} itemsById={itemsById} onAction={onAction} />
      </View>
    );
  }

  return (
    <View
      style={{
        borderRadius: layout.mediumRadius + 2,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.055)",
        backgroundColor: "rgba(255,255,255,0.028)",
        paddingHorizontal: layout.cardPadding - 2,
        paddingVertical: layout.screenSize === "compact" ? 12 : 13,
        gap: 9,
        maxWidth: 332,
        shadowColor: "#000",
        shadowOpacity: 0.14,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 10 },
      }}
    >
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 16,
          right: 16,
          height: 1,
          backgroundColor: "rgba(143,216,255,0.18)",
        }}
      />

      <View style={{ gap: 4 }}>
        <Text
          style={{
            color: "rgba(255,255,255,0.42)",
            fontSize: 10.5,
            fontWeight: "700",
            letterSpacing: 0.95,
            fontFamily: Fonts.sans,
          }}
        >
          AURA
        </Text>
        <Text
          style={{
            color: colors.text,
            fontSize: 18,
            lineHeight: 22,
            fontWeight: "700",
            letterSpacing: -0.35,
            fontFamily: Fonts.sans,
          }}
        >
          {sanitizeDisplayText(data.title) || "AURA"}
        </Text>
      </View>

      <Text
        style={{
          color: colors.text,
          fontSize: 14.5,
          lineHeight: 21,
          fontWeight: "500",
          fontFamily: Fonts.sans,
        }}
      >
        {sanitizeDisplayText(data.reply)}
      </Text>

      {!!ownedPieces.length && !data.look && (
        <View style={{ gap: 7 }}>
          <Text
            style={{
              color: "rgba(143,216,255,0.84)",
              fontSize: 10.5,
              fontWeight: "700",
              letterSpacing: 0.8,
              fontFamily: Fonts.sans,
            }}
          >
            FROM YOUR CLOSET
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {ownedPieces.slice(0, 5).map((item) => (
              <Tag key={`owned-${item}`} label={sanitizeDisplayText(item)} colors={colors} tone="owned" />
            ))}
          </View>
        </View>
      )}

      {!!recommendedAdditions.length && !data.look && (
        <View style={{ gap: 7 }}>
          <Text
            style={{
              color: "rgba(255,255,255,0.56)",
              fontSize: 10.5,
              fontWeight: "700",
              letterSpacing: 0.8,
              fontFamily: Fonts.sans,
            }}
          >
            ADD TO COMPLETE IT
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {recommendedAdditions.slice(0, 5).map((item) => (
              <Tag
                key={`add-${item}`}
                label={sanitizeDisplayText(item)}
                colors={colors}
                tone="suggested"
              />
            ))}
          </View>
        </View>
      )}

      {!!fallbackItems.length && !data.look && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
          {fallbackItems.map((item) => (
            <Tag key={`fallback-${item}`} label={sanitizeDisplayText(item)} colors={colors} tone="default" />
          ))}
        </View>
      )}

      {!!data.reason && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
          <Text style={{ color: "rgba(255,255,255,0.42)", fontSize: 10.5, fontWeight: "700", letterSpacing: 0.6 }}>
            WHY
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 12,
              lineHeight: 17,
              flex: 1,
              fontFamily: Fonts.sans,
            }}
          >
            {sanitizeDisplayText(data.reason)}
          </Text>
        </View>
      )}

      {!!data.swapSuggestion && !data.look && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
          <Text style={{ color: "rgba(255,255,255,0.42)", fontSize: 10.5, fontWeight: "700", letterSpacing: 0.6 }}>
            SWAP
          </Text>
          <Text
            style={{
              color: colors.text,
              fontSize: 12,
              lineHeight: 17,
              fontWeight: "500",
              flex: 1,
              fontFamily: Fonts.sans,
            }}
          >
            {sanitizeDisplayText(data.swapSuggestion)}
          </Text>
        </View>
      )}
    </View>
  );
}

function Tag({
  label,
  colors,
  tone,
}: {
  label: string;
  colors: ReturnType<typeof useAppTheme>["colors"];
  tone: "owned" | "suggested" | "default";
}) {
  const backgroundColor =
    tone === "owned"
      ? "rgba(143,216,255,0.12)"
      : tone === "suggested"
        ? "rgba(255,255,255,0.05)"
        : "rgba(255,255,255,0.04)";
  const borderColor =
    tone === "owned" ? "rgba(143,216,255,0.18)" : "rgba(255,255,255,0.04)";
  const textColor = tone === "owned" ? "#d7f2ff" : colors.text;

  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor,
        borderWidth: 1,
        borderColor,
      }}
    >
      <Text
        style={{
          color: textColor,
          fontSize: 10.5,
          fontWeight: "600",
          fontFamily: Fonts.sans,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
