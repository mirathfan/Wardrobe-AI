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
import type { AIMessage } from "@/src/components/ai/chatTypes";
import type { AuraLook, AuraLookAction, AuraLookPiece, AuraResponse } from "@/src/types/aura";

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
    streaming: typeof data.streaming === "boolean" ? data.streaming : undefined,
    outfits: Array.isArray(data.outfits) ? (data.outfits as AIMessage["outfits"]) : undefined,
    aura: isAuraResponse(data.aura) ? data.aura : undefined,
    createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
  };
}

function isAuraResponse(value: unknown): value is AuraResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.presentation === undefined ||
      candidate.presentation === "chat" ||
      candidate.presentation === "card") &&
    typeof candidate.title === "string" &&
    typeof candidate.reply === "string" &&
    typeof candidate.reason === "string" &&
    Array.isArray(candidate.outfitItems) &&
    (candidate.ownedPieces === undefined || Array.isArray(candidate.ownedPieces)) &&
    (candidate.recommendedAdditions === undefined || Array.isArray(candidate.recommendedAdditions)) &&
    Array.isArray(candidate.chips) &&
    typeof candidate.swapSuggestion === "string" &&
    (candidate.look === undefined || candidate.look === null || isAuraLook(candidate.look))
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
    value === "showMoreLikeThis" ||
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
  const batch = writeBatch(db);
  batch.set(messageRef, {
    type: message.type,
    ...(message.kind ? { kind: message.kind } : {}),
    ...(message.text ? { text: message.text } : {}),
    ...(typeof message.streaming === "boolean" ? { streaming: message.streaming } : {}),
    ...(message.outfits ? { outfits: message.outfits } : {}),
    ...(message.aura ? { aura: message.aura } : {}),
    createdAt: typeof message.createdAt === "number" ? message.createdAt : now,
  });
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
