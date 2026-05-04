import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AppColors } from "@/constants/theme";
import AuraBackButton from "@/src/components/ui/AuraBackButton";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { safeGoBack } from "@/src/lib/navigation";

type RouterFallback = Parameters<typeof safeGoBack>[0];

type AuraSubpageHeaderProps = {
  title: string;
  eyebrow?: string | null;
  subtitle?: string | null;
  rightAction?: React.ReactNode;
  fallbackRoute?: RouterFallback;
  showBack?: boolean;
  onBack?: () => void;
  style?: StyleProp<ViewStyle>;
};

const BACK_BUTTON_SIZE = 42;

export default function AuraSubpageHeader({
  title,
  eyebrow,
  subtitle,
  rightAction,
  fallbackRoute = "/",
  showBack = true,
  onBack,
  style,
}: AuraSubpageHeaderProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const hasEyebrow = Boolean(eyebrow);
  const hasSubtitle = Boolean(subtitle);
  const styles = React.useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.content}>
        <View style={styles.actionWrap}>
          {showBack ? (
            <AuraBackButton
              onPress={onBack ?? (() => safeGoBack(fallbackRoute))}
              size={BACK_BUTTON_SIZE}
            />
          ) : null}
          {rightAction}
        </View>

        <View style={styles.titleWrap}>
          {hasEyebrow ? (
            <Text style={styles.eyebrow} numberOfLines={1} ellipsizeMode="tail">
              {eyebrow}
            </Text>
          ) : null}
          <Text style={[styles.title, hasEyebrow ? null : styles.titleWithoutEyebrow]} numberOfLines={2} ellipsizeMode="tail">
            {title}
          </Text>
          {hasSubtitle ? (
            <Text style={styles.subtitle} numberOfLines={2} ellipsizeMode="tail">
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function createStyles(colors: AppColors, safeTop: number) {
  return StyleSheet.create({
    container: {
      paddingTop: safeTop + 6,
      paddingHorizontal: 18,
      paddingBottom: 12,
      backgroundColor: "transparent",
      justifyContent: "flex-end",
    },
    content: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 16,
    },
    titleWrap: {
      flex: 1,
      minWidth: 0,
      alignItems: "flex-end",
      justifyContent: "flex-end",
      gap: 2,
    },
    actionWrap: {
      minHeight: BACK_BUTTON_SIZE,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: 10,
      paddingBottom: 1,
    },
    eyebrow: {
      color: "#DFB6B2",
      fontSize: 11.5,
      lineHeight: 15,
      fontWeight: "900",
      letterSpacing: 4.8,
      textAlign: "right",
      textTransform: "uppercase",
    },
    title: {
      color: colors.text,
      fontSize: 31,
      lineHeight: 35,
      fontWeight: "900",
      letterSpacing: 0,
      textAlign: "right",
    },
    titleWithoutEyebrow: {
      marginTop: 12,
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: "700",
      letterSpacing: 0,
      textAlign: "right",
    },
  });
}
