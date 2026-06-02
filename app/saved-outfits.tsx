import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import SavedOutfitCard from "@/src/components/aura/SavedOutfitCard";
import { SafeScreen } from "@/src/components/SafeScreen";
import AuraSubpageHeader from "@/src/components/ui/AuraSubpageHeader";
import { AuraSkeleton } from "@/src/components/ui/AuraSkeleton";
import {
  AuraTopSafeAreaScrim,
  auraCardStyle,
  auraTypography,
} from "@/src/components/ui/auraStylePrimitives";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import {
  subscribeSavedOutfits,
  type SavedOutfitRecord,
} from "@/src/lib/savedOutfits";

function EmptyState() {
  const { colors } = useAppTheme();
  return (
    <View style={[auraCardStyle(colors, "card"), { alignItems: "center", gap: 8, padding: 22 }]}>
      <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Saved outfits will appear here.</Text>
      <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary, textAlign: "center" }]}>
        Save AURA outfits to build your lookbook.
      </Text>
    </View>
  );
}

function SavedOutfitsSkeleton() {
  const layout = useResponsiveLayout();
  return (
    <View style={{ gap: 16 }}>
      {Array.from({ length: 3 }).map((_, index) => (
        <AuraSkeleton key={index} height={420} radius={layout.largeRadius} />
      ))}
    </View>
  );
}

export default function SavedOutfitsScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const [records, setRecords] = useState<SavedOutfitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    return subscribeSavedOutfits(
      user.uid,
      (next) => {
        setRecords(next);
        setLoading(false);
        setRefreshing(false);
      },
      () => {
        setError("I couldn't load your saved outfits.");
        setLoading(false);
        setRefreshing(false);
      },
    );
  }, [user?.uid]);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  return (
    <SafeScreen backgroundColor={colors.background} includeBottomInset={false} style={{ flex: 1 }}>
      <AuraTopSafeAreaScrim color={colors.background} />
      <AuraSubpageHeader title="Saved Outfits" eyebrow="LOOKBOOK" fallbackRoute="/(tabs)/profile" />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.ctaCream}
            colors={[colors.ctaCream]}
            progressBackgroundColor={colors.background}
          />
        }
        contentContainerStyle={{
          gap: 16,
          paddingHorizontal: layout.horizontalPadding,
          paddingTop: 8,
          paddingBottom: layout.bottomDockPadding + 48,
        }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? <SavedOutfitsSkeleton /> : null}
        {!loading && error ? (
          <View style={[auraCardStyle(colors, "card"), { gap: 8, padding: 18 }]}>
            <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Could not load your saved outfits.</Text>
            <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>{error}</Text>
          </View>
        ) : null}
        {!loading && !error && records.length === 0 ? <EmptyState /> : null}
        {!loading && !error
          ? records.map((record) => (
              <SavedOutfitCard
                key={record.id}
                record={record}
                onPress={() => {
                  router.push({ pathname: "/saved-outfits/[id]", params: { id: record.id } });
                }}
              />
            ))
          : null}
      </ScrollView>
    </SafeScreen>
  );
}
