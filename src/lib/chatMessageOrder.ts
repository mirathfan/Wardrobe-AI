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

export function messageOrderMillis(message: OrderableMessage) {
  return (
    toMessageMillis(message.clientCreatedAt) ??
    toMessageMillis(message.createdAt) ??
    millisFromMessageId(message.id) ??
    0
  );
}

function messageSequence(message: OrderableMessage, fallbackIndex: number) {
  return typeof message.localSequence === "number" && Number.isFinite(message.localSequence)
    ? message.localSequence
    : fallbackIndex;
}

export function orderChatMessages<T extends OrderableMessage>(messages: T[]): T[] {
  const originalIndex = new Map(messages.map((message, index) => [message.id, index]));
  return [...messages].sort((left, right) => {
    if (left.replyToMessageId === right.id) return 1;
    if (right.replyToMessageId === left.id) return -1;

    const leftMillis = messageOrderMillis(left);
    const rightMillis = messageOrderMillis(right);
    if (leftMillis !== rightMillis) return leftMillis - rightMillis;

    const leftSequence = messageSequence(left, originalIndex.get(left.id) ?? 0);
    const rightSequence = messageSequence(right, originalIndex.get(right.id) ?? 0);
    if (leftSequence !== rightSequence) return leftSequence - rightSequence;

    return left.id.localeCompare(right.id);
  });
}
