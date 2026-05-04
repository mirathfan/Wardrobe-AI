import React from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import {
  auraButtonStyle,
  auraButtonTextStyle,
  auraCardStyle,
  auraSheetBackdropStyle,
  auraTypography,
} from "@/src/components/ui/auraStylePrimitives";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

type Option = { id: string; label: string };

type Props = {
  visible: boolean;
  title: string;
  options: Option[];
  onSelect: (id: string) => void;
  onClear?: () => void;
  onClose: () => void;
};

export default function SwapSheet({ visible, title, options, onSelect, onClear, onClose }: Props) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const renderOption = React.useCallback(
    ({ item }: { item: Option }) => (
      <Pressable
        style={[styles.option, auraCardStyle(colors, "inset")]}
        onPress={() => onSelect(item.id)}
      >
        <Text style={[auraTypography.body, styles.optionText, { color: colors.text }]}>{item.label}</Text>
      </Pressable>
    ),
    [colors, onSelect],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, auraSheetBackdropStyle(colors)]}>
        <View
          style={[
            styles.sheet,
            auraCardStyle(colors, "sheet"),
            {
              borderTopLeftRadius: layout.largeRadius,
              borderTopRightRadius: layout.largeRadius,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              padding: layout.cardPadding,
            },
          ]}
        >
          <Text style={[auraTypography.cardTitle, styles.title, { color: colors.text }]}>{title}</Text>
          {options.length === 0 ? <Text style={[styles.empty, { color: colors.textSecondary }]}>No matching items yet.</Text> : null}
          <FlatList
            data={options}
            keyExtractor={(item) => item.id}
            renderItem={renderOption}
            ItemSeparatorComponent={OptionSeparator}
            style={styles.optionsList}
            removeClippedSubviews
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={6}
          />
          {onClear ? (
            <Pressable style={[styles.clear, auraButtonStyle(colors, "danger", false, "compact")]} onPress={onClear}>
              <Text style={auraButtonTextStyle(colors, "danger")}>Clear slot</Text>
            </Pressable>
          ) : null}
          <Pressable style={[styles.close, auraButtonStyle(colors, "primary", false, "compact")]} onPress={onClose}>
            <Text style={auraButtonTextStyle(colors, "primary")}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function OptionSeparator() {
  return <View style={{ height: 8 }} />;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    gap: 8,
    maxHeight: "82%",
  },
  optionsList: { flexGrow: 0 },
  title: { marginBottom: 8 },
  option: {
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  optionText: { fontWeight: "600" },
  empty: { marginBottom: 8 },
  clear: {
    marginTop: 4,
  },
  close: {
    marginTop: 10,
  },
});
