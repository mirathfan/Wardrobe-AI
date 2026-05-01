import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";

import { SafeScreen } from "@/src/components/SafeScreen";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { LookDetailModal } from "@/src/components/profile/LookDetailModal";
import { MyLookSkeleton, MyLookThumbnail } from "@/src/components/profile/MyLookThumbnail";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { listenToItems, toCanonicalCategory, type ClosetItem } from "@/src/lib/items";
import { subscribeFavouriteLooks, subscribeProfileFeedbackLooks, type ProfileLookRecord } from "@/src/lib/profileLooks";
import {
  ProfileHubRow,
  useAccountProfileState,
  formatBodyFitSummary,
  formatClosetSummary,
  formatDefaultSizesSummary,
  formatNotificationsSummary,
  formatStyleSummary,
  formatUnitsSummary,
  useProfilePreferencesState,
} from "@/src/profile/screens";
import type { UserProfilePreferences } from "@/src/types/UserProfilePreferences";

type StatCardProps = {
  label: string;
  value: string;
  onPress: () => void;
};

type QuickActionProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
};

const SETTINGS_GROUPS = [
  {
    label: "ACCOUNT",
    rows: [
      { title: "Account", route: "/profile/account", summary: "account" },
      { title: "Notifications", route: "/profile/notifications", summary: "notifications" },
    ],
  },
  {
    label: "STYLE PROFILE",
    rows: [
      { title: "Body & Fit", route: "/profile/body-fit", summary: "bodyFit" },
      { title: "Default Sizes", route: "/profile/default-sizes", summary: "defaultSizes" },
      { title: "Style Preferences", route: "/profile/style-preferences", summary: "style" },
      { title: "Closet Preferences", route: "/profile/closet-preferences", summary: "closet" },
    ],
  },
  {
    label: "SYSTEM",
    rows: [
      { title: "Units & Region", route: "/profile/units-region", summary: "units" },
    ],
  },
] as const;

function humanize(value?: string | null) {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function compactHumanize(value?: string | null) {
  const text = humanize(value);
  return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : "";
}

function getDisplayName(name?: string | null, email?: string | null, fallback?: string | null) {
  return name || fallback || email?.split("@")[0] || "AURA member";
}

function getInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "A";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1];
  return `${first}${second ?? ""}`.toUpperCase();
}

function summarizeStyleIdentity(profile: UserProfilePreferences) {
  const style =
    profile.stylePreferences.preferredStyles?.[0] ||
    profile.styleAesthetics?.[0] ||
    profile.occasionPriority?.[0] ||
    "Personal style";
  const fit = profile.preferredFit || profile.fitPreferences.tops || "regular";
  return `${compactHumanize(style)} · ${compactHumanize(fit)} fit`;
}

function summarizeAuraRead(profile: UserProfilePreferences) {
  const descriptors = [
    ...(profile.stylePreferences.preferredStyles ?? []),
    profile.preferredFit,
    ...(profile.stylePreferences.favoriteColors ?? []),
  ]
    .filter(Boolean)
    .slice(0, 3)
    .map((entry) => compactHumanize(entry).toLowerCase());

  if (descriptors.length >= 2) {
    return `AURA reads your style as ${descriptors.join(", ")}.`;
  }
  return "AURA reads your style as clean, relaxed, and street-smart.";
}

function valueCounts(values: string[]) {
  return values.reduce((counts, value) => {
    const key = value.trim();
    if (!key) return counts;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
}

function mostCommon(values: string[]) {
  const counts = valueCounts(values);
  let winner = "";
  let winnerCount = 0;
  counts.forEach((count, value) => {
    if (count > winnerCount) {
      winner = value;
      winnerCount = count;
    }
  });
  return winner;
}

function getItemColor(item: ClosetItem) {
  return (
    item.primaryColor ||
    item.displayColor ||
    item.colorLabel ||
    item.aiColorLabel ||
    item.colors?.[0] ||
    item.displayColors?.[0] ||
    item.aiColors?.[0] ||
    ""
  );
}

function buildProfileFacts(profile: UserProfilePreferences, items: ClosetItem[]) {
  const styles = profile.stylePreferences.preferredStyles?.length
    ? profile.stylePreferences.preferredStyles
    : profile.styleAesthetics;
  const styleSummary = styles?.length
    ? styles.slice(0, 3).map(humanize).join(" · ")
    : "Add a few style preferences to sharpen AURA's read.";
  const fit = profile.preferredFit || profile.fitPreferences.tops || profile.fitPreferences.outerwear || "";
  const commonColor = mostCommon(items.map(getItemColor).filter(Boolean));
  const commonCategory = mostCommon(items.map((item) => toCanonicalCategory(item.category)).filter(Boolean));
  const favoriteColor = profile.stylePreferences.favoriteColors?.[0] || profile.favoriteColors?.[0] || "";
  const colorOrCategory = commonColor || favoriteColor || commonCategory;
  const relaxed = fit === "relaxed" || fit === "oversized" || profile.fitPreferences.outerwear === "roomy";
  const casual = styles?.some((entry) => /casual|street|minimal|sport|everyday/i.test(entry));
  const closetNote = relaxed || casual
    ? "You lean relaxed and casual. Add one lighter layer or sharper shoe to expand your outfit range."
    : "Your closet has a steady base. Add one contrast layer or signature accessory to widen the range.";

  return {
    styleSummary,
    fitSummary: fit ? `${humanize(fit)} fit` : "Fit preference not set",
    colorOrCategory: colorOrCategory ? humanize(colorOrCategory) : "Not enough closet signal yet",
    closetNote,
  };
}

function isUnworn(item: ClosetItem) {
  return Number(item.wearCountSinceWash ?? 0) === 0 && !item.lastWornDate;
}

function StatCard({ label, value, onPress }: StatCardProps) {
  const { colors } = useAppTheme();
  return (
    <AuraPressable
      onPress={onPress}
      haptic="selection"
      hapticTrigger="press"
      pressedScale={0.97}
      pressedOpacity={0.88}
      style={{
        flex: 1,
        minWidth: 72,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: "rgba(255,255,255,0.04)",
        paddingHorizontal: 10,
        paddingVertical: 12,
        gap: 4,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "900" }}>{value}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "700", lineHeight: 15 }}>{label}</Text>
    </AuraPressable>
  );
}

function QuickAction({ icon, label, onPress }: QuickActionProps) {
  const { colors } = useAppTheme();
  return (
    <AuraPressable
      onPress={onPress}
      haptic="selection"
      hapticTrigger="press"
      pressedScale={0.97}
      pressedOpacity={0.88}
      style={{
        minHeight: 46,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 8,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <Ionicons name={icon} size={18} color={colors.iridescentStart} />
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800" }}>{label}</Text>
    </AuraPressable>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Text style={{ color: colors.iridescentStart, fontSize: 12, fontWeight: "900" }}>
      {children}
    </Text>
  );
}

export default function ProfileScreen() {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const { user, loading, profile } = useProfilePreferencesState();
  const { accountProfile } = useAccountProfileState();
  const [favouriteLooks, setFavouriteLooks] = useState<ProfileLookRecord[]>([]);
  const [likedLooks, setLikedLooks] = useState<ProfileLookRecord[]>([]);
  const [looksLoading, setLooksLoading] = useState(true);
  const [likedLooksLoading, setLikedLooksLoading] = useState(true);
  const [items, setItems] = useState<ClosetItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [selectedLook, setSelectedLook] = useState<ProfileLookRecord | null>(null);

  const displayName = getDisplayName(accountProfile.name, user?.email, user?.displayName);
  const accountSummary = accountProfile.name
    ? `${accountProfile.name} • ${user?.email ?? "No email found."}`
    : user?.email ?? "No email found.";
  const profileFacts = useMemo(() => buildProfileFacts(profile, items), [items, profile]);

  const stats = useMemo(() => {
    const savedLookCount = likedLooks.length + favouriteLooks.length;
    return [
      { label: "Closet items", value: itemsLoading ? "—" : String(items.length), onPress: () => router.push("/(tabs)/closet") },
      { label: "Saved looks", value: looksLoading || likedLooksLoading ? "—" : String(savedLookCount), onPress: () => router.push("/profile/my-looks") },
      { label: "Unworn", value: itemsLoading ? "—" : String(items.filter(isUnworn).length), onPress: () => router.push("/(tabs)/closet") },
      {
        label: "Favourites",
        value: looksLoading ? "—" : String(favouriteLooks.length),
        onPress: () => router.push({ pathname: "/profile/my-looks", params: { tab: "favourites" } }),
      },
    ];
  }, [favouriteLooks.length, items, itemsLoading, likedLooks.length, likedLooksLoading, looksLoading]);

  const summaries = useMemo(
    () => ({
      account: accountSummary,
      notifications: formatNotificationsSummary(profile),
      bodyFit: formatBodyFitSummary(profile),
      defaultSizes: formatDefaultSizesSummary(profile),
      style: formatStyleSummary(profile),
      closet: formatClosetSummary(profile),
      units: formatUnitsSummary(profile),
    }),
    [accountSummary, profile],
  );

  useEffect(() => {
    if (!user?.uid) {
      setFavouriteLooks([]);
      setLooksLoading(false);
      return;
    }
    setLooksLoading(true);
    return subscribeFavouriteLooks(
      user.uid,
      (records) => {
        setFavouriteLooks(records);
        setLooksLoading(false);
      },
      () => {
        setFavouriteLooks([]);
        setLooksLoading(false);
      },
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setLikedLooks([]);
      setLikedLooksLoading(false);
      return;
    }
    setLikedLooksLoading(true);
    return subscribeProfileFeedbackLooks(
      user.uid,
      "outfit_liked",
      (records) => {
        setLikedLooks(records);
        setLikedLooksLoading(false);
      },
      () => {
        setLikedLooks([]);
        setLikedLooksLoading(false);
      },
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setItems([]);
      setItemsLoading(false);
      return;
    }
    setItems([]);
    setItemsLoading(true);
    return listenToItems(user.uid, (nextItems) => {
      setItems(nextItems);
      setItemsLoading(false);
    }, {
      onError: () => {
        setItems([]);
        setItemsLoading(false);
      },
    });
  }, [user?.uid]);

  const openMyLooks = () => router.push("/profile/my-looks");
  const openFavourites = () => router.push({ pathname: "/profile/my-looks", params: { tab: "favourites" } });
  const previewLooks = favouriteLooks.slice(0, 5);

  return (
    <SafeScreen backgroundColor={colors.background} includeBottomInset={false} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: layout.horizontalPadding,
          paddingTop: 0,
          gap: 18,
          paddingBottom: layout.bottomDockPadding + 52,
        }}
      >
        <View style={{ gap: 5 }}>
          <Text style={{ fontSize: 28 * layout.titleScale, fontWeight: "900", color: colors.text }}>Profile</Text>
          <Text style={{ color: colors.textSecondary, opacity: 0.76, lineHeight: 22 }}>
            Your style identity, closet signal, and preferences.
          </Text>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <>
            <LinearGradient
              colors={["rgba(192,132,252,0.22)", "rgba(17,20,28,0.96)", "rgba(10,10,12,0.98)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                borderRadius: 26,
                borderWidth: 1,
                borderColor: colors.glassBorder,
                padding: 18,
                overflow: "hidden",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <View
                  style={{
                    width: 68,
                    height: 68,
                    borderRadius: 34,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.20)",
                    backgroundColor: "rgba(255,255,255,0.08)",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {user?.photoURL ? (
                    <Image source={{ uri: user.photoURL }} style={{ width: 68, height: 68 }} />
                  ) : (
                    <Text style={{ color: colors.text, fontSize: 22, fontWeight: "900" }}>
                      {getInitials(displayName)}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1, gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                    <View style={{ flex: 1, gap: 5 }}>
                      <Text style={{ color: colors.text, fontSize: 23, fontWeight: "900" }} numberOfLines={1}>
                        {displayName}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={1}>
                        {user?.email ?? "No email found."}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => router.push("/profile/account")}
                      style={{
                        minHeight: 36,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.16)",
                        backgroundColor: "rgba(255,255,255,0.08)",
                        paddingHorizontal: 12,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 12, fontWeight: "900" }}>Edit</Text>
                    </Pressable>
                  </View>
                  <Text style={{ color: colors.auraLavender, fontSize: 14, fontWeight: "800" }} numberOfLines={1}>
                    {summarizeStyleIdentity(profile)}
                  </Text>
                </View>
              </View>
              <View
                style={{
                  marginTop: 16,
                  borderTopWidth: 1,
                  borderTopColor: "rgba(255,255,255,0.10)",
                  paddingTop: 14,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: "600" }}>
                  {summarizeAuraRead(profile)}
                </Text>
              </View>
            </LinearGradient>

            <View style={{ flexDirection: "row", gap: 8 }}>
              {stats.map((stat) => (
                <StatCard key={stat.label} label={stat.label} value={stat.value} onPress={stat.onPress} />
              ))}
            </View>

            <View style={{ gap: 12 }}>
              <SectionLabel>QUICK ACTIONS</SectionLabel>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingRight: 2 }}
              >
                <QuickAction icon="add" label="Add item" onPress={() => router.push("/(tabs)/add")} />
                <QuickAction icon="sparkles-outline" label="Build outfit" onPress={() => router.push("/(tabs)/studio")} />
                <QuickAction icon="chatbubble-ellipses-outline" label="Ask AURA" onPress={() => router.push("/(tabs)/ai")} />
                <QuickAction icon="calendar-outline" label="Plan week" onPress={() => router.push("/(tabs)/calendar")} />
              </ScrollView>
            </View>

            <View style={{ gap: 12 }}>
              <SectionLabel>AURA PROFILE</SectionLabel>
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 22,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: 16,
                  gap: 12,
                }}
              >
                <View style={{ gap: 4 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "800" }}>Style preferences</Text>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700", lineHeight: 21 }}>
                    {profileFacts.styleSummary}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "800" }}>Fit</Text>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{profileFacts.fitSummary}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "800" }}>Top signal</Text>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{profileFacts.colorOrCategory}</Text>
                  </View>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
                  {profileFacts.closetNote}
                </Text>
                <Pressable
                  onPress={() => router.push("/profile/style-preferences")}
                  style={{
                    alignSelf: "flex-start",
                    minHeight: 42,
                    borderRadius: 999,
                    backgroundColor: "rgba(192,132,252,0.14)",
                    borderWidth: 1,
                    borderColor: "rgba(192,132,252,0.26)",
                    paddingHorizontal: 14,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: colors.auraLavender, fontSize: 13, fontWeight: "900" }}>
                    Edit style profile
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <SectionLabel>MY LOOKS</SectionLabel>
                <Pressable onPress={openMyLooks} style={{ minHeight: 44, justifyContent: "center" }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "800" }}>See all →</Text>
                </Pressable>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingRight: 2 }}
              >
                {looksLoading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <MyLookSkeleton key={index} width={112} height={136} />
                  ))
                ) : previewLooks.length ? (
                  previewLooks.map((record) => (
                    <MyLookThumbnail
                      key={`${record.collection}-${record.id}`}
                      record={record}
                      width={112}
                      height={136}
                      showInfo={false}
                      onPress={() => setSelectedLook(record)}
                    />
                  ))
                ) : (
                  <Pressable
                    onPress={openFavourites}
                    style={{
                      minHeight: 104,
                      width: 250,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      paddingHorizontal: 16,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20, textAlign: "center" }}>
                      Save looks from AURA to build your style archive.
                    </Text>
                  </Pressable>
                )}
              </ScrollView>
            </View>

            <View style={{ gap: 18 }}>
              {SETTINGS_GROUPS.map((group) => (
                <View key={group.label} style={{ gap: 10 }}>
                  <SectionLabel>{group.label}</SectionLabel>
                  <View style={{ gap: 10 }}>
                    {group.rows.map((row) => (
                      <ProfileHubRow
                        key={row.title}
                        title={row.title}
                        summary={summaries[row.summary]}
                        onPress={() => router.push(row.route)}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </View>

            <Text
              style={{
                marginTop: 24,
                textAlign: "center",
                color: colors.text,
                fontSize: 11,
                opacity: 0.15,
                fontWeight: "800",
              }}
            >
              AURA
            </Text>
          </>
        )}
      </ScrollView>
      <LookDetailModal
        visible={Boolean(selectedLook)}
        record={selectedLook}
        onClose={() => setSelectedLook(null)}
      />
    </SafeScreen>
  );
}
