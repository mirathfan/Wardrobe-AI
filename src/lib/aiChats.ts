import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  writeBatch,
} from "firebase/firestore";

import { db } from "@/src/lib/firebase";
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
};

function chatCollectionRef(uid: string) {
  return collection(db, "users", uid, "aiChats");
}

function chatDocRef(uid: string, chatId: string) {
  return doc(db, "users", uid, "aiChats", chatId);
}

function messageCollectionRef(uid: string, chatId: string) {
  return collection(db, "users", uid, "aiChats", chatId, "messages");
}

function sanitizeMessagePreview(message: AIMessage) {
  if (message.type === "outfit") return "Outfit suggestions";
  const text = String(message.text ?? "").trim();
  if (!text) return message.type === "system/action" ? "System update" : "New message";
  return text.slice(0, 120);
}

function deriveTitle(seedText?: string | null) {
  const text = String(seedText ?? "").trim();
  if (!text) return "New stylist chat";
  return text.slice(0, 44);
}

function toChatThread(snapshot: { id: string; data: () => Record<string, unknown> }): AIChatThread {
  const data = snapshot.data() ?? {};
  return {
    chatId: snapshot.id,
    title: typeof data.title === "string" && data.title.trim() ? data.title.trim() : "New stylist chat",
    createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : Date.now(),
    lastMessagePreview:
      typeof data.lastMessagePreview === "string" ? data.lastMessagePreview.trim() : "",
    messageCount: typeof data.messageCount === "number" ? data.messageCount : 0,
    threadId: typeof data.threadId === "string" ? data.threadId : null,
  };
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
      candidate.presentation === "candidate_preview") &&
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
      (Array.isArray(candidate.candidateItems) && candidate.candidateItems.every(isAuraCandidateItem)))
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
    title: deriveTitle(seedText),
    createdAt: now,
    updatedAt: now,
    lastMessagePreview: "",
    messageCount: 0,
    threadId: null,
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
  const snap = await getDocs(query(chatCollectionRef(uid), orderBy("updatedAt", "desc"), limit(1)));
  const docSnap = snap.docs[0];
  return docSnap ? toChatThread(docSnap) : null;
}

export async function loadRecentChatThreads(uid: string, max = 8) {
  const snap = await getDocs(query(chatCollectionRef(uid), orderBy("updatedAt", "desc"), limit(max)));
  return snap.docs.map((entry) => toChatThread(entry));
}

export async function loadChatThread(uid: string, chatId: string) {
  const snap = await getDoc(chatDocRef(uid, chatId));
  return snap.exists() ? toChatThread(snap) : null;
}

export async function loadChatMessages(uid: string, chatId: string) {
  const snap = await getDocs(query(messageCollectionRef(uid, chatId), orderBy("createdAt", "asc")));
  return snap.docs.map((entry) => toChatMessage(entry)).filter((entry): entry is AIMessage => !!entry);
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
  const existingChat = await getDoc(chatRef);
  const existingCount =
    existingChat.exists() && typeof existingChat.data()?.messageCount === "number"
      ? (existingChat.data()?.messageCount as number)
      : 0;
  const sanitizedAura = message.aura ? stripUndefinedDeep(message.aura) : undefined;
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
      messageCount: existingCount + 1,
      ...(typeof options?.threadId === "string" || options?.threadId === null ? { threadId: options.threadId } : {}),
      ...(message.type === "user" && options?.titleFromUserText
        ? { title: deriveTitle(options.titleFromUserText) }
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
      updatedAt: typeof updates.updatedAt === "number" ? updates.updatedAt : Date.now(),
    },
    { merge: true }
  );
}
