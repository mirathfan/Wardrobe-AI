import { Storage } from "@/src/lib/storage";
import type { AIMessage } from "@/src/components/ai/chatTypes";
import { AURA_CLIENT_PRIVATE_PAYLOAD_KEYS } from "@/src/lib/auraHardening";
import { orderChatMessages, toMessageMillis } from "@/src/lib/chatMessageOrder";
import type { AIChatThread } from "@/src/lib/aiChats";
import type { MinimumClosetProgress } from "@/src/lib/minimumCloset";
import type { SavedAuraLookRecord } from "@/src/lib/auraLooks";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { UserProfilePreferences } from "@/src/types/UserProfilePreferences";
import type { DailyOutfitRecord } from "@/src/utils/dailyOutfits";

export const LOCAL_CACHE_VERSION = 1;

const CACHE_PREFIX = "local-cache";
const MAX_CACHED_CHAT_MESSAGES = 50;
const CHAT_CACHE_SKIP_KEYS = new Set([
  ...AURA_CLIENT_PRIVATE_PAYLOAD_KEYS,
  "diagnostics",
  "scoreBreakdown",
  "aiMetadata",
  "localUri",
]);

export const LOCAL_CACHE_MAX_AGE_MS = {
  closetItems: 24 * 60 * 60 * 1000,
  homeSnapshot: 6 * 60 * 60 * 1000,
  chatList: 7 * 24 * 60 * 60 * 1000,
  recentMessages: 7 * 24 * 60 * 60 * 1000,
  profilePreferences: 7 * 24 * 60 * 60 * 1000,
} as const;

type CacheEnvelope<T> = {
  version: number;
  updatedAt: number;
  data: T;
};

export type LocalCacheResult<T> = {
  data: T;
  updatedAt: number;
  stale: boolean;
};

export type HomeDashboardSnapshot = {
  closetItemCount: number;
  cleanCount: number;
  laundryCount: number;
  needsWashCount: number;
  minimumClosetProgress: MinimumClosetProgress | null;
  latestSavedLookPreview: SavedAuraLookRecord | null;
  latestChatPreview: AIChatThread | null;
  todayOutfitPreview: DailyOutfitRecord | null;
};

function keyFor(uid: string, suffix: string) {
  return `aura:${uid}:${CACHE_PREFIX}:v${LOCAL_CACHE_VERSION}:${suffix}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isRemoteUrl(value: unknown) {
  return /^https?:\/\//i.test(String(value ?? "").trim());
}

function cleanRemoteUrl(value: unknown): string | null {
  const url = String(value ?? "").trim();
  return isRemoteUrl(url) ? url : null;
}

function isLikelyDerivedImageUrl(value: unknown) {
  const url = String(value ?? "").trim().toLowerCase();
  if (!isRemoteUrl(url)) return false;
  return /clean|cutout|normalized|thumb|thumbnail|preview|crop|cropped|transparent|alpha|isolated/.test(url);
}

function cleanDerivedImageUrl(value: unknown): string | null {
  return isLikelyDerivedImageUrl(value) ? String(value).trim() : null;
}

function cleanString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function cleanStringList(value: unknown, max = 24): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value.map(cleanString).filter(Boolean).slice(0, max) as string[];
  return cleaned.length ? cleaned : undefined;
}

function toMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (value && typeof value === "object") {
    const maybeTimestamp = value as {
      toMillis?: () => number;
      toDate?: () => Date;
      seconds?: number;
      nanoseconds?: number;
    };
    if (typeof maybeTimestamp.toMillis === "function") {
      const millis = maybeTimestamp.toMillis();
      return Number.isFinite(millis) ? millis : null;
    }
    if (typeof maybeTimestamp.toDate === "function") {
      const date = maybeTimestamp.toDate();
      return Number.isFinite(date?.getTime?.()) ? date.getTime() : null;
    }
    if (typeof maybeTimestamp.seconds === "number") {
      return maybeTimestamp.seconds * 1000 + Math.floor((maybeTimestamp.nanoseconds ?? 0) / 1000000);
    }
  }
  return null;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as T;
}

function sanitizePhotosForCache(item: ClothingItem) {
  const photos = item.photos ?? {};
  const cleanedSource = photos.cleanedSource === "placeholder" || photos.cleanedSource === "onnx" || photos.cleanedSource === "vision"
    ? photos.cleanedSource
    : undefined;
  const images = [
    ...(Array.isArray(item.images) ? item.images : []),
    ...(Array.isArray(photos.images) ? photos.images : []),
  ]
    .map((image) =>
      compact({
        cleanedUrl: cleanRemoteUrl(image?.cleanedUrl),
        isPrimary: image?.isPrimary === true ? true : undefined,
      })
    )
    .filter((image) => image.cleanedUrl);

  const sanitized = compact({
    normalizedUrl: cleanRemoteUrl(photos.normalizedUrl),
    previewUrl: cleanRemoteUrl(photos.previewUrl),
    cleanedUrl: cleanRemoteUrl(photos.cleanedUrl),
    cleanedPhotoUrl: cleanRemoteUrl(photos.cleanedPhotoUrl),
    cleanedThumbUrl: cleanRemoteUrl(photos.cleanedThumbUrl),
    thumbUrl: cleanRemoteUrl(photos.thumbUrl),
    croppedUrl: cleanRemoteUrl(photos.croppedUrl),
    primaryUrl: cleanDerivedImageUrl(photos.primaryUrl ?? item.photoUrl),
    cleanedSource,
    images: images.length ? images : undefined,
  });

  return Object.keys(sanitized).length ? sanitized : undefined;
}

function sanitizeClosetItemForCache(item: ClothingItem): ClothingItem {
  const createdAt = toMillis(item.createdAt) ?? Date.now();
  const updatedAt = toMillis((item as { updatedAt?: unknown }).updatedAt);
  return compact({
    id: item.id,
    name: cleanString(item.name) ?? undefined,
    brand: cleanString(item.brand) ?? "",
    category: item.category,
    subCategory: cleanString(item.subCategory) ?? undefined,
    type: cleanString(item.type) ?? undefined,
    wearSlot: item.wearSlot,
    pattern: item.pattern,
    material: cleanString(item.material) ?? undefined,
    style: cleanString(item.style) ?? undefined,
    formality: item.formality,
    warmth: item.warmth,
    layerRole: item.layerRole,
    visualWeight: item.visualWeight,
    versatilityScore: typeof item.versatilityScore === "number" ? item.versatilityScore : undefined,
    aestheticTags: cleanStringList(item.aestheticTags),
    detailTags: cleanStringList(item.detailTags),
    occasionTags: cleanStringList(item.occasionTags),
    seasonTags: cleanStringList(item.seasonTags),
    size: cleanString(item.size) ?? undefined,
    fit: item.fit,
    rise: item.rise,
    legShape: item.legShape,
    isFavorite: item.isFavorite ?? undefined,
    status: item.status ?? "AVAILABLE",
    laundryStatus: item.laundryStatus ?? undefined,
    wearCountSinceWash: typeof item.wearCountSinceWash === "number" ? item.wearCountSinceWash : 0,
    laundryUpdatedAt: toMillis(item.laundryUpdatedAt) ?? undefined,
    lastWornAt: toMillis(item.lastWornAt) ?? undefined,
    lastWornDate: toMillis(item.lastWornDate) ?? undefined,
    lastWashedDate: toMillis(item.lastWashedDate) ?? undefined,
    lastWashedAt: toMillis(item.lastWashedAt) ?? undefined,
    createdAt,
    updatedAt: updatedAt ?? undefined,
    colorLabel: cleanString(item.colorLabel) ?? undefined,
    primaryColor: cleanString(item.primaryColor) ?? undefined,
    displayColor: cleanString(item.displayColor) ?? undefined,
    displayColors: cleanStringList(item.displayColors),
    colors: cleanStringList(item.colors),
    aiColorLabel: cleanString(item.aiColorLabel) ?? undefined,
    aiColors: cleanStringList(item.aiColors),
    cleanedImageUrl: cleanRemoteUrl(item.cleanedImageUrl) ?? undefined,
    cleanedUrl: cleanRemoteUrl((item as { cleanedUrl?: unknown }).cleanedUrl) ?? undefined,
    cleanedPhotoUrl: cleanRemoteUrl((item as { cleanedPhotoUrl?: unknown }).cleanedPhotoUrl) ?? undefined,
    normalizedUrl: cleanRemoteUrl((item as { normalizedUrl?: unknown }).normalizedUrl) ?? undefined,
    photos: sanitizePhotosForCache(item),
    visualNormalization: item.visualNormalization ?? undefined,
    backgroundRemovalMethod: item.backgroundRemovalMethod,
    ingestion: item.ingestion
      ? compact({
          status: item.ingestion.status,
          lastRunAt: toMillis(item.ingestion.lastRunAt) ?? undefined,
          error: item.ingestion.error,
          runId: cleanString(item.ingestion.runId) ?? undefined,
        })
      : undefined,
    ingestionStatus: item.ingestionStatus ?? undefined,
    isDraft: item.isDraft === true ? true : undefined,
    draftState: item.draftState ?? undefined,
    itemLifecycleStatus: (item as { itemLifecycleStatus?: unknown }).itemLifecycleStatus,
  }) as ClothingItem;
}

function sanitizeMessageAttachment(attachment: unknown) {
  if (!isObject(attachment)) return null;
  const type = attachment.type === "audio" ? "audio" : attachment.type === "image" ? "image" : null;
  const uri = cleanRemoteUrl(attachment.uri);
  const id = cleanString(attachment.id);
  if (!type || !uri || !id) return null;

  if (type === "image") {
    return compact({
      id,
      type,
      uri,
      groupId: cleanString(attachment.groupId) ?? undefined,
      role: attachment.role,
      width: typeof attachment.width === "number" ? attachment.width : undefined,
      height: typeof attachment.height === "number" ? attachment.height : undefined,
    });
  }

  return compact({
    id,
    type,
    uri,
    durationMs: typeof attachment.durationMs === "number" ? attachment.durationMs : undefined,
    transcript: cleanString(attachment.transcript) ?? undefined,
  });
}

function sanitizeDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeDeep).filter((entry) => entry !== undefined);
  }
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !CHAT_CACHE_SKIP_KEYS.has(key))
        .map(([key, entry]) => [key, sanitizeDeep(entry)])
        .filter(([, entry]) => entry !== undefined)
    );
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^data:/i.test(trimmed) || /^file:/i.test(trimmed)) return undefined;
    return trimmed.length > 8000 ? `${trimmed.slice(0, 8000)}...` : trimmed;
  }
  return value;
}

export function sanitizeChatMessageForCache(message: AIMessage): AIMessage | null {
  if (message.streaming) return null;
  const attachments = Array.isArray(message.attachments)
    ? message.attachments.map(sanitizeMessageAttachment).filter(Boolean)
    : undefined;
  return compact({
    id: cleanString(message.id) ?? `cached-${Date.now()}`,
    type: message.type,
    kind: message.kind,
    text: typeof message.text === "string" ? message.text.slice(0, 8000) : undefined,
    assistantIntroText:
      typeof message.assistantIntroText === "string"
        ? message.assistantIntroText.slice(0, 4000)
        : undefined,
    attachments: attachments?.length ? attachments : undefined,
    outfits: message.outfits,
    aura: message.aura ? sanitizeDeep(message.aura) : undefined,
    agentResponse: message.agentResponse ? sanitizeDeep(message.agentResponse) : undefined,
    agentActionStates: message.agentActionStates ? sanitizeDeep(message.agentActionStates) : undefined,
    createdAt:
      toMessageMillis(message.createdAt) ??
      toMessageMillis(message.clientCreatedAt) ??
      Date.now(),
    clientCreatedAt:
      toMessageMillis(message.clientCreatedAt) ??
      toMessageMillis(message.createdAt) ??
      undefined,
    localSequence:
      typeof message.localSequence === "number" && Number.isFinite(message.localSequence)
        ? message.localSequence
        : undefined,
    replyToMessageId: message.replyToMessageId ?? undefined,
  }) as AIMessage;
}

function sanitizeChatThreadForCache(thread: AIChatThread): AIChatThread {
  return {
    chatId: thread.chatId,
    title: thread.title,
    createdAt: toMillis(thread.createdAt) ?? Date.now(),
    updatedAt: toMillis(thread.updatedAt) ?? Date.now(),
    lastMessagePreview: thread.lastMessagePreview,
    messageCount: typeof thread.messageCount === "number" ? thread.messageCount : 0,
    threadId: typeof thread.threadId === "string" ? thread.threadId : null,
    pinned: thread.pinned === true,
    archived: thread.archived === true,
    titleEdited: thread.titleEdited === true,
  };
}

function sanitizeHomeSnapshotForCache(snapshot: HomeDashboardSnapshot): HomeDashboardSnapshot {
  return {
    closetItemCount: snapshot.closetItemCount,
    cleanCount: snapshot.cleanCount,
    laundryCount: snapshot.laundryCount,
    needsWashCount: snapshot.needsWashCount,
    minimumClosetProgress: snapshot.minimumClosetProgress,
    latestSavedLookPreview: snapshot.latestSavedLookPreview
      ? (sanitizeDeep(snapshot.latestSavedLookPreview) as SavedAuraLookRecord)
      : null,
    latestChatPreview: snapshot.latestChatPreview
      ? sanitizeChatThreadForCache(snapshot.latestChatPreview)
      : null,
    todayOutfitPreview: snapshot.todayOutfitPreview
      ? (sanitizeDeep(snapshot.todayOutfitPreview) as DailyOutfitRecord)
      : null,
  };
}

async function readCache<T>(uid: string, suffix: string, maxAgeMs: number): Promise<LocalCacheResult<T> | null> {
  try {
    const raw = await Storage.getItem(keyFor(uid, suffix));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || parsed.version !== LOCAL_CACHE_VERSION || !("data" in parsed)) return null;
    const updatedAt = typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0;
    return {
      data: parsed.data,
      updatedAt,
      stale: !updatedAt || Date.now() - updatedAt > maxAgeMs,
    };
  } catch {
    return null;
  }
}

async function writeCache<T>(uid: string, suffix: string, data: T): Promise<void> {
  try {
    const payload: CacheEnvelope<T> = {
      version: LOCAL_CACHE_VERSION,
      updatedAt: Date.now(),
      data,
    };
    await Storage.setItem(keyFor(uid, suffix), JSON.stringify(payload));
  } catch {
    // Local cache writes must never block Firestore-backed UI.
  }
}

export function getCachedClosetItems(uid: string) {
  return readCache<ClothingItem[]>(uid, "closet-items", LOCAL_CACHE_MAX_AGE_MS.closetItems);
}

export function setCachedClosetItems(uid: string, items: ClothingItem[]) {
  return writeCache(
    uid,
    "closet-items",
    (Array.isArray(items) ? items : []).map(sanitizeClosetItemForCache)
  );
}

export async function removeCachedClosetItem(uid: string, itemId: string) {
  const cleanedItemId = cleanString(itemId);
  if (!cleanedItemId) return;
  const cached = await readCache<ClothingItem[]>(
    uid,
    "closet-items",
    LOCAL_CACHE_MAX_AGE_MS.closetItems,
  );
  if (!cached?.data?.length) return;
  await setCachedClosetItems(
    uid,
    cached.data.filter((item) => item.id !== cleanedItemId),
  );
}

export async function clearCachedClosetItems(uid: string) {
  try {
    await Storage.removeItem(keyFor(uid, "closet-items"));
  } catch {
    // ignore
  }
}

export function getCachedHomeSnapshot(uid: string) {
  return readCache<HomeDashboardSnapshot>(uid, "home-snapshot", LOCAL_CACHE_MAX_AGE_MS.homeSnapshot);
}

export function setCachedHomeSnapshot(uid: string, snapshot: HomeDashboardSnapshot) {
  return writeCache(uid, "home-snapshot", sanitizeHomeSnapshotForCache(snapshot));
}

export async function clearCachedHomeSnapshot(uid: string) {
  try {
    await Storage.removeItem(keyFor(uid, "home-snapshot"));
  } catch {
    // ignore
  }
}

export function getCachedChatList(uid: string) {
  return readCache<AIChatThread[]>(uid, "chat-list", LOCAL_CACHE_MAX_AGE_MS.chatList);
}

export function setCachedChatList(uid: string, chats: AIChatThread[]) {
  return writeCache(
    uid,
    "chat-list",
    (Array.isArray(chats) ? chats : []).map(sanitizeChatThreadForCache)
  );
}

export function getCachedRecentMessages(uid: string, chatId: string) {
  return readCache<AIMessage[]>(
    uid,
    `chat-messages:${chatId}`,
    LOCAL_CACHE_MAX_AGE_MS.recentMessages
  );
}

export function setCachedRecentMessages(uid: string, chatId: string, messages: AIMessage[]) {
  return writeCache(
    uid,
    `chat-messages:${chatId}`,
    orderChatMessages(
      (Array.isArray(messages) ? messages : [])
        .map(sanitizeChatMessageForCache)
        .filter((message): message is AIMessage => !!message),
    ).slice(-MAX_CACHED_CHAT_MESSAGES)
  );
}

export async function clearCachedRecentMessages(uid: string, chatId: string) {
  try {
    await Storage.removeItem(keyFor(uid, `chat-messages:${chatId}`));
  } catch {
    // ignore
  }
}

export async function invalidateClosetItemDeletionCaches(uid: string, itemId: string) {
  await Promise.allSettled([
    removeCachedClosetItem(uid, itemId),
    clearCachedHomeSnapshot(uid),
  ]);
}

export function getCachedProfilePreferences(uid: string) {
  return readCache<UserProfilePreferences>(
    uid,
    "profile-preferences",
    LOCAL_CACHE_MAX_AGE_MS.profilePreferences
  );
}

export function setCachedProfilePreferences(uid: string, prefs: UserProfilePreferences) {
  return writeCache(uid, "profile-preferences", sanitizeDeep(prefs) as UserProfilePreferences);
}

export async function clearLocalCacheForUser(uid: string) {
  try {
    const keys = await Storage.getAllKeys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(`aura:${uid}:${CACHE_PREFIX}:`))
        .map((key) => Storage.removeItem(key))
    );
  } catch {
    // ignore
  }
}
