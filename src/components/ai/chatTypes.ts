import type { AuraResponse } from "@/src/types/aura";
import type { AuraAgentOutfitActionState, AuraAgentResponse } from "@/src/types/auraAgent";

export type ChatAttachmentGroupRole = "same_item" | "separate_items" | "reference";

export type ChatImageAttachment = {
  id: string;
  type: "image";
  uri: string;
  localUri?: string | null;
  traceId?: string | null;
  mimeType?: string | null;
  storagePath?: string | null;
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
  mimeType?: string | null;
  storagePath?: string | null;
  durationMs?: number | null;
  transcript?: string | null;
};

export type ChatAttachment = ChatImageAttachment | ChatAudioAttachment;

export type ChatMessageActionAnchor = {
  pageX: number;
  pageY: number;
  width?: number;
  height?: number;
};

export type ChatOutfit = {
  id: string;
  picks: { slot: string; itemId: string }[];
  score: number;
  reason: string;
};

export type AIMessage = {
  id: string;
  type: "user" | "assistant" | "outfit" | "system/action";
  kind?: "user_text" | "aura_text" | "aura_card" | "aura_agent" | "system";
  text?: string;
  requiredItemIds?: string[];
  assistantIntroText?: string;
  attachments?: ChatAttachment[];
  streaming?: boolean;
  outfits?: ChatOutfit[];
  aura?: AuraResponse;
  agentResponse?: AuraAgentResponse;
  agentActionStates?: Record<string, AuraAgentOutfitActionState>;
  debugSource?: "cached";
  createdAt: number;
  clientCreatedAt?: number;
  localSequence?: number;
  replyToMessageId?: string | null;
};
