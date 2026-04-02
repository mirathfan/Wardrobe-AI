// Requires @react-native-community/slider in the Expo dev client; falls back to stepper controls when unavailable.
import Slider from "@react-native-community/slider";
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

type PhotoEditorSectionProps = {
  previewUri: string | null;
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
          <Text style={{ color: "#111", fontSize: 14, fontWeight: "700" }}>
            Clean more: {percent}%
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ color: "#666", fontSize: 12, fontWeight: "700" }}>
              {statusLabel}
            </Text>
            <Pressable onPress={onReset} disabled={isProcessing}>
              <Text
                style={{
                  color: "#111",
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
          <Text style={{ minWidth: 56, textAlign: "center", fontWeight: "700", color: "#111" }}>
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
        <Text style={{ color: "#111", fontSize: 14, fontWeight: "700" }}>
          Clean more: {percent}%
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ color: "#666", fontSize: 12, fontWeight: "700" }}>
            {statusLabel}
          </Text>
          <Pressable onPress={onReset} disabled={isProcessing}>
            <Text
              style={{
                color: "#111",
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
            minimumTrackTintColor="#111"
            maximumTrackTintColor="#e5e5e5"
            tapToSeek={false}
            thumbImage={Platform.OS === "ios" ? sliderThumbImage : undefined}
            thumbTintColor={Platform.OS === "ios" ? undefined : "#111"}
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
        <Text style={{ color: "#111", fontSize: 13, fontWeight: "700" }}>{label}</Text>
        <Text style={{ color: "#666", fontSize: 13, fontVariant: ["tabular-nums"] }}>
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
              minimumTrackTintColor="#111"
              maximumTrackTintColor="#e5e5e5"
              tapToSeek={false}
              thumbImage={Platform.OS === "ios" ? sliderThumbImage : undefined}
              thumbTintColor={Platform.OS === "ios" ? undefined : "#111"}
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
              color: "#111",
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

  return (
    <View
      style={{
        width: "100%",
        aspectRatio: compact ? 1 : large ? 4 / 5 : 1,
        borderRadius: large ? 20 : 16,
        borderWidth: 1,
        borderColor: "#e7e7e7",
        backgroundColor: "#f8f8f8",
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {checkerboard ? <CheckerboardBackground /> : null}
      <Image
        source={{ uri }}
        style={{ width: "100%", height: "100%" }}
        resizeMode="contain"
      />
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
              backgroundColor: dark ? "#d9d9d9" : "#f3f3f3",
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
    cleanedPreviewUri = null,
    fallbackPreviewUri = null,
    hasCutoutPreview = false,
    maskDebugUri = null,
    refineValue,
    edgePolish = 0.5,
    debugThreshold = 0.6,
    debugCleanupRadius = 2,
    debugFeather = 1,
    debugEdgeTighten = 0.03,
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
  } = props;
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [sliderErrored, setSliderErrored] = useState(false);
  const [activeModalPreview, setActiveModalPreview] = useState<"cutout" | "mask">("cutout");
  const [liveRefineValue, setLiveRefineValue] = useState(refineValue);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const displayedPreviewUri = cleanedPreviewUri ?? fallbackPreviewUri ?? previewUri;
  const modalDisplayedPreviewUri =
    activeModalPreview === "mask" && maskDebugUri
      ? maskDebugUri
      : cleanedPreviewUri ?? fallbackPreviewUri ?? previewUri;

  useEffect(() => {
    setLiveRefineValue(refineValue);
  }, [refineValue]);

  const useNativeSlider = Platform.OS === "ios" && !sliderErrored;

  function handleNativeSliderError() {
    setSliderErrored(true);
  }

  return (
    <>
      <View
        style={{
          gap: 12,
          padding: 12,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: "#ebebeb",
          backgroundColor: "#fff",
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
            <PreviewCanvas uri={displayedPreviewUri} compact checkerboard />
          </Pressable>
        ) : (
          <View
            style={{
              width: "100%",
              aspectRatio: 1,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: "#e7e7e7",
              backgroundColor: "#f3f3f3",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 24,
            }}
          >
            <Text style={{ color: "#666", fontWeight: "700", textAlign: "center" }}>
              Pick a photo to start.
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
                style={[editorButton, { minWidth: 120 }]}
              >
                <Text style={editorButtonText}>Refine cutout</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onReplace ?? onPickLibrary}
              style={[editorButton, { minWidth: 120 }]}
            >
              <Text style={editorButtonText}>Change photo</Text>
            </Pressable>
            <Pressable onPress={onUseCamera} style={[editorButton, { minWidth: 110 }]}>
              <Text style={editorButtonText}>Use camera</Text>
            </Pressable>
            <Pressable onPress={onRemove} style={editorButton}>
              <Text style={editorButtonText}>Remove</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={onPickLibrary} style={[editorButton, { flex: 1 }]}>
              <Text style={editorButtonText}>Pick from gallery</Text>
            </Pressable>
            <Pressable onPress={onUseCamera} style={[editorButton, { flex: 1 }]}>
              <Text style={editorButtonText}>Use camera</Text>
            </Pressable>
          </View>
        )}

        {statusText ? (
          <Text style={{ color: isAiRunning ? "#4b5563" : "#666", fontSize: 13 }}>
            {statusText}
          </Text>
        ) : null}

        {showPendingNote ? (
          <Text style={{ color: "#666", fontSize: 13 }}>
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
          backgroundColor="#111"
          edges={["top", "bottom"]}
          minTopPadding={14}
          minBottomPadding={10}
        >
        <View style={{ flex: 1, backgroundColor: "#111" }}>
          <View
            style={{
              height: 72,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottomWidth: 1,
              borderBottomColor: "rgba(255,255,255,0.08)",
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
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800" }}>Cancel</Text>
            </Pressable>
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>Refine Cutout</Text>
            <Pressable
              onPress={() => {
                setActiveModalPreview("cutout");
                setIsModalVisible(false);
              }}
              hitSlop={10}
              style={{ minHeight: 40, justifyContent: "center" }}
            >
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800" }}>Apply</Text>
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
                  overflow: "hidden",
                  backgroundColor: "#f8f8f8",
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
              backgroundColor: "#fff",
              gap: 10,
            }}
          >
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {cleanedPreviewUri ? (
                <Pressable
                  onPress={() => setActiveModalPreview("cutout")}
                  style={[
                    editorButton,
                    activeModalPreview === "cutout" ? activePreviewButton : null,
                  ]}
                >
                  <Text style={editorButtonText}>Show cutout</Text>
                </Pressable>
              ) : null}
              {onAdjust ? (
                <Pressable onPress={onAdjust} style={editorButton}>
                  <Text style={editorButtonText}>Adjust</Text>
                </Pressable>
              ) : null}
              {maskDebugUri ? (
                <Pressable
                  onPress={() => setActiveModalPreview("mask")}
                  style={[
                    editorButton,
                    activeModalPreview === "mask" ? activePreviewButton : null,
                  ]}
                >
                  <Text style={editorButtonText}>Show mask</Text>
                </Pressable>
              ) : null}
              {onRotate ? (
                <Pressable onPress={onRotate} style={editorButton}>
                  <Text style={editorButtonText}>Rotate</Text>
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
                    borderColor: "#ececec",
                    backgroundColor: "#fafafa",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ color: "#111", fontSize: 13, fontWeight: "800" }}>
                      Edge polish
                    </Text>
                    <Text style={{ color: "#666", fontSize: 13, fontVariant: ["tabular-nums"] }}>
                      {formatDebugValue(edgePolish, 2)}
                    </Text>
                  </View>
                  <Text style={{ color: "#666", fontSize: 12 }}>
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
                    borderColor: "#ececec",
                    backgroundColor: "#fafafa",
                  }}
                >
                  <View style={{ gap: 2 }}>
                    <Text style={{ color: "#111", fontSize: 13, fontWeight: "800" }}>
                      Debug tuning
                    </Text>
                    <Text style={{ color: "#666", fontSize: 12 }}>
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
                <Text style={{ color: "#666", fontSize: 12 }}>
                  Drag to remove leftover background. Release for final quality.
                </Text>
              </>
            ) : (
              <Text style={{ color: "#666", fontSize: 12 }}>
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
  paddingVertical: 10,
  paddingHorizontal: 14,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: "#ddd",
  backgroundColor: "#fff",
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

const activePreviewButton = {
  borderColor: "#111",
  backgroundColor: "#f3f4f6",
};

const editorButtonText = {
  color: "#111",
  fontWeight: "700" as const,
};

const stepperButton = {
  width: 38,
  height: 38,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: "#ddd",
  backgroundColor: "#fff",
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

const stepperButtonText = {
  color: "#111",
  fontSize: 18,
  fontWeight: "800" as const,
};
