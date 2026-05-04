import type {
  SpeechErrorEvent,
  SpeechResultsEvent,
} from "@react-native-voice/voice";
import * as ImagePicker from "expo-image-picker";
import React, { useRef, useState } from "react";
import { Alert, NativeModules, PermissionsAndroid, Platform } from "react-native";

import type {
  ChatAttachment,
  ChatAttachmentGroupRole,
  ChatImageAttachment,
} from "@/src/components/ai/chatTypes";
import { createLocalAttachmentId } from "@/src/lib/auraChatHelpers";
import { Toast } from "@/src/lib/toast";

type VoiceRecognizer = typeof import("@react-native-voice/voice").default;

type StopVoiceInputOptions = {
  discardTranscript?: boolean;
};

type UseAuraComposerStateOptions = {
  uid: string | null;
};

const VOICE_LOCALE = "en-US";
const VOICE_UNAVAILABLE_MESSAGE = "Voice input is not available in this build.";
const VOICE_PERMISSION_MESSAGE = "Microphone permission is needed for voice input.";

function ensureNativeVoiceModuleAvailable() {
  if (Platform.OS === "web") return false;
  const nativeModules = NativeModules as unknown as Record<string, unknown>;
  if (!nativeModules.Voice && nativeModules.RCTVoice) {
    nativeModules.Voice = nativeModules.RCTVoice;
  }
  return !!nativeModules.Voice;
}

function getSpeechTranscript(event: SpeechResultsEvent) {
  return event.value?.find((value) => value.trim().length > 0)?.trim() ?? "";
}

function getVoiceErrorText(error: unknown) {
  if (typeof error === "string") return error;
  const candidate = error as {
    message?: unknown;
    error?: {
      message?: unknown;
    };
  };
  return String(candidate?.error?.message ?? candidate?.message ?? "");
}

function getVoiceErrorCode(error: unknown) {
  const candidate = error as {
    error?: {
      code?: unknown;
    };
  };
  return String(candidate?.error?.code ?? "");
}

function isPermissionVoiceError(error: unknown) {
  const code = getVoiceErrorCode(error);
  const text = getVoiceErrorText(error).toLowerCase();
  return (
    code === "9" ||
    text.includes("permission") ||
    text.includes("denied") ||
    text.includes("not authorized") ||
    text.includes("authorization") ||
    text.includes("microphone") ||
    text.includes("record_audio") ||
    text.includes("insufficient")
  );
}

function isNoSpeechVoiceError(error: unknown) {
  const code = getVoiceErrorCode(error);
  const text = getVoiceErrorText(error).toLowerCase();
  return (
    code === "6" ||
    code === "7" ||
    text.includes("no match") ||
    text.includes("no speech") ||
    text.includes("speech timeout")
  );
}

function isUnavailableVoiceError(error: unknown) {
  const text = getVoiceErrorText(error).toLowerCase();
  return (
    text.includes("not available") ||
    text.includes("restricted") ||
    text.includes("speechrecognizer") ||
    text.includes("recognition service")
  );
}

function showFriendlyVoiceError(error: unknown) {
  if (isPermissionVoiceError(error)) {
    Toast.error(VOICE_PERMISSION_MESSAGE);
    return;
  }
  if (isUnavailableVoiceError(error)) {
    Toast.error(VOICE_UNAVAILABLE_MESSAGE);
    return;
  }
  if (isNoSpeechVoiceError(error)) {
    Toast.error("I couldn't hear any words. Try again.");
    return;
  }
  Toast.error("Voice input stopped. Try again.");
}

async function requestAndroidMicrophonePermission() {
  if (Platform.OS !== "android") return true;
  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  const hasPermission = await PermissionsAndroid.check(permission);
  if (hasPermission) return true;
  const result = await PermissionsAndroid.request(permission);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export function useAuraComposerState({ uid: _uid }: UseAuraComposerStateOptions) {
  const [message, setMessage] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentRole, setAttachmentRole] = useState<ChatAttachmentGroupRole>("reference");
  const [recordingAudio, setRecordingAudio] = useState(false);
  const voiceRef = useRef<VoiceRecognizer | null>(null);
  const voiceLoadingRef = useRef<Promise<VoiceRecognizer | null> | null>(null);
  const isListeningRef = useRef(false);
  const mountedRef = useRef(true);
  const manualStopRef = useRef(false);
  const ignoreSpeechResultsRef = useRef(false);
  const dictationBaseTextRef = useRef("");

  const addImageAssets = React.useCallback(
    (assets: ImagePicker.ImagePickerAsset[]) => {
      const groupId = `grp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const next: ChatImageAttachment[] = assets
        .filter((asset) => !!asset.uri)
        .map((asset) => ({
          id: createLocalAttachmentId(),
          type: "image",
          uri: asset.uri,
          localUri: asset.uri,
          mimeType: asset.mimeType ?? null,
          groupId,
          role: attachmentRole,
          width: asset.width ?? null,
          height: asset.height ?? null,
        }));
      if (!next.length) return;
      setPendingAttachments((prev) => [...prev, ...next].slice(0, 8));
    },
    [attachmentRole],
  );

  const handlePickImages = React.useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Photos", "Please allow photo access to attach images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.9,
      exif: false,
    });
    if (result.canceled) return;
    addImageAssets(result.assets ?? []);
  }, [addImageAssets]);

  const handleTakePhoto = React.useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera", "Please allow camera access to attach a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.9,
      exif: false,
    });
    if (result.canceled) return;
    addImageAssets(result.assets ?? []);
  }, [addImageAssets]);

  const setVoiceListening = React.useCallback((nextListening: boolean) => {
    isListeningRef.current = nextListening;
    if (mountedRef.current) {
      setRecordingAudio(nextListening);
    }
  }, []);

  const handleSpeechText = React.useCallback((event: SpeechResultsEvent) => {
    if (ignoreSpeechResultsRef.current) return;
    const transcript = getSpeechTranscript(event);
    if (!transcript || !mountedRef.current) return;
    const baseText = dictationBaseTextRef.current;
    setMessage(baseText ? `${baseText} ${transcript}` : transcript);
  }, []);

  const handleSpeechError = React.useCallback(
    (event: SpeechErrorEvent) => {
      setVoiceListening(false);
      if (manualStopRef.current) return;
      showFriendlyVoiceError(event);
    },
    [setVoiceListening],
  );

  const attachVoiceListeners = React.useCallback(
    (voice: VoiceRecognizer) => {
      voice.onSpeechStart = () => {
        setVoiceListening(true);
      };
      voice.onSpeechEnd = () => {
        manualStopRef.current = false;
        setVoiceListening(false);
      };
      voice.onSpeechResults = handleSpeechText;
      voice.onSpeechPartialResults = handleSpeechText;
      voice.onSpeechError = handleSpeechError;
    },
    [handleSpeechError, handleSpeechText, setVoiceListening],
  );

  const loadVoice = React.useCallback(async () => {
    if (!ensureNativeVoiceModuleAvailable()) return null;
    if (voiceRef.current) return voiceRef.current;
    if (!voiceLoadingRef.current) {
      voiceLoadingRef.current = import("@react-native-voice/voice")
        .then((module) => {
          const voice = module.default;
          if (!voice || typeof voice.start !== "function" || typeof voice.stop !== "function") {
            return null;
          }
          if (!mountedRef.current) {
            void voice.destroy?.().catch(() => undefined);
            voice.removeAllListeners?.();
            return null;
          }
          attachVoiceListeners(voice);
          voiceRef.current = voice;
          return voice;
        })
        .catch(() => null)
        .finally(() => {
          voiceLoadingRef.current = null;
        });
    }
    return voiceLoadingRef.current;
  }, [attachVoiceListeners]);

  const stopVoiceInput = React.useCallback(
    async (options?: StopVoiceInputOptions) => {
      const voice = voiceRef.current;
      manualStopRef.current = true;
      if (options?.discardTranscript) {
        ignoreSpeechResultsRef.current = true;
        dictationBaseTextRef.current = "";
      }
      setVoiceListening(false);
      if (!voice || typeof voice.stop !== "function") {
        manualStopRef.current = false;
        return;
      }
      try {
        await voice.stop();
      } catch {
        try {
          await voice.cancel?.();
        } catch {
          // Best effort cleanup only; user-facing errors are handled by speech events.
        }
      } finally {
        setTimeout(() => {
          manualStopRef.current = false;
        }, 500);
      }
    },
    [setVoiceListening],
  );

  const handleMicPress = React.useCallback(async () => {
    try {
      if (recordingAudio || isListeningRef.current) {
        await stopVoiceInput();
        return;
      }

      ignoreSpeechResultsRef.current = false;
      manualStopRef.current = false;
      dictationBaseTextRef.current = message.trim();

      const voice = await loadVoice();
      if (!voice) {
        Toast.error(VOICE_UNAVAILABLE_MESSAGE);
        return;
      }

      const hasMicrophonePermission = await requestAndroidMicrophonePermission();
      if (!hasMicrophonePermission) {
        Toast.error(VOICE_PERMISSION_MESSAGE);
        return;
      }

      if (Platform.OS === "android" && typeof voice.isAvailable === "function") {
        const available = await voice.isAvailable();
        if (!available) {
          Toast.error(VOICE_UNAVAILABLE_MESSAGE);
          return;
        }
      }

      setVoiceListening(true);
      await voice.start(
        VOICE_LOCALE,
        Platform.OS === "android"
          ? {
              EXTRA_LANGUAGE_MODEL: "LANGUAGE_MODEL_FREE_FORM",
              EXTRA_MAX_RESULTS: 5,
              EXTRA_PARTIAL_RESULTS: true,
              REQUEST_PERMISSIONS_AUTO: false,
            }
          : undefined,
      );
    } catch (error: any) {
      setVoiceListening(false);
      showFriendlyVoiceError(error);
    }
  }, [loadVoice, message, recordingAudio, setVoiceListening, stopVoiceInput]);

  React.useEffect(() => {
    return () => {
      mountedRef.current = false;
      ignoreSpeechResultsRef.current = true;
      isListeningRef.current = false;
      const voice = voiceRef.current;
      voiceRef.current = null;
      if (!voice) return;
      const removeListeners = () => {
        try {
          voice.removeAllListeners?.();
        } catch {
          // Listener cleanup should never surface a user-visible error.
        }
      };
      try {
        void voice.destroy?.().catch(() => undefined).finally(removeListeners);
      } catch {
        removeListeners();
      }
    };
  }, []);

  const handleAttachmentRoleChange = React.useCallback((role: ChatAttachmentGroupRole) => {
    setAttachmentRole(role);
    setPendingAttachments((prev) =>
      prev.map((attachment) =>
        attachment.type === "image" ? { ...attachment, role } : attachment
      )
    );
  }, []);

  const handleRemoveAttachment = React.useCallback((id: string) => {
    setPendingAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
  }, []);

  return {
    attachmentRole,
    handleAttachmentRoleChange,
    handleMicPress,
    handlePickImages,
    handleRemoveAttachment,
    handleTakePhoto,
    stopVoiceInput,
    message,
    pendingAttachments,
    recordingAudio,
    setMessage,
    setPendingAttachments,
  };
}
