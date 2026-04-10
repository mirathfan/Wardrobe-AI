import { getFunctions, httpsCallable } from "firebase/functions";
import { Platform } from "react-native";

import { auth, app } from "@/src/lib/firebase";
import type { AuraResponse } from "@/src/types/aura";

type AskAuraArgs = {
  message: string;
  history?: {
    role: "user" | "assistant";
    text: string;
  }[];
  selectedDate?: string | null;
  occasion?: string | null;
  weather?: {
    tempF?: number | null;
    condition?: string | null;
  } | null;
};

export async function askAura(args: AskAuraArgs): Promise<AuraResponse> {
  const functions = getFunctions(app);
  const callable = httpsCallable<AskAuraArgs, { ok: boolean; data: AuraResponse }>(
    functions,
    "askAura"
  );
  const result = await callable(args);
  return result.data.data;
}

type AskAuraStreamCallbacks = {
  onStatus?: (status: string) => void;
  onDelta?: (delta: string) => void;
  onFinal?: (data: AuraResponse) => void;
};

const STREAM_CHUNK_DELAY_MS = 34;
const MAX_STREAM_SEGMENT_LENGTH = 12;

function getAskAuraStreamUrl() {
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  return `https://us-central1-${projectId}.cloudfunctions.net/askAuraStream`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitDeltaForDisplay(delta: string) {
  const rawParts = delta.match(/\S+\s*|\s+/g) ?? [delta];
  return rawParts.flatMap((part) => {
    if (part.length <= MAX_STREAM_SEGMENT_LENGTH) return [part];
    const segments: string[] = [];
    for (let index = 0; index < part.length; index += MAX_STREAM_SEGMENT_LENGTH) {
      segments.push(part.slice(index, index + MAX_STREAM_SEGMENT_LENGTH));
    }
    return segments;
  });
}

async function emitDeltaSmoothly(delta: string, onDelta?: (delta: string) => void) {
  if (!onDelta || !delta) return;
  const parts = splitDeltaForDisplay(delta);
  for (let index = 0; index < parts.length; index += 1) {
    onDelta(parts[index]);
    if (index < parts.length - 1) {
      await sleep(STREAM_CHUNK_DELAY_MS);
    }
  }
}

function processEventLines(
  chunk: string,
  callbacks: AskAuraStreamCallbacks,
  setFinalData: (data: AuraResponse) => void
) {
  const lines = chunk.split("\n");
  return lines.reduce<Promise<void>>(async (previous, line) => {
    await previous;
    const trimmed = line.trim();
    if (!trimmed) return;
    const event = JSON.parse(trimmed) as
      | { type: "status"; status: string }
      | { type: "delta"; delta: string }
      | { type: "final"; data: AuraResponse }
      | { type: "error"; error: string };

    if (event.type === "status") callbacks.onStatus?.(event.status);
    if (event.type === "delta") {
      await emitDeltaSmoothly(event.delta, callbacks.onDelta);
    }
    if (event.type === "final") {
      setFinalData(event.data);
      callbacks.onFinal?.(event.data);
    }
    if (event.type === "error") {
      throw new Error(event.error || "AURA stream failed.");
    }
  }, Promise.resolve());
}

async function askAuraStreamWithXhr(
  args: AskAuraArgs,
  token: string,
  callbacks: AskAuraStreamCallbacks
) {
  return new Promise<AuraResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let processedLength = 0;
    let pendingBuffer = "";
    let finalData: AuraResponse | null = null;
    let isSettled = false;
    let processingQueue = Promise.resolve();

    const settleError = (error: unknown) => {
      if (isSettled) return;
      isSettled = true;
      reject(error instanceof Error ? error : new Error("AURA stream failed."));
    };

    const flushResponseText = () => {
      processingQueue = processingQueue.then(async () => {
        const responseText = xhr.responseText ?? "";
        if (responseText.length <= processedLength) return;
        const nextChunk = responseText.slice(processedLength);
        processedLength = responseText.length;
        pendingBuffer += nextChunk;
        const segments = pendingBuffer.split("\n");
        pendingBuffer = segments.pop() ?? "";
        await processEventLines(segments.join("\n"), callbacks, (data) => {
          finalData = data;
        });
      });
      return processingQueue;
    };

    xhr.open("POST", getAskAuraStreamUrl());
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.onprogress = () => {
      void flushResponseText().catch(settleError);
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        void flushResponseText()
          .then(async () => {
            await processingQueue;
            if (pendingBuffer.trim()) {
              await processEventLines(pendingBuffer, callbacks, (data) => {
                finalData = data;
              });
              pendingBuffer = "";
            }

            if (xhr.status < 200 || xhr.status >= 300) {
              throw new Error(xhr.responseText || "AURA stream failed.");
            }

            if (finalData) {
              if (!isSettled) {
                isSettled = true;
                resolve(finalData);
              }
              return;
            }

            const fallback = await askAura(args);
            callbacks.onFinal?.(fallback);
            if (!isSettled) {
              isSettled = true;
              resolve(fallback);
            }
          })
          .catch(settleError);
      }
    };

    xhr.onerror = () => settleError(new Error("AURA stream request failed."));
    xhr.ontimeout = () => settleError(new Error("AURA stream request timed out."));
    xhr.send(
      JSON.stringify({
        ...args,
      })
    );
  });
}

export async function askAuraStream(
  args: AskAuraArgs,
  callbacks: AskAuraStreamCallbacks = {}
): Promise<AuraResponse> {
  const currentUser = auth.currentUser;
  const token = await currentUser?.getIdToken();

  if (!token) {
    return askAura(args);
  }

  if (Platform.OS !== "web") {
    return askAuraStreamWithXhr(args, token, callbacks);
  }

  const response = await fetch(getAskAuraStreamUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "AURA stream failed.");
  }

  if (!response.body || typeof response.body.getReader !== "function") {
    const fallback = await askAura(args);
    callbacks.onFinal?.(fallback);
    return fallback;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalData: AuraResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    await processEventLines(lines.join("\n"), callbacks, (data) => {
      finalData = data;
    });
  }

  if (finalData) return finalData;

  const fallback = await askAura(args);
  callbacks.onFinal?.(fallback);
  return fallback;
}
