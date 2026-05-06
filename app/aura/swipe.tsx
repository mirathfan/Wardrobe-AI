import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Alert,
  Animated,
  Image,
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
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors, Fonts } from "@/constants/theme";
import { AuraLookCard } from "@/src/components/aura/AuraLookCard";
import AuraSubpageHeader from "@/src/components/ui/AuraSubpageHeader";
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
const SWIPE_X_VELOCITY_THRESHOLD = 850;
const SWIPE_Y_VELOCITY_THRESHOLD = -850;
const DOMINANT_AXIS_RATIO = 1.15;
const NON_DOMINANT_DAMPING = 0.14;
const STACK_NEXT_SCALE = 0.94;
const STACK_NEXT_OFFSET = 14;
const CANCEL_SPRING = { damping: 18, stiffness: 180 };
const palette = Colors.dark;
const DEBUG_AURA_SWIPE_SCREEN =
  __DEV__ && process.env.EXPO_PUBLIC_AURA_DEBUG === "1";

type SwipeMetrics = {
  translationX: number;
  translationY: number;
  velocityX: number;
  velocityY: number;
  source: "gesture" | "button";
};

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

function swipeLookSignature(lookEntry: AuraSwipeBatchLook) {
  const pieceKey = (lookEntry.look.pieces ?? [])
    .map((piece) => piece.itemId || `${piece.role}:${piece.itemName}`)
    .filter(Boolean)
    .sort()
    .join("|");
  return pieceKey || lookEntry.id || lookEntry.look.lookTitle;
}

function dedupeSwipeLooks(looks: AuraSwipeBatchLook[]) {
  const seen = new Set<string>();
  return looks.filter((lookEntry) => {
    const signature = swipeLookSignature(lookEntry);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function swipeToastTitle(direction: AuraSwipeDirectionLabel) {
  if (direction === "right") return "Got it — more like this";
  if (direction === "left") return "Less of this";
  return "Saved";
}

function swipeActionLabel(direction: AuraSwipeDirectionLabel) {
  if (direction === "right") return "like";
  if (direction === "left") return "nope";
  return "save";
}

function getSwipeLookId(lookEntry?: AuraSwipeBatchLook | null) {
  if (!lookEntry) return null;
  return lookEntry.id || lookEntry.look.lookTitle || swipeLookSignature(lookEntry);
}

function preloadLookImages(looks: AuraSwipeBatchLook[]) {
  const urls = looks
    .flatMap((lookEntry) => lookEntry.look.pieces ?? [])
    .map((piece) => String(piece.imageUrl ?? "").trim())
    .filter(Boolean);

  for (const url of new Set(urls)) {
    void Image.prefetch(url);
  }
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
  const progress = React.useRef(new Animated.Value(0)).current;
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const activeScale = useSharedValue(1);
  const activeOpacity = useSharedValue(1);
  const activeLookRef = React.useRef<AuraSwipeBatchLook | null>(null);
  const pendingSwipeRef = React.useRef<{
    direction: AuraSwipeDirectionLabel;
    lookEntry: AuraSwipeBatchLook;
  } | null>(null);
  const processingSwipeRef = React.useRef(false);
  const touchStartRef = React.useRef({ moved: false });

  const current = batch[currentIndex] ?? null;
  const next = batch[currentIndex + 1] ?? null;
  const activeLook = current;
  const remaining = Math.max(0, batch.length - currentIndex);
  const looksLeftLabel = `${remaining} ${remaining === 1 ? "look" : "looks"} left`;
  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });

  React.useEffect(() => {
    activeLookRef.current = activeLook;
  }, [activeLook]);

  React.useEffect(() => {
    processingSwipeRef.current = processingSwipe;
  }, [processingSwipe]);

  const resetMotionValues = React.useCallback(() => {
    translateX.value = 0;
    translateY.value = 0;
    activeScale.value = 1;
    activeOpacity.value = 1;
  }, [activeOpacity, activeScale, translateX, translateY]);

  React.useEffect(() => {
    resetMotionValues();
  }, [currentIndex, resetMotionValues]);

  React.useEffect(() => {
    const nextProgress = batch.length
      ? Math.min(1, Math.max(0, currentIndex / batch.length))
      : 0;
    Animated.timing(progress, {
      toValue: nextProgress,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [batch.length, currentIndex, progress]);

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
      if (DEBUG_AURA_SWIPE_SCREEN) {
        console.log("[AURA_SWIPE] normalized response", result);
      }
      setBatch(dedupeSwipeLooks(result.lookOptions));
      setBatchId(result.batchId);
      setCurrentIndex(0);
      progress.setValue(0);
      resetMotionValues();
    } catch (loadError) {
      if (DEBUG_AURA_SWIPE_SCREEN) {
        console.log("[AURA_SWIPE] loadBatch failed", loadError);
      }
      setError(loadError instanceof Error ? loadError.message : "Unable to load swipe looks.");
    } finally {
      setLoading(false);
    }
  }, [canGenerate, items, progress, resetMotionValues, uid]);

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

  React.useEffect(() => {
    preloadLookImages(batch.slice(currentIndex, currentIndex + 3));
  }, [batch, currentIndex]);

  const persistSwipe = React.useCallback(
    async (lookEntry: AuraSwipeBatchLook, direction: AuraSwipeDirectionLabel) => {
      if (!uid) {
        if (DEBUG_AURA_SWIPE_SCREEN) {
          console.warn("No user auth, skipping remote save");
        }
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
        }
      } catch (e) {
        if (DEBUG_AURA_SWIPE_SCREEN) {
          if (__DEV__) {
            console.error("SAVE LOOK ERROR:", e);
          }
        }
        throw e;
      }
    },
    [batchId, uid],
  );

  const finishCommittedSwipe = React.useCallback(() => {
    const pendingSwipe = pendingSwipeRef.current;
    if (!pendingSwipe) {
      processingSwipeRef.current = false;
      setProcessingSwipe(false);
      resetMotionValues();
      return;
    }

    pendingSwipeRef.current = null;
    const { direction, lookEntry } = pendingSwipe;
    resetMotionValues();
    setCurrentIndex((previous) => previous + 1);
    processingSwipeRef.current = false;
    setProcessingSwipe(false);
    Toast.success(swipeToastTitle(direction));
    void persistSwipe(lookEntry, direction).catch((persistError) => {
      Alert.alert(
        "Swipe saved locally",
        persistError instanceof Error
          ? persistError.message
          : "We could not finish saving that feedback.",
      );
    });
  }, [persistSwipe, resetMotionValues]);

  const commitSwipe = React.useCallback(
    (direction: AuraSwipeDirectionLabel, metrics: SwipeMetrics) => {
      if (processingSwipeRef.current || !activeLookRef.current) return;

      const lookEntry = activeLookRef.current;
      pendingSwipeRef.current = { direction, lookEntry };
      processingSwipeRef.current = true;
      setProcessingSwipe(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (DEBUG_AURA_SWIPE_SCREEN) {
        const nextLook = batch[currentIndex + 1] ?? null;
        console.log("[AURA_SWIPE] commit", {
          currentIndex,
          action: swipeActionLabel(direction),
          source: metrics.source,
          translationX: Math.round(metrics.translationX),
          translationY: Math.round(metrics.translationY),
          velocityX: Math.round(metrics.velocityX),
          velocityY: Math.round(metrics.velocityY),
          previousLookId: getSwipeLookId(lookEntry),
          nextLookId: getSwipeLookId(nextLook),
          looksRemaining: Math.max(0, batch.length - currentIndex - 1),
        });
      }

      const finishOnUi = (finished?: boolean) => {
        "worklet";
        if (!finished) return;
        runOnJS(finishCommittedSwipe)();
      };

      if (direction === "up") {
        translateX.value = withTiming(0, {
          duration: 260,
          easing: Easing.out(Easing.cubic),
        });
        translateY.value = withTiming(-height * 0.78, {
          duration: 270,
          easing: Easing.out(Easing.cubic),
        }, finishOnUi);
        activeScale.value = withTiming(0.92, {
          duration: 270,
          easing: Easing.out(Easing.cubic),
        });
        activeOpacity.value = withTiming(0, {
          duration: 250,
          easing: Easing.out(Easing.quad),
        });
        return;
      }

      const directionSign = direction === "right" ? 1 : -1;
      const exitY = Math.max(-70, Math.min(76, metrics.translationY || 24));
      translateX.value = withTiming(directionSign * width * 1.18, {
        duration: 240,
        easing: Easing.out(Easing.cubic),
      }, finishOnUi);
      translateY.value = withTiming(exitY, {
        duration: 240,
        easing: Easing.out(Easing.cubic),
      });
      activeScale.value = withTiming(0.985, {
        duration: 220,
        easing: Easing.out(Easing.quad),
      });
      activeOpacity.value = withTiming(1, { duration: 180 });
    },
    [
      activeOpacity,
      activeScale,
      batch,
      currentIndex,
      finishCommittedSwipe,
      height,
      translateX,
      translateY,
      width,
    ],
  );

  const advanceDeck = React.useCallback(
    (direction: AuraSwipeDirectionLabel) => {
      commitSwipe(direction, {
        translationX: 0,
        translationY: 0,
        velocityX: 0,
        velocityY: 0,
        source: "button",
      });
    },
    [commitSwipe],
  );

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          !processingSwipeRef.current &&
          Boolean(activeLookRef.current) &&
          (Math.abs(gestureState.dx) > 6 || Math.abs(gestureState.dy) > 6),
        onPanResponderGrant: () => {
          touchStartRef.current = { moved: false };
          activeOpacity.value = 1;
          activeScale.value = withTiming(0.98, {
            duration: 110,
            easing: Easing.out(Easing.quad),
          });
        },
        onPanResponderMove: (_, gestureState) => {
          touchStartRef.current.moved = true;
          const constrainedPan = getConstrainedPan(gestureState.dx, gestureState.dy);
          translateX.value = constrainedPan.x;
          translateY.value = constrainedPan.y;
        },
        onPanResponderRelease: (_, gestureState) => {
          const absX = Math.abs(gestureState.dx);
          const absY = Math.abs(gestureState.dy);
          const velocityX = gestureState.vx * 1000;
          const velocityY = gestureState.vy * 1000;
          const isFastUp =
            velocityY <= SWIPE_Y_VELOCITY_THRESHOLD &&
            gestureState.dy < -36 &&
            absY > absX * 0.55;
          const isFastRight =
            velocityX >= SWIPE_X_VELOCITY_THRESHOLD &&
            gestureState.dx > 42 &&
            absX > absY * 0.55;
          const isFastLeft =
            velocityX <= -SWIPE_X_VELOCITY_THRESHOLD &&
            gestureState.dx < -42 &&
            absX > absY * 0.55;
          const metrics: SwipeMetrics = {
            translationX: gestureState.dx,
            translationY: gestureState.dy,
            velocityX,
            velocityY,
            source: "gesture",
          };

          if (
            (gestureState.dy <= SWIPE_Y_THRESHOLD && absY > absX * 0.8) ||
            isFastUp
          ) {
            commitSwipe("up", metrics);
            return;
          }

          if (gestureState.dx >= SWIPE_X_THRESHOLD || isFastRight) {
            commitSwipe("right", metrics);
            return;
          }

          if (gestureState.dx <= -SWIPE_X_THRESHOLD || isFastLeft) {
            commitSwipe("left", metrics);
            return;
          }

          if (!touchStartRef.current.moved && activeLookRef.current) {
            setDetailsLook(activeLookRef.current);
          }

          translateX.value = withSpring(0, CANCEL_SPRING);
          translateY.value = withSpring(0, CANCEL_SPRING);
          activeScale.value = withSpring(1, CANCEL_SPRING);
          activeOpacity.value = withSpring(1, CANCEL_SPRING);
        },
        onPanResponderTerminate: () => {
          translateX.value = withSpring(0, CANCEL_SPRING);
          translateY.value = withSpring(0, CANCEL_SPRING);
          activeScale.value = withSpring(1, CANCEL_SPRING);
          activeOpacity.value = withSpring(1, CANCEL_SPRING);
        },
      }),
    [activeOpacity, activeScale, commitSwipe, translateX, translateY],
  );

  const revealProgressStyle = useAnimatedStyle(() => {
    const horizontalReveal = interpolate(
      Math.abs(translateX.value),
      [0, 160],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const verticalReveal = interpolate(
      -translateY.value,
      [0, 170],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const reveal = Math.max(horizontalReveal, verticalReveal);

    return {
      opacity: interpolate(reveal, [0, 1], [0.55, 1], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(
            reveal,
            [0, 1],
            [STACK_NEXT_OFFSET, 0],
            Extrapolation.CLAMP,
          ),
        },
        {
          scale: interpolate(
            reveal,
            [0, 1],
            [STACK_NEXT_SCALE, 1],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  const nextDimStyle = useAnimatedStyle(() => {
    const reveal = Math.max(
      interpolate(Math.abs(translateX.value), [0, 160], [0, 1], Extrapolation.CLAMP),
      interpolate(-translateY.value, [0, 170], [0, 1], Extrapolation.CLAMP),
    );

    return {
      opacity: interpolate(reveal, [0, 1], [0.22, 0], Extrapolation.CLAMP),
    };
  });

  const activeCardStyle = useAnimatedStyle(() => {
    const verticalPullDamping = interpolate(
      translateY.value,
      [-150, 0],
      [0.2, 1],
      Extrapolation.CLAMP,
    );
    const rotation = interpolate(
      translateX.value,
      [-width, 0, width],
      [-7, 0, 7],
      Extrapolation.CLAMP,
    ) * verticalPullDamping;

    return {
      opacity: activeOpacity.value,
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotation}deg` },
        { scale: activeScale.value },
      ],
    };
  });

  const dragGlowStyle = useAnimatedStyle(() => {
    const dragAmount = Math.max(Math.abs(translateX.value), Math.max(0, -translateY.value));
    return {
      opacity: interpolate(dragAmount, [0, 80, 150], [0, 0.34, 0.5], Extrapolation.CLAMP),
    };
  });

  const likeBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [28, 120], [0, 0.9], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(translateX.value, [28, 120], [8, 0], Extrapolation.CLAMP) },
    ],
  }));

  const nopeBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(-translateX.value, [28, 120], [0, 0.9], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(-translateX.value, [28, 120], [8, 0], Extrapolation.CLAMP) },
    ],
  }));

  const saveBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(-translateY.value, [28, 118], [0, 0.9], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(-translateY.value, [28, 118], [8, 0], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <LinearGradient
      colors={[auraTheme.backgroundTop, auraTheme.backgroundMid, auraTheme.backgroundBottom]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <AuraSubpageHeader
        title="Train your taste"
        eyebrow="AURA SWIPE"
        fallbackRoute="/(tabs)/ai"
        rightAction={<HeaderButton icon="refresh" label="Refresh" onPress={() => void loadBatch()} />}
      />

      <View style={{ paddingHorizontal: 18, paddingTop: 12 }}>
        <View style={styles.progressCard}>
          <Text style={styles.progressTitle}>{looksLeftLabel}</Text>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
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
          <TasteTrainedStateCard onRefresh={() => void loadBatch()} />
        ) : (
          <View style={{ width: "100%", alignItems: "center" }}>
            <View style={{ width: "100%", maxWidth: 408, height: Math.min(height * 0.56, 640) }}>
              {next ? (
                <Reanimated.View
                  key={`next-${next.id}`}
                  pointerEvents="none"
                  style={[
                    styles.deckCard,
                    styles.nextDeckCard,
                    revealProgressStyle,
                  ]}
                >
                  <View style={styles.nextPreviewShell}>
                    <AuraLookCard
                      look={next.look}
                      itemsById={itemsById}
                      viewportWidth={Math.min(width - 74, 356)}
                      hideActions
                      compact
                      swipeVariant
                      boardOnly
                    />
                    <Reanimated.View pointerEvents="none" style={[styles.nextPreviewDim, nextDimStyle]} />
                  </View>
                </Reanimated.View>
              ) : null}

              {current ? (
                <Reanimated.View
                  key={`current-${current.id}`}
                  style={[styles.deckCard, styles.currentDeckCard, activeCardStyle]}
                  {...panResponder.panHandlers}
                >
                  <Pressable style={styles.cardPressable} onPress={() => setDetailsLook(current)}>
                    <Reanimated.View pointerEvents="none" style={[styles.cardGlow, dragGlowStyle]} />
                    <AuraLookCard
                      look={current.look}
                      itemsById={itemsById}
                      viewportWidth={Math.min(width - 54, 382)}
                      hideActions
                      compact
                      swipeVariant
                    />
                    <Reanimated.View pointerEvents="none" style={[styles.swipeBadge, styles.likeBadge, likeBadgeStyle]}>
                      <Ionicons name="heart" size={15} color="#DFF8EA" />
                      <Text style={styles.swipeBadgeText}>LIKE</Text>
                    </Reanimated.View>
                    <Reanimated.View pointerEvents="none" style={[styles.swipeBadge, styles.nopeBadge, nopeBadgeStyle]}>
                      <Ionicons name="close" size={16} color="#FFE2E5" />
                      <Text style={styles.swipeBadgeText}>NOPE</Text>
                    </Reanimated.View>
                    <Reanimated.View pointerEvents="none" style={[styles.swipeBadge, styles.saveBadge, saveBadgeStyle]}>
                      <Ionicons name="star" size={15} color="#FFF2C7" />
                      <Text style={styles.swipeBadgeText}>SAVE</Text>
                    </Reanimated.View>
                  </Pressable>
                </Reanimated.View>
              ) : null}
            </View>
          </View>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 14, 24) }]}>
        <View style={styles.footerActions}>
          <ActionButton label="Nope" icon="close" onPress={() => advanceDeck("left")} disabled={!activeLook || processingSwipe} tone="subtle" />
          <ActionButton label="Like" icon="heart" onPress={() => advanceDeck("right")} disabled={!activeLook || processingSwipe} primary />
          <ActionButton label="Save" icon="star" onPress={() => advanceDeck("up")} disabled={!activeLook || processingSwipe} tone="secondary" />
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

function TasteTrainedStateCard({ onRefresh }: { onRefresh: () => void }) {
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
      <Text style={styles.stateTitle}>Taste trained.</Text>
      <Text style={styles.stateBody}>AURA has more signal for your next outfit.</Text>
      <View style={styles.endActionStack}>
        <Pressable onPress={onRefresh} style={styles.caughtUpButton}>
          <LinearGradient
            colors={[colors.ctaCream, colors.ctaCream]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.caughtUpButtonGradient}
          >
            <Ionicons name="refresh" size={15} color={colors.background} />
            <Text style={[styles.caughtUpButtonText, { color: colors.background }]}>Generate new set</Text>
          </LinearGradient>
        </Pressable>
        <View style={styles.endSecondaryRow}>
          <Pressable onPress={() => router.push("/profile/my-looks")} style={styles.endSecondaryButton}>
            <Text style={styles.endSecondaryText}>View saved looks</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/(tabs)/ai")} style={styles.endSecondaryButton}>
            <Text style={styles.endSecondaryText}>Back to AURA</Text>
          </Pressable>
        </View>
      </View>
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
      <Ionicons name={icon} size={16} color={palette.textPrimary} />
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
  tone = "secondary",
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled: boolean;
  primary?: boolean;
  tone?: "subtle" | "secondary";
}) {
  const iconColor = primary ? palette.ctaText : tone === "subtle" ? auraTheme.textMuted : palette.textPrimary;
  const textStyle = primary
    ? styles.actionPrimaryText
    : tone === "subtle"
      ? styles.actionSubtleText
      : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        primary
          ? [styles.actionPrimary, styles.actionPrimarySize]
          : tone === "subtle"
            ? styles.actionSubtle
            : styles.actionSecondary,
        disabled ? { opacity: 0.45 } : null,
        pressed && !disabled ? { transform: [{ scale: 0.98 }] } : null,
      ]}
    >
      <Ionicons name={icon} size={primary ? 15 : 13} color={iconColor} />
      <Text style={[styles.actionButtonText, textStyle]}>{label}</Text>
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

const styles = StyleSheet.create({
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
    color: palette.textPrimary,
    fontSize: 12,
    fontWeight: "700",
    fontFamily: Fonts.sans,
  },
  progressCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: auraTheme.borderSoft,
    backgroundColor: auraTheme.surfaceSoft,
    paddingHorizontal: 13,
    paddingVertical: 11,
    gap: 8,
  },
  progressTitle: {
    color: palette.textPrimary,
    fontSize: 14,
    fontWeight: "800",
    fontFamily: Fonts.sans,
  },
  progressTrack: {
    height: 4,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#F8D4C8",
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
    top: 0,
    left: 0,
    right: 0,
    overflow: "visible",
  },
  currentDeckCard: {
    zIndex: 2,
  },
  nextDeckCard: {
    zIndex: 1,
    alignItems: "center",
  },
  nextPreviewShell: {
    width: "100%",
    alignItems: "center",
    borderRadius: 24,
    paddingTop: 18,
    paddingHorizontal: 10,
    paddingBottom: 18,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  nextPreviewDim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    backgroundColor: "rgba(4, 7, 12, 0.32)",
  },
  cardPressable: {
    position: "relative",
    width: "100%",
    overflow: "visible",
  },
  cardGlow: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 19,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: "rgba(248, 212, 200, 0.62)",
    backgroundColor: "rgba(248, 212, 200, 0.025)",
  },
  swipeBadge: {
    position: "absolute",
    zIndex: 20,
    top: 18,
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  likeBadge: {
    right: 18,
    backgroundColor: "rgba(33, 130, 82, 0.26)",
    borderColor: "rgba(190, 247, 216, 0.34)",
  },
  nopeBadge: {
    left: 18,
    backgroundColor: "rgba(150, 44, 56, 0.28)",
    borderColor: "rgba(255, 201, 207, 0.34)",
  },
  saveBadge: {
    left: "50%",
    width: 96,
    marginLeft: -48,
    backgroundColor: "rgba(165, 122, 42, 0.28)",
    borderColor: "rgba(255, 235, 176, 0.38)",
  },
  swipeBadgeText: {
    color: palette.textPrimary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
    fontFamily: Fonts.sans,
  },
  overlayBadge: {
    position: "absolute",
    zIndex: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: auraTheme.borderAccent,
    backgroundColor: palette.dockBackground,
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
    paddingTop: 8,
    gap: 10,
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
    gap: 8,
  },
  actionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    borderWidth: 1,
  },
  actionPrimary: {
    backgroundColor: palette.ctaCream,
    borderColor: palette.borderWarm,
  },
  actionPrimarySize: {
    minHeight: 42,
  },
  actionSecondary: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderColor: auraTheme.borderSoft,
  },
  actionSubtle: {
    backgroundColor: "rgba(255,255,255,0.035)",
    borderColor: "rgba(255,255,255,0.08)",
  },
  actionButtonText: {
    color: palette.textPrimary,
    fontSize: 12,
    fontWeight: "800",
    fontFamily: Fonts.sans,
  },
  actionPrimaryText: {
    color: palette.ctaText,
    fontSize: 13,
    fontWeight: "900",
  },
  actionSubtleText: {
    color: auraTheme.textMuted,
    fontWeight: "700",
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
    color: palette.textPrimary,
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
    color: palette.textPrimary,
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
    letterSpacing: 0,
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
  endActionStack: {
    gap: 10,
    marginTop: 4,
  },
  endSecondaryRow: {
    flexDirection: "row",
    gap: 8,
  },
  endSecondaryButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  endSecondaryText: {
    color: palette.textPrimary,
    fontSize: 12,
    fontWeight: "800",
    fontFamily: Fonts.sans,
  },
  modalScrim: {
    flex: 1,
    backgroundColor: palette.overlay,
    justifyContent: "flex-end",
  },
  modalCard: {
    maxHeight: "88%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: palette.surfaceElevated,
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
    color: palette.textPrimary,
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
    color: palette.textPrimary,
    fontSize: 13.5,
    lineHeight: 18,
    fontFamily: Fonts.sans,
  },
});
