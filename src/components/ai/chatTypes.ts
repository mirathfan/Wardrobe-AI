import type { AuraResponse } from "@/src/types/aura";

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
  streaming?: boolean;
  outfits?: ChatOutfit[];
  aura?: AuraResponse;
  createdAt: number;
};
