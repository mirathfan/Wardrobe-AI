import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { useAppTheme } from "../hooks/useAppTheme";

type Option<T extends string> = {
  key: T;
  label: string;
};

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

export const WardrobeFilterSheet = React.memo(function WardrobeFilterSheet<
  TStatus extends string,
  TCategory extends string,
  TSort extends string,
>({
  visible,
  onClose,
  statusFilter,
  categoryFilter,
  sortMode,
  statusOptions,
  categoryOptions,
  sortOptions,
  onChangeStatus,
  onChangeCategory,
  onChangeSort,
  onClear,
}: {
  visible: boolean;
  onClose: () => void;
  statusFilter: TStatus;
  categoryFilter: TCategory;
  sortMode: TSort;
  statusOptions: Option<TStatus>[];
  categoryOptions: Option<TCategory>[];
  sortOptions: Option<TSort>[];
  onChangeStatus: (value: TStatus) => void;
  onChangeCategory: (value: TCategory) => void;
  onChangeSort: (value: TSort) => void;
  onClear: () => void;
}) {
  const { colors } = useAppTheme();
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
          backgroundColor: "rgba(15,23,42,0.25)",
          justifyContent: "flex-end",
        }}
      >
        <Animated.View
          style={{
            transform: [{ translateY }],
            backgroundColor: colors.card,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 20,
            gap: 12,
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
            <Text style={{ fontSize: 18, fontWeight: "900", color: colors.text }}>Filters & Sort</Text>
            <Pressable onPress={onClear}>
              <Text style={{ fontWeight: "800", color: colors.text }}>Clear filters</Text>
            </Pressable>
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

          <Pressable
            onPress={closeWithAnimation}
            style={{
              marginTop: 4,
              backgroundColor: colors.accent,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 11,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Done</Text>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
});
