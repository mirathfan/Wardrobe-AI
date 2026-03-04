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
  Text,
  View,
  useWindowDimensions,
} from "react-native";

type PhotoEditorSectionProps = {
  previewUri: string | null;
  refineValue: number;
  isProcessing: boolean;
  canRefine: boolean;
  showPendingNote: boolean;
  onPickLibrary: () => void;
  onUseCamera: () => void;
  onRemove: () => void;
  onRefineChange: (value: number) => void;
  onRefineComplete: (value: number) => void;
  onResetRefine: () => void;
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
            tapToSeek={Platform.OS === "ios"}
            thumbImage={Platform.OS === "ios" ? sliderThumbImage : undefined}
            thumbTintColor={Platform.OS === "ios" ? undefined : "#111"}
          />
        </NativeGuard>
      </View>
    </View>
  );
}

function PreviewCanvas(props: { uri: string; large?: boolean; showAlphaBg: boolean }) {
  const { uri, large = false, showAlphaBg } = props;

  return (
    <View
      style={{
        width: "100%",
        aspectRatio: large ? 4 / 5 : 1,
        borderRadius: large ? 20 : 16,
        borderWidth: 1,
        borderColor: "#e7e7e7",
        backgroundColor: showAlphaBg ? "#ff4d4f" : "#fff",
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Image
        source={{ uri }}
        style={{ width: "100%", height: "100%" }}
        resizeMode="contain"
      />
    </View>
  );
}

export function PhotoEditorSection(props: PhotoEditorSectionProps) {
  const {
    previewUri,
    refineValue,
    isProcessing,
    canRefine,
    showPendingNote,
    onPickLibrary,
    onUseCamera,
    onRemove,
    onRefineChange,
    onRefineComplete,
    onResetRefine,
    onReplace,
    onRotate,
    onAdjust,
    onRefineOpen,
  } = props;
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [sliderErrored, setSliderErrored] = useState(false);
  const [showAlphaBg, setShowAlphaBg] = useState(false);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  useEffect(() => {
    if (__DEV__) {
      console.log("[PhotoEditorSection] Slider typeof:", typeof Slider);
    }
  }, []);

  const useNativeSlider = Platform.OS === "ios" && !sliderErrored;

  function handleNativeSliderError() {
    if (__DEV__) {
      console.log("[PhotoEditorSection] NativeGuard caught slider render error");
    }
    setSliderErrored(true);
  }

  return (
    <>
      <View
        style={{
          gap: 14,
          padding: 14,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: "#ebebeb",
          backgroundColor: "#fafafa",
        }}
      >
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 18, fontWeight: "800", color: "#111" }}>Photo Edit</Text>
          <Text style={{ color: "#666", lineHeight: 20 }}>
            Refine the background removal here, then continue filling out the item details.
          </Text>
        </View>

        {previewUri ? (
          <Pressable onPress={() => setIsModalVisible(true)}>
            <PreviewCanvas uri={previewUri} large showAlphaBg={showAlphaBg} />
          </Pressable>
        ) : (
          <View
            style={{
              width: "100%",
              aspectRatio: 1,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: "#e7e7e7",
              backgroundColor: "#f3f3f3",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 24,
            }}
          >
            <Text style={{ color: "#666", fontWeight: "700", textAlign: "center" }}>
              Pick a photo to start editing the cutout.
            </Text>
          </View>
        )}

        {previewUri ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => {
                onRefineOpen?.();
                setIsModalVisible(true);
              }}
              style={[editorButton, { flex: 1 }]}
            >
              <Text style={editorButtonText}>Refine</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onAdjust?.();
                setIsModalVisible(true);
              }}
              style={[editorButton, { flex: 1 }]}
            >
              <Text style={editorButtonText}>Adjust</Text>
            </Pressable>
            <Pressable onPress={onRotate} style={[editorButton, { flex: 1 }]}>
              <Text style={editorButtonText}>Rotate</Text>
            </Pressable>
            <Pressable
              onPress={onReplace ?? onPickLibrary}
              style={[editorButton, { flex: 1 }]}
            >
              <Text style={editorButtonText}>Replace</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable onPress={onPickLibrary} style={[editorButton, { flex: 1 }]}>
            <Text style={editorButtonText}>{previewUri ? "Change photo" : "Pick from gallery"}</Text>
          </Pressable>
          <Pressable onPress={onUseCamera} style={[editorButton, { flex: 1 }]}>
            <Text style={editorButtonText}>Use camera</Text>
          </Pressable>
          {previewUri ? (
            <Pressable onPress={onRemove} style={editorButton}>
              <Text style={editorButtonText}>Remove</Text>
            </Pressable>
          ) : null}
        </View>

        {showPendingNote ? (
          <Text style={{ color: "#666" }}>
            New photo selected. It will upload to Firebase Storage when you save.
          </Text>
        ) : null}

        {previewUri ? (
          <Pressable
            onPress={() => setShowAlphaBg((prev) => !prev)}
            style={{
              alignSelf: "flex-start",
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "#ddd",
              backgroundColor: "#fff",
            }}
          >
            <Text style={{ color: "#111", fontWeight: "700" }}>
              {showAlphaBg ? "Hide alpha background" : "Show alpha background"}
            </Text>
          </Pressable>
        ) : null}

        {canRefine ? (
          <View style={{ gap: 8 }}>
            <RefineControls
              value={refineValue}
              isProcessing={isProcessing}
              useNativeSlider={useNativeSlider}
              onNativeError={handleNativeSliderError}
              onChange={onRefineChange}
              onComplete={onRefineComplete}
              onReset={onResetRefine}
            />
            <Text style={{ color: "#666", fontSize: 12 }}>
              Drag to remove leftover background. Release for final quality.
            </Text>
          </View>
        ) : null}
      </View>

      <Modal
        visible={isModalVisible && !!previewUri}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: "#111" }}>
          <View
            style={{
              paddingTop: 18,
              paddingHorizontal: 16,
              paddingBottom: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>Edit Photo</Text>
            <Pressable onPress={() => setIsModalVisible(false)}>
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800" }}>Done</Text>
            </Pressable>
          </View>

          {previewUri ? (
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
                  backgroundColor: showAlphaBg ? "#ff4d4f" : "#fff",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Image
                  source={{ uri: previewUri }}
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
            {canRefine ? (
              <>
                <RefineControls
                  value={refineValue}
                  isProcessing={isProcessing}
                  useNativeSlider={useNativeSlider}
                  onNativeError={handleNativeSliderError}
                  onChange={onRefineChange}
                  onComplete={onRefineComplete}
                  onReset={onResetRefine}
                />
                <Text style={{ color: "#666", fontSize: 12 }}>
                  Drag to remove leftover background. Release for final quality.
                </Text>
              </>
            ) : null}
            <Pressable
              onPress={() => setIsModalVisible(false)}
              style={{
                marginTop: 4,
                paddingVertical: 14,
                borderRadius: 14,
                backgroundColor: "#111",
              }}
            >
              <Text style={{ textAlign: "center", color: "#fff", fontWeight: "800" }}>
                Done
              </Text>
            </Pressable>
          </View>
        </View>
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
