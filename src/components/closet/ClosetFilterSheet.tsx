import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Modal, Pressable, ScrollView, Text, View } from "react-native";

import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

function FilterPill({
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
      style={{
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.border,
        backgroundColor: active ? colors.accent : colors.surface,
      }}
    >
      <Text style={{ color: active ? "#fff" : colors.text, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

export function ClosetFilterSheet({
  visible,
  onClose,
  sortMode,
  statusFilter,
  categoryFilter,
  brandFilter,
  colorFilter,
  sortOptions,
  statusOptions,
  categoryOptions,
  brandOptions,
  colorOptions,
  onChangeSort,
  onChangeStatus,
  onChangeCategory,
  onChangeBrand,
  onChangeColor,
  onClear,
}: {
  visible: boolean;
  onClose: () => void;
  sortMode: string;
  statusFilter: string;
  categoryFilter: string;
  brandFilter: string;
  colorFilter: string;
  sortOptions: { key: string; label: string }[];
  statusOptions: { key: string; label: string }[];
  categoryOptions: { key: string; label: string }[];
  brandOptions: string[];
  colorOptions: string[];
  onChangeSort: (value: any) => void;
  onChangeStatus: (value: any) => void;
  onChangeCategory: (value: any) => void;
  onChangeBrand: (value: string) => void;
  onChangeColor: (value: string) => void;
  onClear: () => void;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const translateY = useRef(new Animated.Value(360)).current;

  useEffect(() => {
    if (!visible) return;
    Animated.timing(translateY, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [translateY, visible]);

  const closeWithAnimation = useMemo(
    () => () => {
      Animated.timing(translateY, {
        toValue: 360,
        duration: 180,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onClose();
      });
    },
    [onClose, translateY]
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={closeWithAnimation}>
      <Pressable
        onPress={closeWithAnimation}
        style={{
          flex: 1,
          backgroundColor: "rgba(15,23,42,0.34)",
          justifyContent: "flex-end",
        }}
      >
        <Animated.View
          style={{
            transform: [{ translateY }],
            backgroundColor: colors.card,
            borderTopLeftRadius: layout.largeRadius,
            borderTopRightRadius: layout.largeRadius,
            paddingHorizontal: layout.horizontalPadding,
            paddingTop: 14,
            paddingBottom: 20,
            gap: 14,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 44,
              height: 5,
              borderRadius: 999,
              backgroundColor: colors.border,
            }}
          />

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 20, fontWeight: "900", color: colors.text }}>Sort & Filter</Text>
            <Pressable onPress={onClear}>
              <Text style={{ fontWeight: "800", color: colors.text }}>Clear</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
            <View style={{ gap: 8 }}>
              <Text style={{ fontWeight: "800", color: colors.text }}>Sort</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {sortOptions.map((option) => (
                  <FilterPill
                    key={option.key}
                    label={option.label}
                    active={sortMode === option.key}
                    onPress={() => onChangeSort(option.key)}
                  />
                ))}
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ fontWeight: "800", color: colors.text }}>Status</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {statusOptions.map((option) => (
                  <FilterPill
                    key={option.key}
                    label={option.label}
                    active={statusFilter === option.key}
                    onPress={() => onChangeStatus(option.key)}
                  />
                ))}
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ fontWeight: "800", color: colors.text }}>Category</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {categoryOptions.map((option) => (
                  <FilterPill
                    key={option.key}
                    label={option.label}
                    active={categoryFilter === option.key}
                    onPress={() => onChangeCategory(option.key)}
                  />
                ))}
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ fontWeight: "800", color: colors.text }}>Brand</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {brandOptions.slice(0, 20).map((option) => (
                  <FilterPill
                    key={option}
                    label={option === "ALL" ? "All brands" : option}
                    active={brandFilter === option}
                    onPress={() => onChangeBrand(option)}
                  />
                ))}
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ fontWeight: "800", color: colors.text }}>Color</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {colorOptions.slice(0, 20).map((option) => (
                  <FilterPill
                    key={option}
                    label={option === "ALL" ? "All colors" : option}
                    active={colorFilter === option}
                    onPress={() => onChangeColor(option)}
                  />
                ))}
              </View>
            </View>
          </ScrollView>

          <Pressable
            onPress={closeWithAnimation}
            style={{
              marginTop: 4,
              backgroundColor: colors.accent,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 12,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Done</Text>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
