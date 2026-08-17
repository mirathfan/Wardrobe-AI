import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AuraBackButton from "@/src/components/ui/AuraBackButton";
import { useAppTheme } from "@/src/hooks/useAppTheme";

export const AddItemHeader = React.memo(function AddItemHeader({
  title,
  eyebrow,
  onBack,
  canDuplicate,
  duplicateActive,
  duplicateLabel = "Duplicate",
  onDuplicate,
}: {
  title: string;
  eyebrow: string;
  onBack: () => void;
  canDuplicate: boolean;
  duplicateActive?: boolean;
  duplicateLabel?: string;
  onDuplicate: () => void;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        paddingTop: insets.top + 6,
        paddingHorizontal: 16,
        paddingBottom: 8,
      }}
    >
      <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <AuraBackButton onPress={onBack} size={36} />
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Text
            style={{
              color: "#DFB6B2",
              fontSize: 10.5,
              lineHeight: 14,
              fontWeight: "900",
              letterSpacing: 2.7,
            }}
            numberOfLines={1}
          >
            {eyebrow}
          </Text>
          <Text
            style={{
              color: colors.text,
              fontSize: 24,
              lineHeight: 29,
              fontWeight: "900",
              letterSpacing: 0,
            }}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
        {canDuplicate ? (
          <Pressable
            onPress={onDuplicate}
            hitSlop={8}
            style={({ pressed }) => ({
              minHeight: 36,
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: 9,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: duplicateActive ? colors.purpleBorder : colors.border,
              backgroundColor: duplicateActive ? colors.purpleSurface : "rgba(43,18,76,0.28)",
              opacity: pressed ? 0.78 : 1,
            })}
          >
            <Ionicons
              name={duplicateActive ? "checkmark" : "copy-outline"}
              size={14}
              color={duplicateActive ? colors.ctaCream : colors.textSecondary}
            />
            <Text
              style={{
                color: duplicateActive ? colors.ctaCream : colors.textSecondary,
                fontSize: 12,
                lineHeight: 16,
                fontWeight: "800",
              }}
              numberOfLines={1}
            >
              {duplicateActive ? "Duplicated" : duplicateLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});
