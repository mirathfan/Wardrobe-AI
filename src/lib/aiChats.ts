import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  setDoc,
  writeBatch,
} from "firebase/firestore";

import { db } from "@/src/lib/firebase";
import { setCachedChatList, setCachedRecentMessages } from "@/src/lib/localCache";
import type { AIMessage, ChatAttachment } from "@/src/components/ai/chatTypes";
import type {
  AuraLook,
  AuraLookAction,
  AuraLookPiece,
  AuraResponse,
  AuraSuggestionItem,
} from "@/src/types/aura";

const DEBUG_AURA_CLIENT =
  __DEV__ && process.env.EXPO_PUBLIC_AURA_DEBUG === "1";

export type AIChatThread = {
  chatId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastMessagePreview: string;
  messageCount: number;
  threadId: string | null;
  pinned: boolean;
  archived: boolean;
  titleEdited: boolean;
};

type ChatTitleSummaryInput = {
  userText?: string | null;
  assistantText?: string | null;
  intent?: string | null;
};

const GENERIC_CHAT_TITLES = new Set([
  "",
  "aura chat",
  "new chat",
  "new stylist chat",
  "image message",
  "link shared",
  "new message",
]);

const PRODUCT_BRAND_RULES: { pattern: RegExp; label: string }[] = [
  { pattern: /\bhm\.com\b|\bh&m\b/i, label: "H&M" },
  { pattern: /\bzara\.com\b|\bzara\b/i, label: "Zara" },
  { pattern: /\bnike\.com\b|\bnike\b/i, label: "Nike" },
  { pattern: /\baritzia\.com\b|\baritzia\b/i, label: "Aritzia" },
  { pattern: /\buniqlo\.com\b|\buniqlo\b/i, label: "Uniqlo" },
  { pattern: /\brevolve\.com\b|\brevolve\b/i, label: "Revolve" },
  { pattern: /\bssense\.com\b|\bssense\b/i, label: "Ssense" },
];

function chatCollectionRef(uid: string) {
  return collection(db, "users", uid, "aiChats");
}

function chatDocRef(uid: string, chatId: string) {
  return doc(db, "users", uid, "aiChats", chatId);
}

function messageCollectionRef(uid: string, chatId: string) {
  return collection(db, "users", uid, "aiChats", chatId, "messages");
}

function sessionContextCollectionRef(uid: string, chatId: string) {
  return collection(db, "users", uid, "aiChats", chatId, "sessionContext");
}

function stripUrls(value: string) {
  return value
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\bwww\.\S+/gi, " ")
    .replace(/\?[^\s]+/g, " ");
}

function normalizeChatText(value?: string | null) {
  return stripUrls(String(value ?? ""))
    .replace(/[_|]+/g, " ")
    .replace(/[^\w\s&/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value: string) {
  return value.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function truncateWords(value: string, maxWords = 6) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join(" ");
}

function hasUrl(value?: string | null) {
  return /https?:\/\/\S+|www\.\S+/i.test(String(value ?? ""));
}

function extractBrandLabel(value?: string | null) {
  const source = String(value ?? "");
  const match = PRODUCT_BRAND_RULES.find((rule) => rule.pattern.test(source));
  return match?.label ?? null;
}

function cleanPreviewText(value?: string | null) {
  const cleaned = normalizeChatText(value);
  if (!cleaned) return "";
  return cleaned.slice(0, 120).trim();
}

function sanitizeStoredPreview(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (hasUrl(raw)) {
    const brand = extractBrandLabel(raw);
    return brand ? `Shared ${brand} link` : "Shared product link";
  }
  return cleanPreviewText(raw);
}

function fallbackTitleFromText(value?: string | null) {
  const cleaned = truncateWords(normalizeChatText(value), 6);
  if (!cleaned) return "New stylist chat";
  return titleCase(cleaned);
}

function isGenericChatTitle(value?: string | null) {
  const normalized = normalizeChatText(value).toLowerCase();
  return (
    !normalized ||
    GENERIC_CHAT_TITLES.has(normalized) ||
    hasUrl(value) ||
    normalized.length > 48 ||
    normalized.split(/\s+/).length > 7
  );
}

export function summarizeChatTitle({
  userText,
  assistantText,
  intent,
}: ChatTitleSummaryInput) {
  const rawUserText = String(userText ?? "").trim();
  const combined = `${rawUserText} ${assistantText ?? ""} ${intent ?? ""}`.toLowerCase();
  const brand = extractBrandLabel(rawUserText) ?? extractBrandLabel(assistantText);

  if (hasUrl(rawUserText)) {
    if (brand) return `Added ${brand} Item`;
    return /\bcloset|wardrobe|import|add\b/i.test(rawUserText)
      ? "Wardrobe Import"
      : "Product Link Import";
  }

  if (/\bphoto|picture|selfie|mirror|wearing|fit check|outfit pic|analy[sz]e this outfit\b/i.test(combined)) {
    return "Outfit Photo Analysis";
  }

  if (/\bimport|add to (?:my )?(?:closet|wardrobe)|save this item|product link|closet link\b/i.test(combined)) {
    return brand ? `Added ${brand} Item` : "Wardrobe Import";
  }

  if (/\bunworn\b|\bignored pieces?\b|\bneglected pieces?\b/i.test(combined)) {
    return "Unworn Pieces";
  }

  if (/\bwardrobe gaps?\b|\bwhat should i buy\b|\bwhat am i missing\b|\bmissing pieces?\b/i.test(combined)) {
    return "Wardrobe Gaps";
  }

  if (/\bcloset insights?\b|\binsights?\b|\bcloset summary\b|\bwardrobe summary\b/i.test(combined)) {
    return "Closet Insight Summary";
  }

  if (/\bsmart casual\b/i.test(combined)) {
    return "Smart Casual Looks";
  }

  if (
    /\b(3|three)\b/.test(combined) &&
    /\boutfits?\b|\blooks?\b|\bdirections?\b|\boptions?\b/.test(combined)
  ) {
    return "Three Outfit Ideas";
  }

  if (/\bjacket|blazer|coat|outerwear\b/i.test(combined) && /\boutfit|look|style|wear\b/i.test(combined)) {
    return "Jacket Outfit Options";
  }

  if (/\bstyle me today\b|\btoday'?s outfit\b|\bwhat should i wear today\b|\bstyle me now\b/i.test(combined)) {
    return "Style Me Today";
  }

  return fallbackTitleFromText(rawUserText || assistantText || intent);
}

export function summarizeThreadDisplayTitle(
  thread: Pick<AIChatThread, "title" | "lastMessagePreview"> & Partial<Pick<AIChatThread, "titleEdited">>
) {
  if (thread.titleEdited && String(thread.title ?? "").trim()) {
    return String(thread.title).trim();
  }
  if (!isGenericChatTitle(thread.title)) {
    return fallbackTitleFromText(thread.title);
  }
  return summarizeChatTitle({
    userText: thread.title,
    assistantText: thread.lastMessagePreview,
  });
}

function sanitizeMessagePreview(message: AIMessage) {
  if (message.type === "outfit") return "Outfit suggestions";
  if (message.aura?.lookOptions?.length) {
    return `${message.aura.lookOptions.length} outfit directions`;
  }
  if (message.aura?.look) {
    return cleanPreviewText(message.aura.title || message.aura.reply || "Outfit suggestion");
  }
  if (message.attachments?.some((attachment) => attachment.type === "image") && !String(message.text ?? "").trim()) {
    return "Outfit photo shared";
  }
  const text = String(message.text ?? "").trim();
  if (!text) return message.type === "system/action" ? "System update" : "New message";
  if (hasUrl(text)) {
    const brand = extractBrandLabel(text);
    return brand ? `Shared ${brand} link` : "Shared product link";
  }
  return cleanPreviewText(text) || "New message";
}

function toChatThread(snapshot: { id: string; data: () => Record<string, unknown> }): AIChatThread {
  const data = snapshot.data() ?? {};
  const rawTitle = typeof data.title === "string" ? data.title.trim() : "";
  const rawPreview = typeof data.lastMessagePreview === "string" ? data.lastMessagePreview.trim() : "";
  return {
    chatId: snapshot.id,
    title: summarizeThreadDisplayTitle({
      title: rawTitle,
      lastMessagePreview: rawPreview,
      titleEdited: data.titleEdited === true,
    }),
    createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : Date.now(),
    lastMessagePreview: sanitizeStoredPreview(rawPreview),
    messageCount: typeof data.messageCount === "number" ? data.messageCount : 0,
    threadId: typeof data.threadId === "string" ? data.threadId : null,
    pinned: data.pinned === true,
    archived: data.archived === true,
    titleEdited: data.titleEdited === true,
  };
}

function sortChatThreads(threads: AIChatThread[]) {
  return [...threads].sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    return right.updatedAt - left.updatedAt;
  });
}

function toChatMessage(snapshot: { id: string; data: () => Record<string, unknown> }): AIMessage | null {
  const data = snapshot.data() ?? {};
  const type = data.type;
  if (type !== "user" && type !== "assistant" && type !== "outfit" && type !== "system/action") {
    return null;
  }
  const aura = isAuraResponse(data.aura) ? normalizeAuraCandidatePayload(data.aura) : undefined;
  if (DEBUG_AURA_CLIENT && aura?.lookOptions?.length) {
    console.log("[AURA_MULTI]", "loaded multi-look chat message", {
      messageId: snapshot.id,
      lookOptionsCount: aura.lookOptions.length,
      hasLook: !!aura.look,
      presentation: aura.presentation,
    });
  }
  return {
    id: snapshot.id,
    type,
    kind:
      data.kind === "user_text" ||
      data.kind === "aura_text" ||
      data.kind === "aura_card" ||
      data.kind === "system"
        ? data.kind
        : undefined,
    text: typeof data.text === "string" ? data.text : undefined,
    assistantIntroText:
      typeof data.assistantIntroText === "string" ? data.assistantIntroText : undefined,
    attachments: parseChatAttachments(data.attachments),
    streaming: typeof data.streaming === "boolean" ? data.streaming : undefined,
    outfits: Array.isArray(data.outfits) ? (data.outfits as AIMessage["outfits"]) : undefined,
    aura,
    createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
  };
}

function normalizeAuraCandidatePayload(value: unknown): AuraResponse {
  const response = value as AuraResponse;
  const candidateItems = response.candidateItems ?? response.candidates ?? [];
  if (!candidateItems.length) return response;
  return {
    ...response,
    presentation: "candidate_preview",
    candidateItems,
    candidates: candidateItems,
  };
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefinedDeep(entry)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefinedDeep(entry)])
    ) as T;
  }
  return value;
}

function parseChatAttachments(value: unknown): ChatAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const attachments = value.reduce<ChatAttachment[]>((out, entry) => {
      if (!entry || typeof entry !== "object") return out;
      const candidate = entry as Record<string, unknown>;
      const type = candidate.type === "audio" ? "audio" : candidate.type === "image" ? "image" : null;
      const uri = typeof candidate.uri === "string" ? candidate.uri : "";
      const id = typeof candidate.id === "string" ? candidate.id : "";
      if (!type || !uri || !id) return out;
      if (type === "image") {
        out.push({
          id,
          type,
          uri,
          localUri: typeof candidate.localUri === "string" ? candidate.localUri : null,
          groupId: typeof candidate.groupId === "string" ? candidate.groupId : null,
          role:
            candidate.role === "same_item" ||
            candidate.role === "separate_items" ||
            candidate.role === "reference"
              ? candidate.role
              : undefined,
          width: typeof candidate.width === "number" ? candidate.width : null,
          height: typeof candidate.height === "number" ? candidate.height : null,
        });
        return out;
      }
      out.push({
        id,
        type,
        uri,
        localUri: typeof candidate.localUri === "string" ? candidate.localUri : null,
        durationMs: typeof candidate.durationMs === "number" ? candidate.durationMs : null,
        transcript: typeof candidate.transcript === "string" ? candidate.transcript : null,
      });
      return out;
    }, []);
  return attachments.length ? attachments : undefined;
}

function isAuraResponse(value: unknown): value is AuraResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.presentation === undefined ||
      candidate.presentation === "chat" ||
      candidate.presentation === "card" ||
      candidate.presentation === "candidate_preview" ||
      candidate.presentation === "laundry_confirmation") &&
    typeof candidate.title === "string" &&
    typeof candidate.reply === "string" &&
    typeof candidate.reason === "string" &&
    Array.isArray(candidate.outfitItems) &&
    (candidate.ownedPieces === undefined || Array.isArray(candidate.ownedPieces)) &&
    (candidate.recommendedAdditions === undefined || Array.isArray(candidate.recommendedAdditions)) &&
    (candidate.missingPieces === undefined || Array.isArray(candidate.missingPieces)) &&
    (candidate.upgradeSuggestions === undefined || Array.isArray(candidate.upgradeSuggestions)) &&
    (candidate.upgradeSuggestionItems === undefined ||
      (Array.isArray(candidate.upgradeSuggestionItems) &&
        candidate.upgradeSuggestionItems.every(isAuraSuggestionItem))) &&
    Array.isArray(candidate.chips) &&
    typeof candidate.swapSuggestion === "string" &&
    (candidate.look === undefined || candidate.look === null || isAuraLook(candidate.look)) &&
    (candidate.lookOptions === undefined ||
      (Array.isArray(candidate.lookOptions) && candidate.lookOptions.every(isAuraLook))) &&
    (candidate.candidates === undefined ||
      (Array.isArray(candidate.candidates) && candidate.candidates.every(isAuraCandidateItem))) &&
    (candidate.candidateItems === undefined ||
      (Array.isArray(candidate.candidateItems) && candidate.candidateItems.every(isAuraCandidateItem))) &&
    (candidate.laundryAction === undefined ||
      candidate.laundryAction === null ||
      isAuraLaundryAction(candidate.laundryAction))
  );
}

function isAuraLaundryAction(value: unknown): boolean {
  const candidate = value as Record<string, unknown>;
  return (
    !!candidate &&
    typeof candidate === "object" &&
    (candidate.targetStatus === "clean" ||
      candidate.targetStatus === "needs_wash" ||
      candidate.targetStatus === "in_laundry") &&
    Array.isArray(candidate.matches) &&
    candidate.matches.every((match) => {
      const item = match as Record<string, unknown>;
      return (
        item &&
        typeof item === "object" &&
        typeof item.itemId === "string" &&
        typeof item.label === "string" &&
        (item.subtitle === undefined || item.subtitle === null || typeof item.subtitle === "string")
      );
    })
  );
}

function isAuraSuggestionItem(value: unknown): value is AuraSuggestionItem {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.label === "string" &&
    (candidate.searchQuery === undefined ||
      candidate.searchQuery === null ||
      typeof candidate.searchQuery === "string")
  );
}

function isAuraCandidateItem(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.candidateId === "string" &&
    Array.isArray(candidate.imageUrls) &&
    candidate.imageUrls.every((url) => typeof url === "string") &&
    (candidate.primaryImageUrl === undefined || candidate.primaryImageUrl === null || typeof candidate.primaryImageUrl === "string") &&
    (candidate.secondaryImageUrls === undefined ||
      (Array.isArray(candidate.secondaryImageUrls) && candidate.secondaryImageUrls.every((url) => typeof url === "string"))) &&
    (candidate.title === undefined || candidate.title === null || typeof candidate.title === "string") &&
    (candidate.category === undefined || candidate.category === null || typeof candidate.category === "string") &&
    (candidate.subCategory === undefined || candidate.subCategory === null || typeof candidate.subCategory === "string") &&
    (candidate.color === undefined || candidate.color === null || typeof candidate.color === "string") &&
    (candidate.brand === undefined || candidate.brand === null || typeof candidate.brand === "string") &&
    (candidate.material === undefined || candidate.material === null || typeof candidate.material === "string") &&
    (candidate.fit === undefined || candidate.fit === null || typeof candidate.fit === "string") &&
    (candidate.pattern === undefined || candidate.pattern === null || typeof candidate.pattern === "string") &&
    (candidate.confidence === undefined || candidate.confidence === null || typeof candidate.confidence === "number") &&
    (candidate.sourceType === "image" || candidate.sourceType === "link" || candidate.sourceType === "batch") &&
    (candidate.sourceUrl === undefined || candidate.sourceUrl === null || typeof candidate.sourceUrl === "string") &&
    (candidate.status === "awaiting_confirmation" ||
      candidate.status === "added" ||
      candidate.status === "cancelled" ||
      candidate.status === "failed")
  );
}

function isAuraLook(value: unknown): value is AuraLook {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.lookTitle === "string" &&
    typeof candidate.vibe === "string" &&
    typeof candidate.shortExplanation === "string" &&
    (candidate.stylingNote === undefined || typeof candidate.stylingNote === "string") &&
    Array.isArray(candidate.pieces) &&
    candidate.pieces.every(isAuraLookPiece) &&
    Array.isArray(candidate.fromCloset) &&
    Array.isArray(candidate.addToComplete) &&
    Array.isArray(candidate.alternates) &&
    Array.isArray(candidate.actions) &&
    candidate.actions.every(isAuraLookAction)
  );
}

function isAuraLookPiece(value: unknown): value is AuraLookPiece {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.role === "top" ||
      candidate.role === "bottom" ||
      candidate.role === "shoes" ||
      candidate.role === "outerwear" ||
      candidate.role === "accessory") &&
    typeof candidate.itemName === "string" &&
    (candidate.source === "closet" || candidate.source === "suggested") &&
    (candidate.itemId === undefined || candidate.itemId === null || typeof candidate.itemId === "string") &&
    (candidate.imageUrl === undefined || candidate.imageUrl === null || typeof candidate.imageUrl === "string")
  );
}

function isAuraLookAction(value: unknown): value is AuraLookAction {
  return (
    value === "saveLook" ||
    value === "planForToday" ||
    value === "likeLook" ||
    value === "notMyVibe" ||
    value === "showMoreLikeThis" ||
    value === "lessLikeThis" ||
    value === "shopMissingPieces" ||
    value === "useOnlyMyCloset" ||
    value === "makeItDressier"
  );
}

export async function createChatThread(uid: string, seedText?: string | null) {
  const ref = doc(chatCollectionRef(uid));
  const now = Date.now();
  const payload = {
    title: summarizeChatTitle({ userText: seedText }),
    createdAt: now,
    updatedAt: now,
    lastMessagePreview: "",
    messageCount: 0,
    threadId: null,
    pinned: false,
    archived: false,
    titleEdited: false,
  };
  await setDoc(ref, payload);
  return {
    chatId: ref.id,
    ...payload,
  } satisfies AIChatThread;
}

export async function startNewChat(uid: string) {
  return createChatThread(uid);
}

export async function loadLatestChatThread(uid: string) {
  const threads = await loadRecentChatThreads(uid, 24);
  return threads[0] ?? null;
}

export async function loadRecentChatThreads(uid: string, max = 24) {
  const fetchCount = Math.max(max * 3, 36);
  const snap = await getDocs(query(chatCollectionRef(uid), orderBy("updatedAt", "desc"), limit(fetchCount)));
  const threads = sortChatThreads(
    snap.docs
      .map((entry) => toChatThread(entry))
      .filter((thread) => !thread.archived)
      .slice(0, max)
  );
  void setCachedChatList(uid, threads);
  return threads;
}

export async function loadChatThread(uid: string, chatId: string) {
  const snap = await getDoc(chatDocRef(uid, chatId));
  return snap.exists() ? toChatThread(snap) : null;
}

export async function loadChatMessages(uid: string, chatId: string) {
  const snap = await getDocs(query(messageCollectionRef(uid, chatId), orderBy("createdAt", "asc")));
  const messages = snap.docs.map((entry) => toChatMessage(entry)).filter((entry): entry is AIMessage => !!entry);
  void setCachedRecentMessages(uid, chatId, messages);
  return messages;
}

export async function appendMessageToChat(
  uid: string,
  chatId: string,
  message: AIMessage,
  options?: { threadId?: string | null; titleFromUserText?: string | null }
) {
  const chatRef = chatDocRef(uid, chatId);
  const messageRef = doc(messageCollectionRef(uid, chatId), message.id);
  const now = Date.now();
  const sanitizedAura = message.aura ? stripUndefinedDeep(message.aura) : undefined;
  const threadSnap = await getDoc(chatRef);
  const existingThread = threadSnap.exists() ? toChatThread(threadSnap) : null;
  const batch = writeBatch(db);
  batch.set(messageRef, {
    type: message.type,
    ...(message.kind ? { kind: message.kind } : {}),
    ...(message.text ? { text: message.text } : {}),
    ...(message.assistantIntroText ? { assistantIntroText: message.assistantIntroText } : {}),
    ...(message.attachments?.length ? { attachments: message.attachments } : {}),
    ...(typeof message.streaming === "boolean" ? { streaming: message.streaming } : {}),
    ...(message.outfits ? { outfits: message.outfits } : {}),
    ...(sanitizedAura ? { aura: sanitizedAura } : {}),
    createdAt: typeof message.createdAt === "number" ? message.createdAt : now,
  });
  if (DEBUG_AURA_CLIENT && sanitizedAura?.lookOptions?.length) {
    console.log("[AURA_MULTI]", "storing multi-look chat message", {
      messageId: message.id,
      lookOptionsCount: sanitizedAura.lookOptions.length,
      hasLook: !!sanitizedAura.look,
      presentation: sanitizedAura.presentation,
    });
  }
  if (DEBUG_AURA_CLIENT && (sanitizedAura?.candidateItems?.length || sanitizedAura?.candidates?.length)) {
    console.log("[AURA_STORE]", "storing candidate preview message", {
      messageId: message.id,
      kind: message.kind,
      candidateItemsCount: sanitizedAura.candidateItems?.length ?? 0,
      candidatesCount: sanitizedAura.candidates?.length ?? 0,
      auraKeys: Object.keys(sanitizedAura),
    });
  }
  batch.set(
    chatRef,
    {
      updatedAt: now,
      lastMessagePreview: sanitizeMessagePreview(message),
      messageCount: increment(1),
      ...(typeof options?.threadId === "string" || options?.threadId === null ? { threadId: options.threadId } : {}),
      ...(message.type === "user" &&
      options?.titleFromUserText &&
      !existingThread?.titleEdited
        ? { title: summarizeChatTitle({ userText: options.titleFromUserText }) }
        : {}),
    },
    { merge: true }
  );
  await batch.commit();
}

export async function updateChatThread(uid: string, chatId: string, updates: Partial<Pick<AIChatThread, "threadId" | "title" | "updatedAt" | "lastMessagePreview" | "messageCount">>) {
  await setDoc(
    chatDocRef(uid, chatId),
    {
      ...updates,
      ...(typeof updates.title === "string"
        ? { title: summarizeChatTitle({ userText: updates.title, assistantText: updates.lastMessagePreview }) }
        : {}),
      ...(typeof updates.lastMessagePreview === "string"
        ? { lastMessagePreview: sanitizeStoredPreview(updates.lastMessagePreview) }
        : {}),
      updatedAt: typeof updates.updatedAt === "number" ? updates.updatedAt : Date.now(),
    },
    { merge: true }
  );
}

export async function setChatPinned(uid: string, chatId: string, pinned: boolean) {
  await setDoc(
    chatDocRef(uid, chatId),
    {
      pinned,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

export async function renameChatThread(uid: string, chatId: string, title: string) {
  const nextTitle = String(title ?? "").trim() || "AURA chat";
  await setDoc(
    chatDocRef(uid, chatId),
    {
      title: nextTitle,
      titleEdited: true,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

export async function setChatArchived(uid: string, chatId: string, archived: boolean) {
  await setDoc(
    chatDocRef(uid, chatId),
    {
      archived,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

async function deleteCollectionDocs(ref: ReturnType<typeof collection>) {
  const snap = await getDocs(ref);
  if (!snap.docs.length) return;

  for (let index = 0; index < snap.docs.length; index += 400) {
    const chunk = snap.docs.slice(index, index + 400);
    const batch = writeBatch(db);
    chunk.forEach((entry) => batch.delete(entry.ref));
    await batch.commit();
  }
}

export async function deleteChatThread(uid: string, chatId: string) {
  await deleteCollectionDocs(messageCollectionRef(uid, chatId));
  await deleteCollectionDocs(sessionContextCollectionRef(uid, chatId));
  await deleteDoc(chatDocRef(uid, chatId));
}
