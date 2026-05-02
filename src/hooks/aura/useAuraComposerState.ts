import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import React, { useRef, useState } from "react";
import { Alert } from "react-native";

import type {
  ChatAttachment,
  ChatAttachmentGroupRole,
  ChatImageAttachment,
} from "@/src/components/ai/chatTypes";
import { transcribeAuraAudio } from "@/src/lib/aura";
import {
  uploadAuraTranscriptionAudio,
} from "@/src/lib/auraAttachments";
import { createLocalAttachmentId } from "@/src/lib/auraChatHelpers";

type OptionalAudioRecorder = {
  uri: string | null;
  prepareToRecordAsync: () => Promise<void>;
  record: () => void;
  stop: () => Promise<void>;
};

type UseAuraComposerStateOptions = {
  uid: string | null;
};

export function useAuraComposerState({ uid }: UseAuraComposerStateOptions) {
  const [message, setMessage] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentRole, setAttachmentRole] = useState<ChatAttachmentGroupRole>("reference");
  const [recordingAudio, setRecordingAudio] = useState(false);
  const audioRecorderRef = useRef<OptionalAudioRecorder | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);

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

  const handleMicPress = React.useCallback(async () => {
    if (!uid) return;
    try {
      if (recordingAudio && audioRecorderRef.current) {
        const recorder = audioRecorderRef.current;
        await recorder.stop();
        const uri = recorder.uri;
        const startedAt = recordingStartedAtRef.current;
        audioRecorderRef.current = null;
        recordingStartedAtRef.current = null;
        setRecordingAudio(false);
        if (!uri) return;
        const durationMs = startedAt ? Date.now() - startedAt : null;
        try {
          const uploaded = await uploadAuraTranscriptionAudio(uid, {
            id: createLocalAttachmentId(),
            uri,
            localUri: uri,
            mimeType: "audio/mp4",
            durationMs,
          });
          const transcript = await transcribeAuraAudio(uploaded);
          if (transcript) {
            setMessage((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
          } else {
            Alert.alert("Voice", "I couldn't hear any words in that recording.");
          }
        } finally {
          void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
        }
        return;
      }

      const audio = await import("expo-audio").catch(() => null);
      if (!audio) {
        Alert.alert("Voice", "Voice input needs the latest native build. Image and text chat still work.");
        return;
      }

      const permission = await audio.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Voice", "Please allow microphone access to dictate a message.");
        return;
      }
      const recorder = new audio.AudioRecorder(audio.RecordingPresets.LOW_QUALITY);
      await recorder.prepareToRecordAsync();
      recorder.record();
      audioRecorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      setRecordingAudio(true);
    } catch (error: any) {
      audioRecorderRef.current = null;
      recordingStartedAtRef.current = null;
      setRecordingAudio(false);
      const messageText = String(error?.message ?? "");
      Alert.alert(
        "Voice",
        messageText.includes("ExpoAudio")
          ? "Voice input needs the latest native build. Image and text chat still work."
          : messageText || "Unable to transcribe right now."
      );
    }
  }, [recordingAudio, uid]);

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
    message,
    pendingAttachments,
    recordingAudio,
    setMessage,
    setPendingAttachments,
  };
}
