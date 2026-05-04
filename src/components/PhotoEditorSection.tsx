// Requires @react-native-community/slider in the Expo dev client; falls back to stepper controls when unavailable.
import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeScreen } from "./SafeScreen";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { Colors } from "@/constants/theme";

type PhotoEditorSectionProps = {
  previewUri: string | null;
  normalizedPreviewUri?: string | null;
  cleanedPreviewUri?: string | null;
  fallbackPreviewUri?: string | null;
  hasCutoutPreview?: boolean;
  maskDebugUri?: string | null;
  refineValue: number;
  edgePolish?: number;
  debugThreshold?: number;
  debugCleanupRadius?: number;
  debugFeather?: number;
  debugEdgeTighten?: number;
  isProcessing: boolean;
  canRefine: boolean;
  isAiRunning?: boolean;
  statusText?: string | null;
  showPendingNote: boolean;
  onPickLibrary: () => void;
  onUseCamera: () => void;
  onRemove: () => void;
  onRefineChange: (value: number) => void;
  onRefineComplete: (value: number) => void;
  onResetRefine: () => void;
  onEdgePolishChange?: (value: number, commit?: boolean) => void;
  onDebugThresholdChange?: (value: number, commit?: boolean) => void;
  onDebugCleanupRadiusChange?: (value: number, commit?: boolean) => void;
  onDebugFeatherChange?: (value: number, commit?: boolean) => void;
  onDebugEdgeTightenChange?: (value: number, commit?: boolean) => void;
  onReplace?: () => void;
  onRotate?: () => void;
  onAdjust?: () => void;
  onRefineOpen?: () => void;
  frameless?: boolean;
};

type RefineControlsProps = {
  value: number;
  isProcessing: boolean;
  useNativeSlider: boolean;
  onNativeError: () => void;
  onChange: (value: number) => void;
  onComplete: (value: number) => void;
  onReset: () => void;
};

type NativeGuardProps = React.PropsWithChildren<{
  onError: () => void;
}>;

type NativeGuardState = {
  hasError: boolean;
};

class NativeGuard extends React.Component<NativeGuardProps, NativeGuardState> {
  constructor(props: NativeGuardProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

const sliderThumbImage = require("../assets/sliderThumb.png");
const editorColors = Colors.dark;

function RefineControls(props: RefineControlsProps) {
  const {
    value,
    isProcessing,
    useNativeSlider,
    onNativeError,
    onChange,
    onComplete,
    onReset,
  } = props;

  const percent = Math.round(value * 100);
  const [isDragging, setIsDragging] = useState(false);
  const statusLabel = isProcessing ? "Updating..." : isDragging ? "Preview" : "Final";

  function handleValueChange(nextValue: number) {
    if (!isDragging) {
      setIsDragging(true);
    }
    onChange(nextValue);
  }

  function handleSlidingComplete(nextValue: number) {
    setIsDragging(false);
    onComplete(nextValue);
    void (async () => {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Keep the slider safe even if haptics are unavailable.
      }
    })();
  }

  if (!useNativeSlider) {
    const nudge = (delta: number) => {
      const nextValue = clamp01(Math.round((value + delta) * 100) / 100);
      setIsDragging(false);
      onChange(nextValue);
      onComplete(nextValue);
    };

    return (
      <View style={{ gap: 10 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ color: editorColors.text, fontSize: 14, fontWeight: "700" }}>
            Clean more: {percent}%
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ color: editorColors.textSecondary, fontSize: 12, fontWeight: "700" }}>
              {statusLabel}
            </Text>
            <Pressable onPress={onReset} disabled={isProcessing}>
              <Text
                style={{
                  color: editorColors.ctaCream,
                  fontSize: 12,
                  fontWeight: "700",
                  opacity: isProcessing ? 0.5 : 1,
                }}
              >
                Reset
              </Text>
            </Pressable>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Pressable onPress={() => nudge(-0.05)} style={stepperButton}>
            <Text style={stepperButtonText}>-</Text>
          </Pressable>
          <Text style={{ minWidth: 56, textAlign: "center", fontWeight: "700", color: editorColors.text }}>
            {percent}%
          </Text>
          <Pressable onPress={() => nudge(0.05)} style={stepperButton}>
            <Text style={stepperButtonText}>+</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: editorColors.text, fontSize: 14, fontWeight: "700" }}>
          Clean more: {percent}%
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ color: editorColors.textSecondary, fontSize: 12, fontWeight: "700" }}>
            {statusLabel}
          </Text>
          <Pressable onPress={onReset} disabled={isProcessing}>
            <Text
              style={{
                color: editorColors.ctaCream,
                fontSize: 12,
                fontWeight: "700",
                opacity: isProcessing ? 0.5 : 1,
              }}
            >
              Reset
            </Text>
          </Pressable>
        </View>
      </View>
      <View style={{ paddingVertical: 8, marginHorizontal: -6 }}>
        <NativeGuard onError={onNativeError}>
          <Slider
            value={value}
            minimumValue={0}
            maximumValue={1}
            step={0.01}
            onValueChange={handleValueChange}
            onSlidingComplete={handleSlidingComplete}
            minimumTrackTintColor={editorColors.ctaCream}
            maximumTrackTintColor={editorColors.borderStrong}
            tapToSeek={false}
            thumbImage={Platform.OS === "ios" ? sliderThumbImage : undefined}
            thumbTintColor={Platform.OS === "ios" ? undefined : editorColors.ctaCream}
          />
        </NativeGuard>
      </View>
    </View>
  );
}

function formatDebugValue(value: number, decimals = 2) {
  return value.toFixed(decimals);
}

function DebugTuneRow(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  useNativeSlider: boolean;
  onNativeError: () => void;
  onChange?: (value: number, commit?: boolean) => void;
}) {
  const {
    label,
    value,
    min,
    max,
    step,
    decimals = 2,
    useNativeSlider,
    onNativeError,
    onChange,
  } = props;

  if (!onChange) {
    return null;
  }

  const clamp = (nextValue: number) => {
    const stepped = Math.round(nextValue / step) * step;
    return Math.max(min, Math.min(max, Number(stepped.toFixed(decimals))));
  };

  const nudge = (delta: number) => {
    const nextValue = clamp(value + delta);
    onChange(nextValue, true);
  };

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: editorColors.text, fontSize: 13, fontWeight: "700" }}>{label}</Text>
        <Text style={{ color: editorColors.textSecondary, fontSize: 13, fontVariant: ["tabular-nums"] }}>
          {formatDebugValue(value, decimals)}
        </Text>
      </View>
      {useNativeSlider ? (
        <View style={{ marginHorizontal: -6 }}>
          <NativeGuard onError={onNativeError}>
            <Slider
              value={value}
              minimumValue={min}
              maximumValue={max}
              step={step}
              onValueChange={(nextValue) => onChange(clamp(nextValue), false)}
              onSlidingComplete={(nextValue) => onChange(clamp(nextValue), true)}
              minimumTrackTintColor={editorColors.ctaCream}
              maximumTrackTintColor={editorColors.borderStrong}
              tapToSeek={false}
              thumbImage={Platform.OS === "ios" ? sliderThumbImage : undefined}
              thumbTintColor={Platform.OS === "ios" ? undefined : editorColors.ctaCream}
            />
          </NativeGuard>
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Pressable onPress={() => nudge(-step)} style={stepperButton}>
            <Text style={stepperButtonText}>-</Text>
          </Pressable>
          <Text
            style={{
              minWidth: 72,
              textAlign: "center",
              fontWeight: "700",
              color: editorColors.text,
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatDebugValue(value, decimals)}
          </Text>
          <Pressable onPress={() => nudge(step)} style={stepperButton}>
            <Text style={stepperButtonText}>+</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function PreviewCanvas(props: {
  uri: string;
  large?: boolean;
  compact?: boolean;
  checkerboard?: boolean;
}) {
  const { uri, large = false, compact = false, checkerboard = false } = props;
  const previewPadding = compact ? 18 : large ? 28 : 24;
  const previewBackgroundColor = editorColors.boardLight;

  return (
    <View
      style={{
        width: "100%",
        aspectRatio: compact ? 1.14 : large ? 4 / 5 : 1,
        borderRadius: large ? 20 : 16,
        borderWidth: 1,
        borderColor: editorColors.borderWarm,
        backgroundColor: previewBackgroundColor,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {checkerboard ? <CheckerboardBackground /> : null}
      <View
        style={{
          width: "100%",
          height: "100%",
          padding: previewPadding,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Image
          source={{ uri }}
          style={{
            width: "100%",
            height: "100%",
            shadowColor: editorColors.ctaCream,
            shadowOpacity: checkerboard ? 0 : 0.12,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 5 },
          }}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

function CheckerboardBackground() {
  const cells = Array.from({ length: 64 }, (_, index) => index);
  return (
    <View
      pointerEvents="none"
      style={{
        ...StyleSheet.absoluteFillObject,
        flexDirection: "row",
        flexWrap: "wrap",
      }}
    >
      {cells.map((cell) => {
        const row = Math.floor(cell / 8);
        const col = cell % 8;
        const dark = (row + col) % 2 === 0;
        return (
          <View
            key={cell}
            style={{
              width: "12.5%",
              height: "12.5%",
              backgroundColor: dark ? "rgba(25,0,25,0.06)" : editorColors.boardLight,
            }}
          />
        );
      })}
    </View>
  );
}

export function PhotoEditorSection(props: PhotoEditorSectionProps) {
  const {
    previewUri,
    normalizedPreviewUri = null,
    cleanedPreviewUri = null,
    fallbackPreviewUri = null,
    maskDebugUri = null,
    refineValue,
    edgePolish = 0.5,
    debugThreshold = 0.64,
    debugCleanupRadius = 2,
    debugFeather = 0,
    debugEdgeTighten = 0.45,
    isProcessing,
    canRefine,
    isAiRunning = false,
    statusText = null,
    showPendingNote,
    onPickLibrary,
    onUseCamera,
    onRemove,
    onRefineChange,
    onRefineComplete,
    onResetRefine,
    onEdgePolishChange,
    onDebugThresholdChange,
    onDebugCleanupRadiusChange,
    onDebugFeatherChange,
    onDebugEdgeTightenChange,
    onReplace,
    onRotate,
    onAdjust,
    onRefineOpen,
    frameless = false,
  } = props;
  const { colors } = useAppTheme();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [sliderErrored, setSliderErrored] = useState(false);
  const [activeModalPreview, setActiveModalPreview] = useState<"cutout" | "mask">("cutout");
  const [liveRefineValue, setLiveRefineValue] = useState(refineValue);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const displayedPreviewUri = normalizedPreviewUri ?? cleanedPreviewUri ?? fallbackPreviewUri ?? previewUri;
  const modalDisplayedPreviewUri =
    activeModalPreview === "mask" && maskDebugUri
      ? maskDebugUri
      : cleanedPreviewUri ?? fallbackPreviewUri ?? previewUri;

  useEffect(() => {
    setLiveRefineValue(refineValue);
  }, [refineValue]);

  useEffect(() => {
    if (!__DEV__ || !displayedPreviewUri) {
      return;
    }
    console.log("[AddItemPreview] render:selected-uri", {
      normalizedPreviewUri,
      cleanedPreviewUri,
      fallbackPreviewUri,
      previewUri,
      displayedPreviewUri,
    });
  }, [
    cleanedPreviewUri,
    displayedPreviewUri,
    fallbackPreviewUri,
    normalizedPreviewUri,
    previewUri,
  ]);

  const useNativeSlider = Platform.OS === "ios" && !sliderErrored;
  const themedEditorButton = {
    ...editorButton,
    borderColor: colors.border,
    backgroundColor: colors.chipBackground,
  };
  const themedPrimaryEditorButton = {
    ...editorButton,
    borderColor: colors.ctaCream,
    backgroundColor: colors.ctaCream,
  };
  const themedEditorButtonText = {
    ...editorButtonText,
    color: colors.text,
  };
  const themedDestructiveEditorButton = {
    ...editorButton,
    borderColor: "rgba(255,77,79,0.28)",
    backgroundColor: "rgba(255,77,79,0.08)",
  };
  const themedDestructiveEditorButtonText = {
    ...editorButtonText,
    color: colors.danger,
  };
  const themedPrimaryEditorButtonText = {
    ...editorButtonText,
    color: colors.ctaText,
  };
  const emptyPreviewHeight = Math.min(220, Math.max(176, screenHeight * 0.22));

  function handleNativeSliderError() {
    setSliderErrored(true);
  }

  return (
    <>
      <View
        style={{
          gap: 12,
          padding: frameless ? 0 : 12,
          borderRadius: frameless ? 0 : 22,
          borderWidth: frameless ? 0 : 1,
          borderColor: "rgba(251,228,216,0.12)",
          backgroundColor: frameless ? "transparent" : "rgba(18,0,20,0.62)",
        }}
      >
        {displayedPreviewUri ? (
          <Pressable
            onPress={() => {
              onRefineOpen?.();
              setActiveModalPreview("cutout");
              setIsModalVisible(true);
            }}
          >
            <PreviewCanvas uri={displayedPreviewUri} compact />
          </Pressable>
        ) : (
          <View
            style={{
              width: "100%",
              height: emptyPreviewHeight,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: "rgba(251,228,216,0.14)",
              backgroundColor: "rgba(43,18,76,0.34)",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 22,
              gap: 10,
            }}
          >
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(223,182,178,0.12)",
                borderWidth: 1,
                borderColor: "rgba(223,182,178,0.18)",
              }}
            >
              <Ionicons name="cloud-upload-outline" size={22} color={colors.ctaCream} />
            </View>
            <Text style={{ color: colors.text, fontWeight: "900", textAlign: "center", fontSize: 16 }}>
              Add an item photo
            </Text>
            <Text style={{ color: colors.textSecondary, fontWeight: "600", textAlign: "center", fontSize: 13 }}>
              A clean front-facing image works best.
            </Text>
          </View>
        )}

        {displayedPreviewUri ? (
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {canRefine ? (
              <Pressable
                onPress={() => {
                  onRefineOpen?.();
                  setActiveModalPreview("cutout");
                  setIsModalVisible(true);
                }}
                style={[themedPrimaryEditorButton, { minHeight: 42, flexGrow: 1 }]}
              >
                <Text style={themedPrimaryEditorButtonText}>Refine cutout</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onReplace ?? onPickLibrary}
              style={[themedEditorButton, { minHeight: 42, flexGrow: 1 }]}
            >
              <Text style={themedEditorButtonText}>Change</Text>
            </Pressable>
            <Pressable onPress={onRemove} style={[themedDestructiveEditorButton, { minHeight: 42 }]}>
              <Text style={themedDestructiveEditorButtonText}>Remove</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={onPickLibrary} style={[themedPrimaryEditorButton, { flex: 1 }]}>
              <Text style={themedPrimaryEditorButtonText}>Choose Photo</Text>
            </Pressable>
            <Pressable onPress={onUseCamera} style={[themedEditorButton, { flex: 1 }]}>
              <Text style={themedEditorButtonText}>Camera</Text>
            </Pressable>
          </View>
        )}

        {statusText ? (
          <Text style={{ color: isAiRunning ? colors.lightPurple : colors.textSecondary, fontSize: 13 }}>
            {statusText}
          </Text>
        ) : null}

        {showPendingNote ? (
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            New photo selected. It will upload to Firebase Storage when you save.
          </Text>
        ) : null}
      </View>

      <Modal
        visible={isModalVisible && !!displayedPreviewUri}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          setActiveModalPreview("cutout");
          setIsModalVisible(false);
        }}
      >
        <SafeScreen
          backgroundColor={colors.background}
          includeBottomInset={false}
        >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View
            style={{
              height: 72,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Pressable
              onPress={() => {
                setActiveModalPreview("cutout");
                setIsModalVisible(false);
              }}
              hitSlop={10}
              style={{ minHeight: 40, justifyContent: "center" }}
            >
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>Cancel</Text>
            </Pressable>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>Refine Cutout</Text>
            <Pressable
              onPress={() => {
                setActiveModalPreview("cutout");
                setIsModalVisible(false);
              }}
              hitSlop={10}
              style={{ minHeight: 40, justifyContent: "center" }}
            >
              <Text style={{ color: colors.ctaCream, fontSize: 15, fontWeight: "800" }}>Apply</Text>
            </Pressable>
          </View>

          {modalDisplayedPreviewUri ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                flexGrow: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 16,
                paddingVertical: 20,
              }}
              minimumZoomScale={1}
              maximumZoomScale={4}
              bouncesZoom={false}
              centerContent
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <View
                style={{
                  width: Math.max(280, screenWidth - 32),
                  height: Math.max(360, screenHeight * 0.55),
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: colors.borderWarm,
                  overflow: "hidden",
                  backgroundColor: colors.boardLight,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <CheckerboardBackground />
                <Image
                  source={{ uri: modalDisplayedPreviewUri ?? undefined }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="contain"
                />
              </View>
            </ScrollView>
          ) : null}

          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 14,
              paddingBottom: 24,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderTopWidth: 1,
              borderColor: colors.border,
              backgroundColor: "rgba(18,0,20,0.96)",
              gap: 10,
            }}
          >
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {cleanedPreviewUri ? (
                <Pressable
                  onPress={() => setActiveModalPreview("cutout")}
                  style={[
                    themedEditorButton,
                    activeModalPreview === "cutout" ? activePreviewButton : null,
                  ]}
                >
                  <Text style={themedEditorButtonText}>Show cutout</Text>
                </Pressable>
              ) : null}
              {onAdjust ? (
                <Pressable onPress={onAdjust} style={themedEditorButton}>
                  <Text style={themedEditorButtonText}>Adjust</Text>
                </Pressable>
              ) : null}
              {maskDebugUri ? (
                <Pressable
                  onPress={() => setActiveModalPreview("mask")}
                  style={[
                    themedEditorButton,
                    activeModalPreview === "mask" ? activePreviewButton : null,
                  ]}
                >
                  <Text style={themedEditorButtonText}>Show mask</Text>
                </Pressable>
              ) : null}
              {onRotate ? (
                <Pressable onPress={onRotate} style={themedEditorButton}>
                  <Text style={themedEditorButtonText}>Rotate</Text>
                </Pressable>
              ) : null}
            </View>

            {canRefine ? (
              <>
                <RefineControls
                  value={liveRefineValue}
                  isProcessing={isProcessing}
                  useNativeSlider={useNativeSlider}
                  onNativeError={handleNativeSliderError}
                  onChange={(value) => {
                    setLiveRefineValue(value);
                    onRefineChange(value);
                  }}
                  onComplete={(value) => {
                    setLiveRefineValue(value);
                    onRefineComplete(value);
                  }}
                  onReset={onResetRefine}
                />
                <View
                  style={{
                    gap: 8,
                    padding: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: "rgba(18,0,20,0.76)",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>
                      Edge polish
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, fontVariant: ["tabular-nums"] }}>
                      {formatDebugValue(edgePolish, 2)}
                    </Text>
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    Subtle contour cleanup for a smoother premium edge.
                  </Text>
                  <DebugTuneRow
                    label="Polish"
                    value={edgePolish}
                    min={0}
                    max={1}
                    step={0.01}
                    decimals={2}
                    useNativeSlider={useNativeSlider}
                    onNativeError={handleNativeSliderError}
                    onChange={onEdgePolishChange}
                  />
                </View>
                <View
                  style={{
                    gap: 12,
                    padding: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: "rgba(18,0,20,0.76)",
                  }}
                >
                  <View style={{ gap: 2 }}>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>
                      Debug tuning
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      Temporary live Apple Vision parameters for visual tuning.
                    </Text>
                  </View>
                  <DebugTuneRow
                    label="Threshold"
                    value={debugThreshold}
                    min={0.5}
                    max={0.75}
                    step={0.01}
                    decimals={2}
                    useNativeSlider={useNativeSlider}
                    onNativeError={handleNativeSliderError}
                    onChange={onDebugThresholdChange}
                  />
                  <DebugTuneRow
                    label="Cleanup radius"
                    value={debugCleanupRadius}
                    min={0}
                    max={4}
                    step={1}
                    decimals={0}
                    useNativeSlider={useNativeSlider}
                    onNativeError={handleNativeSliderError}
                    onChange={onDebugCleanupRadiusChange}
                  />
                  <DebugTuneRow
                    label="Feather"
                    value={debugFeather}
                    min={0}
                    max={3}
                    step={1}
                    decimals={0}
                    useNativeSlider={useNativeSlider}
                    onNativeError={handleNativeSliderError}
                    onChange={onDebugFeatherChange}
                  />
                  <DebugTuneRow
                    label="Edge tighten"
                    value={debugEdgeTighten}
                    min={0}
                    max={0.15}
                    step={0.01}
                    decimals={2}
                    useNativeSlider={useNativeSlider}
                    onNativeError={handleNativeSliderError}
                    onChange={onDebugEdgeTightenChange}
                  />
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  Drag to remove leftover background. Release for final quality.
                </Text>
              </>
            ) : (
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                Refine becomes available after a removable cutout is ready.
              </Text>
            )}
          </View>
        </View>
        </SafeScreen>
      </Modal>
    </>
  );
}

const editorButton = {
  minHeight: 44,
  paddingVertical: 10,
  paddingHorizontal: 14,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: editorColors.border,
  backgroundColor: editorColors.chipBackground,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

const activePreviewButton = {
  borderColor: editorColors.purpleBorder,
  backgroundColor: editorColors.purpleSurface,
};

const editorButtonText = {
  color: editorColors.text,
  fontWeight: "700" as const,
};

const stepperButton = {
  width: 38,
  height: 38,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: editorColors.border,
  backgroundColor: editorColors.chipBackground,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

const stepperButtonText = {
  color: editorColors.ctaCream,
  fontSize: 18,
  fontWeight: "800" as const,
};
