import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";

import { useAppTheme } from "@/src/hooks/useAppTheme";

function selectedPhotoUri(entry: any) {
  return entry.normalizedLocalUri ?? entry.cleanedLocalUri ?? entry.localUri ?? null;
}

export const AddItemPhotoCarousel = React.memo(function AddItemPhotoCarousel({
  controller,
}: {
  controller: any;
}) {
  const { state, actions } = controller;
  const { colors } = useAppTheme();
  const photos = state.selectedPhotos ?? [];

  if (!photos.length) return null;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View style={{ gap: 2, flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: "900" }}>
            Item photos
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 16 }} numberOfLines={1}>
            {photos.length} selected
          </Text>
        </View>
        <Pressable
          onPress={() => void actions.pickPhoto("library")}
          hitSlop={6}
          style={({ pressed }) => ({
            minHeight: 40,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 11,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.chipBackground,
            opacity: pressed ? 0.78 : 1,
          })}
        >
          <Ionicons name="add" size={16} color={colors.text} />
          <Text style={{ color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: "800" }}>
            Add Photo
          </Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: 12, paddingRight: 4 }}>
          {photos.map((entry: any, index: number) => {
            const previewUri = selectedPhotoUri(entry);
            const isPrimary = state.primaryPhotoId === entry.id;
            return (
              <View key={entry.id} style={{ width: 184, gap: 8 }}>
                <Pressable
                  onPress={() => actions.setPrimaryPhoto(entry.id)}
                  style={({ pressed }) => ({
                    height: 154,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: isPrimary ? colors.ctaCream : "rgba(251,228,216,0.14)",
                    backgroundColor: colors.outfitBoardBackground,
                    overflow: "hidden",
                    opacity: pressed ? 0.86 : 1,
                  })}
                >
                  {previewUri ? (
                    <Image
                      source={{ uri: previewUri }}
                      style={{ width: "100%", height: "100%" }}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={{ flex: 1, backgroundColor: "rgba(25,0,25,0.06)" }} />
                  )}
                  {isPrimary ? (
                    <View
                      style={{
                        position: "absolute",
                        top: 8,
                        left: 8,
                        minHeight: 24,
                        paddingHorizontal: 8,
                        borderRadius: 999,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "rgba(25,0,25,0.72)",
                        borderWidth: 1,
                        borderColor: "rgba(251,228,216,0.18)",
                      }}
                    >
                      <Text style={{ color: colors.ctaCream, fontSize: 10.5, fontWeight: "900" }}>
                        Primary
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <PhotoIconButton
                    icon="chevron-back"
                    disabled={index === 0}
                    onPress={() => actions.movePhotoLeft(entry.id)}
                  />
                  <PhotoIconButton
                    icon={isPrimary ? "checkmark" : "star-outline"}
                    active={isPrimary}
                    onPress={() => actions.setPrimaryPhoto(entry.id)}
                  />
                  <PhotoIconButton
                    icon="chevron-forward"
                    disabled={index === photos.length - 1}
                    onPress={() => actions.movePhotoRight(entry.id)}
                  />
                  <PhotoIconButton
                    icon="trash-outline"
                    danger
                    onPress={() => actions.removeSelectedPhoto(entry.id)}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
});

const PhotoIconButton = React.memo(function PhotoIconButton({
  icon,
  active,
  danger,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const iconColor = danger ? colors.danger : active ? colors.ctaCream : colors.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: active ? colors.purpleBorder : colors.border,
        backgroundColor: active ? colors.purpleSurface : "rgba(43,18,76,0.28)",
        opacity: disabled ? 0.34 : pressed ? 0.72 : 1,
      })}
    >
      <Ionicons name={icon} size={17} color={iconColor} />
    </Pressable>
  );
});
