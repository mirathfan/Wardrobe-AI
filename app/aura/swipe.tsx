import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Alert,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Fonts } from "@/constants/theme";
import { AuraLookCard } from "@/src/components/aura/AuraLookCard";
import AuraRing, { RING_SIZE_MD } from "@/src/components/brand/AuraRing";
import { auraShadow, auraTheme } from "@/src/components/ai/aiTheme";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useAuth } from "@/src/hooks/useAuth";
import { logAuraLookStyleEvent } from "@/src/lib/auraMemory";
import { saveAuraFavoriteOutfit } from "@/src/lib/auraLooks";
import { saveAuraOutfitFeedback } from "@/src/lib/auraOutfitFeedback";
import { Toast } from "@/src/lib/toast";
import {
  feedbackTypeForSwipe,
  generateAuraSwipeBatch,
  type AuraSwipeBatchLook,
  type AuraSwipeDirectionLabel,
} from "@/src/lib/auraSwipe";
import { isVisibleWardrobeItem, listenToItems, toCanonicalCategory } from "@/src/lib/items";
import type { ClothingItem } from "@/src/types/ClothingItem";

const SWIPE_X_THRESHOLD = 110;
const SWIPE_Y_THRESHOLD = -110;
const DOMINANT_AXIS_RATIO = 1.15;
const NON_DOMINANT_DAMPING = 0.14;

function createEmptyItemsMap(items: ClothingItem[]) {
  return new Map(items.map((item) => [item.id, item]));
}

function wardrobeCounts(items: ClothingItem[]) {
  return items.reduce(
    (acc, item) => {
      if (!isVisibleWardrobeItem(item)) return acc;
      const category = toCanonicalCategory(item.category);
      if (category === "top") acc.tops += 1;
      if (category === "bottom") acc.bottoms += 1;
      if (category === "shoes") acc.shoes += 1;
      return acc;
    },
    { tops: 0, bottoms: 0, shoes: 0 },
  );
}

function getConstrainedPan(dx: number, dy: number) {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (dy < 0 && absY > absX * DOMINANT_AXIS_RATIO) {
    return { x: dx * NON_DOMINANT_DAMPING, y: dy };
  }

  if (absX > absY * DOMINANT_AXIS_RATIO) {
    return { x: dx, y: dy * NON_DOMINANT_DAMPING };
  }

  if (dy < 0 && absY >= absX) {
    return { x: dx * NON_DOMINANT_DAMPING, y: dy * 0.92 };
  }

  return { x: dx, y: dy * 0.22 };
}

export default function AuraSwipeScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const uid = user?.uid ?? null;

  const [items, setItems] = React.useState<ClothingItem[]>([]);
  const [batch, setBatch] = React.useState<AuraSwipeBatchLook[]>([]);
  const [batchId, setBatchId] = React.useState("");
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [detailsLook, setDetailsLook] = React.useState<AuraSwipeBatchLook | null>(null);
  const [processingSwipe, setProcessingSwipe] = React.useState(false);

  const itemsById = React.useMemo(() => createEmptyItemsMap(items), [items]);
  const counts = React.useMemo(() => wardrobeCounts(items), [items]);
  const canGenerate = counts.tops > 0 && counts.bottoms > 0 && counts.shoes > 0;
  const pan = React.useRef(new Animated.ValueXY()).current;
  const activeLookRef = React.useRef<AuraSwipeBatchLook | null>(null);
  const touchStartRef = React.useRef({ moved: false });

  const visibleLooks = batch.slice(currentIndex, currentIndex + 3);
  const activeLook = visibleLooks[0] ?? null;
  const remaining = Math.max(0, batch.length - currentIndex);

  React.useEffect(() => {
    activeLookRef.current = activeLook;
  }, [activeLook]);

  React.useEffect(() => {
    if (!uid) return undefined;
    return listenToItems(uid, (nextItems) => setItems(nextItems));
  }, [uid]);

  const loadBatch = React.useCallback(async () => {
    if (!uid || !canGenerate) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await generateAuraSwipeBatch({ items, numOutfits: 8 });
      console.log("[AURA_SWIPE] normalized response", result);
      setBatch(result.lookOptions);
      setBatchId(result.batchId);
      setCurrentIndex(0);
      pan.setValue({ x: 0, y: 0 });
    } catch (loadError) {
      console.log("[AURA_SWIPE] loadBatch failed", loadError);
      setError(loadError instanceof Error ? loadError.message : "Unable to load swipe looks.");
    } finally {
      setLoading(false);
    }
  }, [canGenerate, items, pan, uid]);

  React.useEffect(() => {
    if (!uid) return;
    if (!canGenerate) {
      setLoading(false);
      return;
    }
    if (items.length === 0) return;
    if (batch.length > 0 || loading) return;
    void loadBatch();
  }, [batch.length, canGenerate, items.length, loadBatch, loading, uid]);

  const persistSwipe = React.useCallback(
    async (lookEntry: AuraSwipeBatchLook, direction: AuraSwipeDirectionLabel) => {
      if (!uid) {
        console.warn("No user auth, skipping remote save");
        return;
      }
      const feedbackType = feedbackTypeForSwipe(direction);
      try {
        await saveAuraOutfitFeedback(uid, {
          feedbackType,
          look: lookEntry.look,
          source: "aura_swipe",
          sessionId: batchId,
          batchPosition: lookEntry.position,
          directionLabel: lookEntry.directionLabel ?? direction,
        });

        if (direction === "right") {
          await logAuraLookStyleEvent(uid, "outfit_liked", lookEntry.look, { source: "aura" });
        }
        if (direction === "left") {
          await logAuraLookStyleEvent(uid, "outfit_disliked", lookEntry.look, { source: "aura" });
        }
        if (direction === "up") {
          await saveAuraFavoriteOutfit(uid, lookEntry.look, {
            source: "aura_swipe",
            sessionId: batchId,
            title: lookEntry.look.lookTitle,
          });
          Toast.saved();
        }
      } catch (e) {
        console.error("SAVE LOOK ERROR:", e);
        throw e;
      }
    },
    [batchId, uid],
  );

  const advanceDeck = React.useCallback((direction: AuraSwipeDirectionLabel) => {
    if (processingSwipe || !activeLookRef.current) return;
    const lookEntry = activeLookRef.current;
    setProcessingSwipe(true);
    void Haptics.impactAsync(
      direction === "up" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    );

    const target =
      direction === "left"
        ? { x: -width * 1.1, y: 30 }
        : direction === "right"
          ? { x: width * 1.1, y: 30 }
          : { x: 0, y: -height * 0.7 };

    Animated.timing(pan, {
      toValue: target,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      pan.setValue({ x: 0, y: 0 });
      setCurrentIndex((previous) => previous + 1);
      setProcessingSwipe(false);
      void persistSwipe(lookEntry, direction).catch((persistError) => {
        Alert.alert(
          "Swipe saved locally",
          persistError instanceof Error
            ? persistError.message
            : "We could not finish saving that feedback.",
        );
      });
    });
  }, [height, pan, persistSwipe, processingSwipe, width]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 6 || Math.abs(gestureState.dy) > 6,
        onPanResponderGrant: () => {
          touchStartRef.current = { moved: false };
        },
        onPanResponderMove: (_, gestureState) => {
          touchStartRef.current.moved = true;
          pan.setValue(getConstrainedPan(gestureState.dx, gestureState.dy));
        },
        onPanResponderRelease: (_, gestureState) => {
          const absX = Math.abs(gestureState.dx);
          const absY = Math.abs(gestureState.dy);

          if (gestureState.dy <= SWIPE_Y_THRESHOLD && absY > absX * 0.8) {
            advanceDeck("up");
            return;
          }

          if (gestureState.dx >= SWIPE_X_THRESHOLD) {
            advanceDeck("right");
            return;
          }

          if (gestureState.dx <= -SWIPE_X_THRESHOLD) {
            advanceDeck("left");
            return;
          }

          if (!touchStartRef.current.moved && activeLookRef.current) {
            setDetailsLook(activeLookRef.current);
          }

          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
            friction: 10,
            tension: 120,
          }).start();
        },
      }),
    [advanceDeck, pan],
  );

  const likeOpacity = pan.x.interpolate({
    inputRange: [0, 60, 140],
    outputRange: [0, 0.4, 1],
    extrapolate: "clamp",
  });
  const nopeOpacity = pan.x.interpolate({
    inputRange: [-140, -60, 0],
    outputRange: [1, 0.4, 0],
    extrapolate: "clamp",
  });
  const favoriteOpacity = pan.y.interpolate({
    inputRange: [-150, -80, 0],
    outputRange: [1, 0.45, 0],
    extrapolate: "clamp",
  });
  const revealProgress = Animated.add(
    pan.x.interpolate({
      inputRange: [-160, 0, 160],
      outputRange: [1, 0, 1],
      extrapolate: "clamp",
    }),
    pan.y.interpolate({
      inputRange: [-180, 0],
      outputRange: [1, 0],
      extrapolate: "clamp",
    }),
  ).interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const topCardStyle = {
    transform: [{ translateX: pan.x }, { translateY: pan.y }],
  };

  return (
    <LinearGradient
      colors={[auraTheme.backgroundTop, auraTheme.backgroundMid, auraTheme.backgroundBottom]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1, paddingTop: insets.top + 10 }}
    >
      <View style={[styles.headerRow, { paddingHorizontal: 18 }]}>
        <HeaderButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>AURA SWIPE</Text>
          <Text style={styles.headerTitle}>Train your taste</Text>
        </View>
        <HeaderButton icon="refresh" label="Refresh" onPress={() => void loadBatch()} />
      </View>

      <View style={{ paddingHorizontal: 18, paddingTop: 12 }}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryLabel}>Remaining</Text>
            <Text style={styles.summaryValue}>{remaining}</Text>
          </View>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryLabel}>Favorites save to</Text>
            <Text style={styles.summaryValue}>savedLooks</Text>
          </View>
        </View>
      </View>

      <View style={styles.deckArea}>
        {loading ? (
          <StateCard
            title="Building your next batch"
            body="AURA is pulling distinct looks from your wardrobe so you can train the model quickly."
          />
        ) : !canGenerate ? (
          <StateCard
            title="Add a few more essentials first"
            body="You need at least one visible top, bottom, and pair of shoes in your wardrobe before the swipe deck can generate."
          />
        ) : error ? (
          <StateCard title="Unable to load swipe looks" body={error} actionLabel="Try again" onAction={() => void loadBatch()} />
        ) : !activeLook ? (
          <CaughtUpStateCard onRefresh={() => void loadBatch()} />
        ) : (
          <View style={{ width: "100%", alignItems: "center" }}>
            <View style={{ width: "100%", maxWidth: 408, height: Math.min(height * 0.56, 640) }}>
              {visibleLooks
                .slice()
                .reverse()
                .map((lookEntry, reverseIndex) => {
                  const actualIndex = visibleLooks.length - 1 - reverseIndex;
                  const isTop = actualIndex === 0;
                  const depthOffset = actualIndex * 8;
                  const scale = 1 - actualIndex * 0.018;
                  const card = (
                    <View
                      style={[
                        styles.deckCard,
                        {
                          top: depthOffset,
                          transform: [{ scale }],
                          opacity: isTop ? 1 : actualIndex === 1 ? 0.98 : 0.92,
                        },
                      ]}
                    >
                      {isTop ? (
                        <>
                          <Animated.View style={[styles.overlayBadge, styles.overlayLeft, { opacity: nopeOpacity }]}>
                            <Text style={styles.overlayText}>PASS</Text>
                          </Animated.View>
                          <Animated.View style={[styles.overlayBadge, styles.overlayRight, { opacity: likeOpacity }]}>
                            <Text style={styles.overlayText}>LIKE</Text>
                          </Animated.View>
                          <Animated.View style={[styles.overlayBadge, styles.overlayTop, { opacity: favoriteOpacity }]}>
                            <Text style={styles.overlayText}>SAVE</Text>
                          </Animated.View>
                        </>
                      ) : null}

                      {isTop ? (
                        <AuraLookCard
                          look={lookEntry.look}
                          itemsById={itemsById}
                          viewportWidth={Math.min(width - 54, 382)}
                          hideActions
                          compact
                          swipeVariant
                        />
                      ) : (
                        <Animated.View
                          style={[
                            styles.deckShellWrap,
                            actualIndex === 1
                              ? {
                                  opacity: revealProgress.interpolate({
                                    inputRange: [0, 0.55, 1],
                                    outputRange: [0.1, 0.2, 0.58],
                                    extrapolate: "clamp",
                                  }),
                                }
                              : { opacity: 0.1 },
                          ]}
                        >
                          <DeckCardShell depth={actualIndex} />
                        </Animated.View>
                      )}
                    </View>
                  );

                  if (!isTop) return <View key={lookEntry.id} style={StyleSheet.absoluteFill}>{card}</View>;

                  return (
                    <Animated.View
                      key={lookEntry.id}
                      style={[StyleSheet.absoluteFill, topCardStyle]}
                      {...panResponder.panHandlers}
                    >
                      <Pressable style={StyleSheet.absoluteFill} onPress={() => setDetailsLook(lookEntry)}>
                        {card}
                      </Pressable>
                    </Animated.View>
                  );
                })}
            </View>
          </View>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 14, 24) }]}>
        <Text style={styles.footerHint}>Left to pass, right to like, up to save. Tap to inspect.</Text>
        <View style={styles.footerActions}>
          <ActionButton label="Nope" icon="close" onPress={() => advanceDeck("left")} disabled={!activeLook || processingSwipe} />
          <ActionButton label="Like" icon="heart" onPress={() => advanceDeck("right")} disabled={!activeLook || processingSwipe} primary />
          <ActionButton label="Favorite" icon="arrow-up" onPress={() => advanceDeck("up")} disabled={!activeLook || processingSwipe} />
        </View>
      </View>

      <Modal
        visible={!!detailsLook}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailsLook(null)}
      >
        <View style={styles.modalScrim}>
          <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalEyebrow}>LOOK DETAILS</Text>
                <Text style={styles.modalTitle}>{detailsLook?.look.lookTitle ?? "Outfit details"}</Text>
              </View>
              <HeaderButton icon="close" label="Close" onPress={() => setDetailsLook(null)} />
            </View>
            {detailsLook ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
                <AuraLookCard
                  look={detailsLook.look}
                  itemsById={itemsById}
                  viewportWidth={Math.min(width - 58, 390)}
                  hideActions
                  compact
                />
                <View style={styles.detailsSection}>
                  <Text style={styles.detailsLabel}>PIECES</Text>
                  {detailsLook.look.pieces.map((piece) => (
                    <View key={`${piece.role}-${piece.itemId ?? piece.itemName}`} style={styles.pieceRow}>
                      <Text style={styles.pieceRole}>{piece.role.toUpperCase()}</Text>
                      <Text style={styles.pieceName}>{piece.itemName}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

function CaughtUpStateCard({ onRefresh }: { onRefresh: () => void }) {
  const { colors } = useAppTheme();
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(1);

  React.useEffect(() => {
    if (reduceMotion) {
      scale.value = 1;
      return;
    }
    scale.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 1000 }),
        withTiming(1, { duration: 1000 }),
      ),
      -1,
      true,
    );
  }, [reduceMotion, scale]);

  const markStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.stateCard}>
      <Reanimated.View style={[styles.caughtUpMark, markStyle]}>
        <AuraRing size={RING_SIZE_MD} animated={!reduceMotion} />
      </Reanimated.View>
      <Text style={styles.stateTitle}>{"You're all caught up"}</Text>
      <Text style={styles.stateBody}>Refresh to get your next batch.</Text>
      <Pressable onPress={onRefresh} style={styles.caughtUpButton}>
        <LinearGradient
          colors={[colors.iridescentStart, colors.iridescentEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.caughtUpButtonGradient}
        >
          <Ionicons name="refresh" size={15} color={colors.background} />
          <Text style={[styles.caughtUpButtonText, { color: colors.background }]}>Refresh</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

function HeaderButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.headerButton}>
      <Ionicons name={icon} size={16} color="#E7ECF4" />
      <Text style={styles.headerButtonText}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  disabled,
  primary,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        primary ? styles.actionPrimary : styles.actionSecondary,
        disabled ? { opacity: 0.45 } : null,
        pressed && !disabled ? { transform: [{ scale: 0.98 }] } : null,
      ]}
    >
      <Ionicons name={icon} size={15} color={primary ? "#07111A" : "#E8EDF5"} />
      <Text style={[styles.actionButtonText, primary ? { color: "#07111A" } : null]}>{label}</Text>
    </Pressable>
  );
}

function StateCard({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.stateCard}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateBody}>{body}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={styles.stateButton}>
          <Text style={styles.stateButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function DeckCardShell({ depth }: { depth: number }) {
  return (
    <View style={styles.shellCard}>
      <View style={styles.shellHeader}>
        <View style={styles.shellChip} />
        <View style={[styles.shellLine, styles.shellTitleLine]} />
        <View style={[styles.shellLine, styles.shellBodyLine]} />
      </View>
      <View style={[styles.shellBoard, depth > 1 ? styles.shellBoardDeep : null]} />
      <View style={styles.shellSummary}>
        <View style={[styles.shellLine, styles.shellSummaryLine]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCopy: {
    alignItems: "center",
    gap: 2,
  },
  headerEyebrow: {
    color: auraTheme.accentStrong,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    fontFamily: Fonts.sans,
  },
  headerTitle: {
    color: "#F6F8FB",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.35,
    fontFamily: Fonts.sans,
  },
  headerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: auraTheme.borderSoft,
    backgroundColor: auraTheme.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  headerButtonText: {
    color: "#E7ECF4",
    fontSize: 12,
    fontWeight: "700",
    fontFamily: Fonts.sans,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  summaryPill: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: auraTheme.borderSoft,
    backgroundColor: auraTheme.surfaceSoft,
    paddingHorizontal: 13,
    paddingVertical: 11,
    gap: 2,
  },
  summaryLabel: {
    color: auraTheme.textFaint,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    fontFamily: Fonts.sans,
  },
  summaryValue: {
    color: "#F6F8FB",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: Fonts.sans,
  },
  deckArea: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  deckCard: {
    position: "absolute",
    left: 0,
    right: 0,
    overflow: "visible",
  },
  deckShellWrap: {
    flex: 1,
  },
  overlayBadge: {
    position: "absolute",
    zIndex: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: auraTheme.borderAccent,
    backgroundColor: "rgba(9,17,25,0.92)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  overlayLeft: {
    top: 14,
    left: 14,
  },
  overlayRight: {
    top: 14,
    right: 14,
  },
  overlayTop: {
    top: 14,
    alignSelf: "center",
  },
  overlayText: {
    color: auraTheme.accentStrong,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    fontFamily: Fonts.sans,
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
    gap: 14,
  },
  footerHint: {
    textAlign: "center",
    color: auraTheme.textMuted,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: Fonts.sans,
  },
  footerActions: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
    borderWidth: 1,
  },
  actionPrimary: {
    backgroundColor: auraTheme.accent,
    borderColor: "rgba(255,255,255,0.14)",
  },
  actionSecondary: {
    backgroundColor: auraTheme.surfaceStrong,
    borderColor: auraTheme.borderSoft,
  },
  actionButtonText: {
    color: "#E8EDF5",
    fontSize: 13,
    fontWeight: "800",
    fontFamily: Fonts.sans,
  },
  stateCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: auraTheme.border,
    backgroundColor: auraTheme.surfaceStrong,
    gap: 10,
    ...auraShadow(0.18),
  },
  stateTitle: {
    color: "#F6F8FB",
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "800",
    fontFamily: Fonts.sans,
  },
  stateBody: {
    color: auraTheme.textMuted,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: Fonts.sans,
  },
  stateButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: auraTheme.accentTint,
    borderWidth: 1,
    borderColor: auraTheme.borderAccent,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  stateButtonText: {
    color: "#F6F8FB",
    fontSize: 12.5,
    fontWeight: "800",
    fontFamily: Fonts.sans,
  },
  caughtUpMark: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    marginBottom: 2,
  },
  caughtUpMarkText: {
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.5,
    fontFamily: Fonts.sans,
  },
  caughtUpButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 2,
  },
  caughtUpButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  caughtUpButtonText: {
    fontSize: 12.5,
    fontWeight: "900",
    fontFamily: Fonts.sans,
  },
  modalScrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    maxHeight: "88%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "#09111A",
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  modalEyebrow: {
    color: auraTheme.textFaint,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    fontFamily: Fonts.sans,
  },
  modalTitle: {
    color: "#F6F8FB",
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "800",
    fontFamily: Fonts.sans,
    marginTop: 2,
  },
  detailsSection: {
    marginTop: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: auraTheme.borderSoft,
    backgroundColor: auraTheme.surfaceSoft,
    padding: 14,
    gap: 10,
  },
  detailsLabel: {
    color: auraTheme.textFaint,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    fontFamily: Fonts.sans,
  },
  pieceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pieceRole: {
    width: 84,
    color: auraTheme.accentStrong,
    fontSize: 11,
    fontWeight: "800",
    fontFamily: Fonts.sans,
  },
  pieceName: {
    flex: 1,
    color: "#EDF1F7",
    fontSize: 13.5,
    lineHeight: 18,
    fontFamily: Fonts.sans,
  },
  shellCard: {
    flex: 1,
    gap: 14,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderRadius: 32,
    backgroundColor: "#0D141D",
    borderWidth: 1,
    borderColor: "rgba(177, 197, 223, 0.1)",
  },
  shellHeader: {
    gap: 10,
  },
  shellChip: {
    width: 84,
    height: 22,
    borderRadius: 999,
    backgroundColor: "rgba(140, 168, 198, 0.09)",
    borderWidth: 1,
    borderColor: "rgba(160, 185, 214, 0.08)",
  },
  shellLine: {
    borderRadius: 999,
    backgroundColor: "rgba(160, 185, 214, 0.08)",
  },
  shellTitleLine: {
    width: "58%",
    height: 18,
  },
  shellBodyLine: {
    width: "76%",
    height: 12,
  },
  shellBoard: {
    flex: 1,
    minHeight: 388,
    borderRadius: 28,
    backgroundColor: "rgba(244, 240, 235, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(236, 239, 244, 0.08)",
  },
  shellBoardDeep: {
    minHeight: 372,
    opacity: 0.8,
  },
  shellSummary: {
    gap: 8,
    paddingTop: 4,
  },
  shellSummaryLine: {
    width: "66%",
    height: 11,
  },
});
