import type {
  AIMessage,
  ChatAttachment,
} from "@/src/components/ai/chatTypes";
import { summarizeChatTitle, type AIChatThread } from "@/src/lib/aiChats";
import type { AuraLook } from "@/src/types/aura";
import {
  classifyAuraStylingIntent,
  shouldGenerateOutfitForMessage,
  type AuraIntentResult,
} from "@/shared/auraStylingIntelligence";

const MULTI_OUTFIT_REQUEST_RE =
  /\b((?:2|3|4|two|three|four)\s+(?:more\s+)?(?:outfits?|looks?|options?|directions?)|multiple\s+(?:outfits?|looks?|options?)|few\s+outfits?)\b/i;
const OUTFIT_REFINEMENT_RE =
  /\b(with|without|more|less|make|push|improve|refine|polish|complete|finish|better|safer|balanced|bold|dressier|casual|formal|streetwear|jackets?|outerwear|bags?|glasses|watch|accessor(?:y|ies)|heels?|boots?|sneakers?|loafers?|shoes?|footwear)\b/i;
const SINGLE_OUTFIT_REQUEST_RE =
  /\b(?:give|build|make|create|pull|put together|plan|style|dress|suggest|recommend|complete|finish)\s+(?:me\s+)?(?:(?:an?|one|my|the)\s+)?(?:[\w'-]+\s+){0,6}(?:outfit|look|fit)\b|\b(?:suggest|recommend)\s+(?:an?|one|some)?\s*(?:outfit|look|fit)\b|\b(?:outfit|look|fit)\s+for\s+(?:today|tonight|tomorrow|date|school|work|rave|vacation|college|class|dinner|party)\b|\bbuild\s+(?:me\s+)?(?:from|with|using)\s+(?:my\s+)?(?:closet|wardrobe)\b|\bstyle me (?:today|now)\b|\bwhat should i wear(?: today| tonight| tomorrow)?\b/i;
const OUTFIT_DIVERSITY_FOLLOWUP_RE =
  /\b(try again|give me one more|one more|another one|another outfit|another look|different outfit|different look|something different|show me another|show me one more|better|i need better|make it better|not this|no not this|something else|new one|different)\b/i;
const CONCRETE_OUTFIT_REFINEMENT_RE =
  /\b(better|i need better|make it better|another one|another outfit|another look|not this|no not this|something else|new one|different outfit|different look|something different)\b/i;
const MORE_OUTFIT_REQUEST_RE =
  /\b(?:show me\s+|give me\s+|make\s+|create\s+|build\s+)?(?:2|3|4|two|three|four)\s+more\s+(?:outfits?|looks?|options?|directions?)\b/i;
const STYLE_EXISTING_RE =
  /\b(?:how\s+(?:should|do|would|can)\s+i\s+(?:style|wear|pull off)|how\s+to\s+(?:style|wear)|what\s+should\s+i\s+do\s+with|what\s+would\s+you\s+do\s+with)\b.*\b(?:this|it|that|outfit|look)\b|\b(?:style|wear)\s+(?:this|it|that|the\s+(?:outfit|look))\b/i;
const MODIFY_EXISTING_RE =
  /\b(?:make|fix|turn|push|adjust|change|tweak|dress|improve|refine|polish|complete|finish)\b(?:\s+\S+){0,10}\s+\b(?:better|dressier|more\s+formal|more\s+casual|casual|formal|streetwear|bolder|bold|safer|balanced|cleaner|sharper|warmer|cooler|date\s+night|office|work)\b|\b(?:complete|finish|improve|refine|polish|fix)\s+(?:this|it|that|the)?\s*(?:outfit|look|fit)\b|\b(?:swap|replace|remove|add)\b(?:\s+\S+){0,8}\b(?:piece|item|top|bottom|shoes?|jacket|outerwear|accessor(?:y|ies))\b/i;
const STYLE_THIS_ITEM_RE =
  /\b(?:style|wear|complete|finish)\s+(?:this|it|that)(?:\s+(?:item|piece|shirt|top|bottom|pants|jeans|shoes?|sneakers?|jacket|coat|hoodie|look|outfit|fit))?\b|\b(?:build|make|create)\b(?:\s+\S+){0,8}\b(?:around|with)\s+(?:this|it|that)\b/i;

export type AuraChatIntent =
  | "GENERATE_OUTFIT"
  | "GENERATE_MORE"
  | "STYLE_EXISTING"
  | "MODIFY_OUTFIT"
  | "GENERAL_CHAT";

export type AuraStructuredChatIntent = AuraIntentResult;

export type AuraOutfitDiversityContext = {
  shouldAvoidRepeats: boolean;
  reason: "followup" | "multi_look" | "none";
  recentItemIds: string[];
  previousLookItemIds: string[];
  excludedItemIds: string[];
  previousLookSignatures: string[];
  maxOverlap: number;
};

export function createMessageId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

let localMessageSequence = 0;

export function nextLocalMessageSequence() {
  localMessageSequence += 1;
  return localMessageSequence;
}

export function createUserMessage(text: string): AIMessage {
  const createdAt = Date.now();
  return {
    id: createMessageId(),
    type: "user",
    kind: "user_text",
    text,
    createdAt,
    clientCreatedAt: createdAt,
    localSequence: nextLocalMessageSequence(),
  };
}

export function createUserMessageWithAttachments(text: string, attachments: ChatAttachment[]): AIMessage {
  return {
    ...createUserMessage(text),
    attachments,
  };
}

export function createStreamingAssistantMessage(
  id: string,
  createdAt: number,
  replyToMessageId: string,
  localSequence: number,
): AIMessage {
  return {
    id,
    type: "assistant",
    kind: "aura_text",
    text: "",
    streaming: true,
    createdAt,
    clientCreatedAt: createdAt,
    localSequence,
    replyToMessageId,
  };
}

export function createSystemMessage(text: string): AIMessage {
  const createdAt = Date.now();
  return {
    id: createMessageId(),
    type: "system/action",
    kind: "system",
    text,
    createdAt,
    clientCreatedAt: createdAt,
    localSequence: nextLocalMessageSequence(),
  };
}

export function createLocalAttachmentId() {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function updateMessageById(
  messages: AIMessage[],
  messageId: string,
  updater: (message: AIMessage) => AIMessage
) {
  const index = messages.findIndex((entry) => entry.id === messageId);
  if (index < 0) return messages;
  const updatedMessage = updater(messages[index]);
  if (updatedMessage === messages[index]) return messages;
  const next = messages.slice();
  next[index] = updatedMessage;
  return next;
}

export function appendUniqueSystemMessage(
  messages: AIMessage[],
  text: string,
  removeMessageId?: string
) {
  const withoutRemoved = removeMessageId
    ? messages.filter((entry) => entry.id !== removeMessageId)
    : messages;
  const alreadyExists = withoutRemoved.some(
    (entry) => entry.type === "system/action" && entry.text === text
  );
  if (alreadyExists) return withoutRemoved;
  return [...withoutRemoved, createSystemMessage(text)];
}

export function buildChatSeedText(prompt: string, attachments: ChatAttachment[]) {
  if (prompt.trim()) return prompt.trim();
  if (attachments.some((attachment) => attachment.type === "image")) {
    return "Analyze this outfit photo";
  }
  if (attachments.some((attachment) => attachment.type === "audio")) {
    return "Voice styling request";
  }
  return "New stylist chat";
}

export function buildShareTranscript(thread: AIChatThread, messages: AIMessage[]) {
  const lines = messages
    .filter((entry) => entry.type === "user" || entry.type === "assistant")
    .slice(-12)
    .map((entry) => {
      const speaker = entry.type === "user" ? "You" : "AURA";
      const body =
        String(entry.assistantIntroText ?? entry.text ?? "").trim() ||
        (entry.aura?.lookOptions?.length
          ? `${entry.aura.lookOptions.length} outfit options`
          : entry.aura?.look
            ? entry.aura.look.lookTitle
            : entry.outfits?.length
              ? `${entry.outfits.length} outfit suggestions`
              : "");
      return body ? `${speaker}: ${body}` : null;
    })
    .filter(Boolean);

  return [`${summarizeChatTitle({ userText: thread.title, assistantText: thread.lastMessagePreview })}`, "", ...lines].join("\n");
}

export function requestedOutfitCount(prompt: string) {
  const normalized = prompt.toLowerCase();
  if (/\b(4|four)\s+(?:outfits?|looks?|options?|directions?)\b/.test(normalized)) return 4;
  if (/\b(3|three)\s+(?:outfits?|looks?|options?|directions?)\b/.test(normalized)) return 3;
  if (/\b(2|two)\s+(?:outfits?|looks?|options?|directions?)\b/.test(normalized)) return 2;
  if (/\b(4|four)\s+more\s+(?:outfits?|looks?|options?|directions?)\b/.test(normalized)) return 4;
  if (/\b(3|three)\s+more\s+(?:outfits?|looks?|options?|directions?)\b/.test(normalized)) return 3;
  if (/\b(2|two)\s+more\s+(?:outfits?|looks?|options?|directions?)\b/.test(normalized)) return 2;
  return 3;
}

export function explicitRequestedOutfitCount(prompt: string) {
  const normalized = String(prompt ?? "").toLowerCase();
  if (/\b(4|four)\s+(?:outfits?|looks?|options?|directions?)\b/.test(normalized)) return 4;
  if (/\b(3|three)\s+(?:outfits?|looks?|options?|directions?)\b/.test(normalized)) return 3;
  if (/\b(2|two)\s+(?:outfits?|looks?|options?|directions?)\b/.test(normalized)) return 2;
  if (/\b(4|four)\s+more\s+(?:outfits?|looks?|options?|directions?)\b/.test(normalized)) return 4;
  if (/\b(3|three)\s+more\s+(?:outfits?|looks?|options?|directions?)\b/.test(normalized)) return 3;
  if (/\b(2|two)\s+more\s+(?:outfits?|looks?|options?|directions?)\b/.test(normalized)) return 2;
  if (/\bmultiple\s+(?:outfits?|looks?|options?)\b/.test(normalized)) return 3;
  if (/\bmore\s+options\b/.test(normalized)) return 3;
  if (/\bfew\s+outfits?\b/.test(normalized)) return 3;
  return null;
}

export function latestAuraLookCount(messages: AIMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const count = message.aura?.lookOptions?.length ?? (message.aura?.look ? 1 : 0);
    if (count > 0) return count;
  }
  return 0;
}

export function latestAuraLook(messages: AIMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.type !== "assistant") continue;
    if (message.aura?.look && itemIdsForLook(message.aura.look).length > 0) {
      return message.aura.look;
    }
    const option = message.aura?.lookOptions?.find((look) => itemIdsForLook(look).length > 0);
    if (option) return option;
  }
  return null;
}

export function classifyAuraChatIntent(
  prompt: string,
  options?: { attachmentCount?: number; hasPreviousLook?: boolean; hasRecentItemAnchor?: boolean },
): AuraChatIntent {
  const normalized = String(prompt ?? "").trim();
  if (!normalized) return "GENERAL_CHAT";
  const intelligence = classifyAuraStylingIntent(normalized, {
    hasPreviousOutfit: !!options?.hasPreviousLook || !!options?.hasRecentItemAnchor,
  });
  if (shouldGenerateOutfitForMessage(intelligence, { hasPreviousOutfit: !!options?.hasPreviousLook })) {
    if (intelligence.intent === "outfit_iteration") return "GENERATE_MORE";
    if (
      intelligence.intent === "outfit_feedback" ||
      intelligence.intent === "occasion_change" ||
      intelligence.intent === "vibe_shift" ||
      intelligence.intent === "replace_piece" ||
      intelligence.intent === "improve_fit"
    ) {
      return "MODIFY_OUTFIT";
    }
    return "GENERATE_OUTFIT";
  }
  if (isAuraOutfitDiversityFollowup(normalized) || MORE_OUTFIT_REQUEST_RE.test(normalized)) {
    return "GENERATE_MORE";
  }
  if (options?.hasRecentItemAnchor && STYLE_THIS_ITEM_RE.test(normalized)) {
    return "GENERATE_OUTFIT";
  }
  if (STYLE_EXISTING_RE.test(normalized)) return "STYLE_EXISTING";
  if (MODIFY_EXISTING_RE.test(normalized)) return "MODIFY_OUTFIT";
  if (MULTI_OUTFIT_REQUEST_RE.test(normalized) || SINGLE_OUTFIT_REQUEST_RE.test(normalized)) {
    return "GENERATE_OUTFIT";
  }
  if (options?.hasPreviousLook && OUTFIT_REFINEMENT_RE.test(normalized)) {
    return "MODIFY_OUTFIT";
  }
  return "GENERAL_CHAT";
}

function uniqueStrings(values: (string | null | undefined)[], max = 24) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const next = String(value ?? "").trim();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
    if (out.length >= max) break;
  }
  return out;
}

function itemIdsForLook(look?: AuraLook | null) {
  return uniqueStrings(
    (look?.pieces ?? [])
      .filter((piece) => piece.source === "closet")
      .map((piece) => piece.itemId),
    8,
  );
}

function signatureForItemIds(itemIds: string[]) {
  return uniqueStrings(itemIds, 12).sort().join("|");
}

function looksFromMessage(message: AIMessage): AuraLook[] {
  const looks: AuraLook[] = [];
  if (message.aura?.look) looks.push(message.aura.look);
  if (message.aura?.lookOptions?.length) looks.push(...message.aura.lookOptions);
  return looks.filter((look) => itemIdsForLook(look).length > 0);
}

export function isAuraOutfitDiversityFollowup(prompt: string) {
  return OUTFIT_DIVERSITY_FOLLOWUP_RE.test(String(prompt ?? ""));
}

export function isConcreteOutfitRefinementRequest(prompt: string) {
  return CONCRETE_OUTFIT_REFINEMENT_RE.test(String(prompt ?? ""));
}

export function buildAuraOutfitDiversityContext(
  prompt: string,
  messages: AIMessage[],
  options?: { multiLook?: boolean },
): AuraOutfitDiversityContext {
  const recentLooks = messages
    .filter((message) => message.type === "assistant")
    .flatMap(looksFromMessage)
    .slice(-6);
  const previousLook = recentLooks[recentLooks.length - 1] ?? null;
  const previousLookItemIds = itemIdsForLook(previousLook);
  const recentItemIds = uniqueStrings(recentLooks.flatMap(itemIdsForLook), 36);
  const previousLookSignatures = uniqueStrings(
    recentLooks
      .map((look) => signatureForItemIds(itemIdsForLook(look)))
      .filter(Boolean),
    12,
  );
  const isFollowup = isAuraOutfitDiversityFollowup(prompt);
  const isMultiLook = !!options?.multiLook;
  const shouldAvoidRepeats = (isFollowup || isMultiLook) && previousLookItemIds.length > 0;
  return {
    shouldAvoidRepeats,
    reason: shouldAvoidRepeats ? (isFollowup ? "followup" : "multi_look") : "none",
    recentItemIds,
    previousLookItemIds,
    excludedItemIds: shouldAvoidRepeats ? previousLookItemIds : [],
    previousLookSignatures,
    maxOverlap: isFollowup ? 1 : 2,
  };
}

export function previousUserPrompt(messages: AIMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.type !== "user") continue;
    const text = String(message.text ?? "").trim();
    if (text) return text;
  }
  return "";
}

export function buildStructuredOutfitBatchPrompt(prompt: string, messages: AIMessage[]) {
  const current = String(prompt ?? "").trim();
  if (!current) return current;
  if (MULTI_OUTFIT_REQUEST_RE.test(current)) return current;
  if (!OUTFIT_REFINEMENT_RE.test(current)) return current;
  const prior = previousUserPrompt(messages);
  if (!prior || prior === current) {
    return `Give me ${requestedOutfitCount(current)} outfits. ${current}`;
  }
  return `${prior}. Refine those outfit options: ${current}`;
}

export function wantsStructuredOutfitBatch(
  prompt: string,
  attachmentCount: number,
  messages: AIMessage[],
  options?: { hasRecentItemAnchor?: boolean },
) {
  if (attachmentCount !== 0) return false;
  const intent = classifyAuraChatIntent(prompt, {
    hasPreviousLook: latestAuraLookCount(messages) > 0,
    hasRecentItemAnchor: options?.hasRecentItemAnchor,
  });
  if (intent === "STYLE_EXISTING" || intent === "MODIFY_OUTFIT" || intent === "GENERAL_CHAT") return false;
  if (MULTI_OUTFIT_REQUEST_RE.test(prompt)) return true;
  return false;
}

export function wantsStructuredOutfitRequest(
  prompt: string,
  attachmentCount: number,
  messages: AIMessage[],
  options?: { hasRecentItemAnchor?: boolean },
) {
  if (attachmentCount !== 0) return false;
  const normalized = String(prompt ?? "").trim();
  if (!normalized) return false;
  const intelligence = classifyAuraStylingIntent(normalized, {
    hasPreviousOutfit: latestAuraLookCount(messages) > 0 || !!options?.hasRecentItemAnchor,
  });
  if (shouldGenerateOutfitForMessage(intelligence, {
    hasPreviousOutfit: latestAuraLookCount(messages) > 0,
  })) {
    return true;
  }
  const intent = classifyAuraChatIntent(normalized, {
    hasPreviousLook: latestAuraLookCount(messages) > 0,
    hasRecentItemAnchor: options?.hasRecentItemAnchor,
  });
  if (intent === "STYLE_EXISTING" || intent === "MODIFY_OUTFIT" || intent === "GENERAL_CHAT") return false;
  if (isAuraOutfitDiversityFollowup(normalized) && latestAuraLookCount(messages) > 0) return true;
  if (wantsStructuredOutfitBatch(normalized, attachmentCount, messages, options)) return true;
  if (intent === "GENERATE_OUTFIT" && STYLE_THIS_ITEM_RE.test(normalized)) return true;
  return SINGLE_OUTFIT_REQUEST_RE.test(normalized);
}

export function resolveStructuredBatchLookCount(
  prompt: string,
  structuredBatchPrompt: string,
  messages: AIMessage[],
) {
  const explicitCurrentCount = explicitRequestedOutfitCount(prompt);
  if (explicitCurrentCount) return explicitCurrentCount;

  const explicitStructuredCount = explicitRequestedOutfitCount(structuredBatchPrompt);
  if (explicitStructuredCount) return explicitStructuredCount;

  const latestLookCount = latestAuraLookCount(messages);
  if (latestLookCount > 0) return latestLookCount;

  return requestedOutfitCount(structuredBatchPrompt || prompt);
}
