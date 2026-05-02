import type {
  AIMessage,
  ChatAttachment,
} from "@/src/components/ai/chatTypes";
import { summarizeChatTitle, type AIChatThread } from "@/src/lib/aiChats";

const MULTI_OUTFIT_REQUEST_RE =
  /\b((?:2|3|4|two|three|four)\s+(?:outfits?|looks?|options?|directions?)|multiple\s+(?:outfits?|looks?|options?)|few\s+outfits?)\b/i;
const OUTFIT_REFINEMENT_RE =
  /\b(with|without|more|less|make|push|safer|balanced|bold|dressier|casual|formal|streetwear|jackets?|outerwear|bags?|glasses|watch|accessor(?:y|ies)|heels?|boots?|sneakers?|loafers?)\b/i;

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
  return 3;
}

export function explicitRequestedOutfitCount(prompt: string) {
  const normalized = String(prompt ?? "").toLowerCase();
  if (/\b(4|four)\s+(?:outfits?|looks?|options?|directions?)\b/.test(normalized)) return 4;
  if (/\b(3|three)\s+(?:outfits?|looks?|options?|directions?)\b/.test(normalized)) return 3;
  if (/\b(2|two)\s+(?:outfits?|looks?|options?|directions?)\b/.test(normalized)) return 2;
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
) {
  if (attachmentCount !== 0) return false;
  if (MULTI_OUTFIT_REQUEST_RE.test(prompt)) return true;
  return latestAuraLookCount(messages) > 0 && OUTFIT_REFINEMENT_RE.test(prompt);
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
