import React from "react";
import { StyleSheet, View } from "react-native";

import { AuraButton, AuraText } from "@/src/components/ui/auraStylePrimitives";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

type Props = {
  selectedDate: Date;
  today: Date;
  onJumpToToday: () => void;
};

export default function CalendarHeader({ selectedDate, today, onJumpToToday }: Props) {
  const layout = useResponsiveLayout();

  const isToday =
    selectedDate.getFullYear() === today.getFullYear() &&
    selectedDate.getMonth() === today.getMonth() &&
    selectedDate.getDate() === today.getDate();

  return (
    <View style={[styles.wrap, { gap: 8 }]}>
      <AuraText variant="metadata" tone="accent" style={styles.kicker}>
        Plan the week
      </AuraText>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 3 }}>
          <AuraText variant="title" style={[styles.title, { fontSize: 30 * layout.titleScale }]}>
            Calendar
          </AuraText>
          <AuraText variant="caption" tone="secondary" style={styles.date}>
            Plan outfits by date
          </AuraText>
        </View>
        {!isToday ? (
          <AuraButton
            label="Today"
            onPress={onJumpToToday}
            variant="tertiary"
            size="small"
            haptic="selection"
            hapticTrigger="press"
            pressedScale={0.96}
            style={styles.todayBtn}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 8,
  },
  kicker: { letterSpacing: 1.5, textTransform: "uppercase" },
  title: { letterSpacing: 0 },
  date: { marginTop: 2, fontSize: 14, lineHeight: 22, opacity: 0.65 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  todayBtn: {
    minHeight: 34,
  },
});
