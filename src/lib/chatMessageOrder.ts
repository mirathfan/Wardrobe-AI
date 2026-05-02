import type { AIMessage } from "@/src/components/ai/chatTypes";

type OrderableMessage = Pick<AIMessage, "id"> &
  Partial<Pick<AIMessage, "createdAt" | "clientCreatedAt" | "localSequence" | "replyToMessageId">>;

export function toMessageMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) {
    const millis = value.getTime();
    return Number.isFinite(millis) ? millis : null;
  }
  if (value && typeof value === "object") {
    const timestamp = value as {
      toMillis?: () => number;
      toDate?: () => Date;
      seconds?: number;
      nanoseconds?: number;
    };
    if (typeof timestamp.toMillis === "function") {
      const millis = timestamp.toMillis();
      return Number.isFinite(millis) ? millis : null;
    }
    if (typeof timestamp.toDate === "function") {
      const date = timestamp.toDate();
      const millis = date?.getTime?.();
      return Number.isFinite(millis) ? millis : null;
    }
    if (typeof timestamp.seconds === "number") {
      return timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds ?? 0) / 1000000);
    }
  }
  return null;
}

function millisFromMessageId(id: string) {
  const match = /^msg-(\d+)-/.exec(id);
  if (!match) return null;
  const millis = Number(match[1]);
  return Number.isFinite(millis) ? millis : null;
}

function messageTimestamp(message: OrderableMessage) {
  return toMessageMillis(message.clientCreatedAt) ?? toMessageMillis(message.createdAt);
}

export function messageOrderMillis(message: OrderableMessage) {
  return (
    messageTimestamp(message) ??
    millisFromMessageId(message.id) ??
    0
  );
}

function messageSequence(message: OrderableMessage) {
  return typeof message.localSequence === "number" && Number.isFinite(message.localSequence)
    ? message.localSequence
    : null;
}

function compareMaybeNumber(left: number | null, right: number | null) {
  if (left !== null && right !== null && left !== right) return left - right;
  if (left !== null && right === null) return -1;
  if (left === null && right !== null) return 1;
  return 0;
}

function ensureRepliesFollowParents<T extends OrderableMessage>(messages: T[]) {
  const next = messages.slice();
  let moved = true;
  let guard = 0;

  while (moved && guard < next.length) {
    moved = false;
    guard += 1;

    for (let index = 0; index < next.length; index += 1) {
      const message = next[index];
      if (!message.replyToMessageId) continue;

      const parentIndex = next.findIndex((entry) => entry.id === message.replyToMessageId);
      if (parentIndex < 0 || parentIndex < index) continue;

      next.splice(index, 1);
      const adjustedParentIndex = next.findIndex((entry) => entry.id === message.replyToMessageId);
      next.splice(adjustedParentIndex + 1, 0, message);
      moved = true;
      break;
    }
  }

  return next;
}

export function orderChatMessages<T extends OrderableMessage>(messages: T[]): T[] {
  const sorted = [...messages].sort((left, right) => {
    const timestampCompare = compareMaybeNumber(messageTimestamp(left), messageTimestamp(right));
    if (timestampCompare !== 0) return timestampCompare;

    const sequenceCompare = compareMaybeNumber(messageSequence(left), messageSequence(right));
    if (sequenceCompare !== 0) return sequenceCompare;

    return left.id.localeCompare(right.id);
  });
  return ensureRepliesFollowParents(sorted);
}
