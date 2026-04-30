import AppImage from "@/src/components/common/AppImage";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useAppTheme } from "@/src/hooks/useAppTheme";
import { getItemImagePresentation, getItemImageUrl } from "@/src/lib/itemImage";
import { getItemLifecycleStatus, type ClosetItem } from "@/src/lib/items";
import { sanitizeDisplayText } from "@/src/lib/text";

function titleFor(item: ClosetItem) {
  return (
    sanitizeDisplayText(item.name) ||
    sanitizeDisplayText(item.subCategory) ||
    sanitizeDisplayText(item.category) ||
    "New wardrobe item"
  );
}

function statusText(item: ClosetItem) {
  const lifecycle = getItemLifecycleStatus(item);
  if (lifecycle === "uploading") return "Uploading...";
  if (lifecycle === "processing") return "Processing...";
  if (lifecycle === "needs_review") return "Needs review";
  if (lifecycle === "failed") return "Failed";
  return "Ready";
}

export function ClosetProcessingSection({
  items,
  onPressItem,
  onRetry,
  onRemove,
}: {
  items: ClosetItem[];
  onPressItem: (item: ClosetItem) => void;
  onRetry: (item: ClosetItem) => void;
  onRemove: (item: ClosetItem) => void;
}) {
  const { colors } = useAppTheme();
  if (!items.length) return null;

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ gap: 3 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: "900" }}>
            Adding now
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12.5, fontWeight: "600" }}>
            New pieces appear here while AURA finishes them.
          </Text>
        </View>
        <View
          style={{
            borderRadius: 999,
            paddingHorizontal: 9,
            paddingVertical: 4,
            backgroundColor: "rgba(143,216,255,0.12)",
          }}
        >
          <Text style={{ color: colors.aiAccent, fontSize: 11.5, fontWeight: "900" }}>
            {items.length}
          </Text>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        {items.map((item) => (
          <ProcessingItemRow
            key={item.id}
            item={item}
            onPress={() => onPressItem(item)}
            onRetry={() => onRetry(item)}
            onRemove={() => onRemove(item)}
          />
        ))}
      </View>
    </View>
  );
}

function ProcessingItemRow({
  item,
  onPress,
  onRetry,
  onRemove,
}: {
  item: ClosetItem;
  onPress: () => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const { colors } = useAppTheme();
  const lifecycle = getItemLifecycleStatus(item);
  const imageUrl = getItemImageUrl(item, { variant: "thumb" });
  const presentation = getItemImagePresentation(item, { surface: "closet_card" });
  const canAct = lifecycle === "needs_review" || lifecycle === "failed";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
        borderRadius: 22,
        padding: 10,
        backgroundColor: "rgba(255,255,255,0.035)",
        borderWidth: 1,
        borderColor:
          lifecycle === "failed"
            ? "rgba(255,99,99,0.22)"
            : lifecycle === "needs_review"
              ? "rgba(255,214,143,0.2)"
              : "rgba(255,255,255,0.07)",
        opacity: pressed ? 0.86 : 1,
      })}
    >
      <View
        style={{
          width: 62,
          height: 74,
          borderRadius: 16,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(255,255,255,0.04)",
        }}
      >
        {imageUrl ? (
          <AppImage
            source={{
              uri: imageUrl,
            }}
            resizeMode="contain"
            style={[{ width: "92%", height: "92%" }, presentation.imageStyle]}
          />
        ) : (
          <Ionicons name="shirt-outline" size={22} color={colors.textSecondary} />
        )}
      </View>

      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
        <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: "900" }} numberOfLines={1}>
          {titleFor(item)}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          {lifecycle === "processing" || lifecycle === "uploading" ? (
            <ActivityIndicator size="small" color={colors.aiAccent} />
          ) : (
            <Ionicons
              name={lifecycle === "failed" ? "warning-outline" : "create-outline"}
              size={14}
              color={lifecycle === "failed" ? "#ff8f8f" : colors.aiAccent}
            />
          )}
          <Text style={{ color: colors.textSecondary, fontSize: 12.5, fontWeight: "700" }}>
            {statusText(item)}
          </Text>
        </View>
        {canAct ? (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            {lifecycle === "failed" ? (
              <MiniAction label="Retry" onPress={onRetry} />
            ) : null}
            <MiniAction label={lifecycle === "needs_review" ? "Review" : "Edit"} onPress={onPress} />
            <MiniAction label="Remove" onPress={onRemove} muted />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function MiniAction({
  label,
  onPress,
  muted,
}: {
  label: string;
  onPress: () => void;
  muted?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: muted ? "rgba(255,255,255,0.045)" : "rgba(143,216,255,0.14)",
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Text
        style={{
          color: muted ? colors.textSecondary : colors.aiAccent,
          fontSize: 11.5,
          fontWeight: "900",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
