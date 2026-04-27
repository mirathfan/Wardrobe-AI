import type { AuraResponse } from "@/src/types/aura";

export type ChatAttachmentGroupRole = "same_item" | "separate_items" | "reference";

export type ChatImageAttachment = {
  id: string;
  type: "image";
  uri: string;
  localUri?: string | null;
  groupId?: string | null;
  role?: ChatAttachmentGroupRole;
  width?: number | null;
  height?: number | null;
};

export type ChatAudioAttachment = {
  id: string;
  type: "audio";
  uri: string;
  localUri?: string | null;
  durationMs?: number | null;
  transcript?: string | null;
};

export type ChatAttachment = ChatImageAttachment | ChatAudioAttachment;

export type ChatOutfit = {
  id: string;
  picks: { slot: string; itemId: string }[];
  score: number;
  reason: string;
};

export type AIMessage = {
  id: string;
  type: "user" | "assistant" | "outfit" | "system/action";
  kind?: "user_text" | "aura_text" | "aura_card" | "system";
  text?: string;
  assistantIntroText?: string;
  attachments?: ChatAttachment[];
  streaming?: boolean;
  outfits?: ChatOutfit[];
  aura?: AuraResponse;
  createdAt: number;
};
