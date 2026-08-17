import OpenAI from "openai";
import { HttpsError } from "firebase-functions/v2/https";
import { requireOpenAiApiKey } from "../../shared/env";
import {
  EMBEDDING_ENCODING_FORMAT,
  wardrobeIntelligenceConfig,
} from "./config";

type EmbeddingCreateArgs = {
  model: string;
  input: string;
  dimensions: number;
  encoding_format: typeof EMBEDDING_ENCODING_FORMAT;
};

export type OpenAIEmbeddingClient = {
  embeddings: {
    create: (args: EmbeddingCreateArgs) => Promise<{
      data?: { embedding?: number[] }[];
    }>;
  };
};

type CreateTextEmbeddingOptions = {
  client?: OpenAIEmbeddingClient;
  maxRetries?: number;
};

function defaultClient(): OpenAIEmbeddingClient {
  return new OpenAI({
    apiKey: requireOpenAiApiKey(),
  }) as OpenAIEmbeddingClient;
}

function isTransientOpenAIError(error: unknown): boolean {
  const status = Number((error as { status?: unknown })?.status);
  if (Number.isFinite(status) && (status === 408 || status === 409 || status === 429 || status >= 500)) {
    return true;
  }
  const code = String((error as { code?: unknown })?.code ?? "").toLowerCase();
  return code === "etimedout" || code === "econnreset" || code === "rate_limit_exceeded";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createTextEmbedding(
  input: string,
  options: CreateTextEmbeddingOptions = {},
): Promise<number[]> {
  const text = String(input ?? "").trim();
  if (!text) {
    throw new HttpsError("invalid-argument", "Embedding input cannot be empty.");
  }

  const config = wardrobeIntelligenceConfig();
  const client = options.client ?? defaultClient();
  const maxRetries = options.maxRetries ?? 2;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await client.embeddings.create({
        model: config.embeddingModel,
        input: text,
        dimensions: config.embeddingDimensions,
        encoding_format: EMBEDDING_ENCODING_FORMAT,
      });
      const embedding = response.data?.[0]?.embedding;
      if (!Array.isArray(embedding)) {
        throw new HttpsError("internal", "OpenAI returned an invalid embedding response.");
      }
      if (embedding.length !== config.embeddingDimensions) {
        throw new HttpsError(
          "internal",
          `OpenAI embedding dimension mismatch: expected ${config.embeddingDimensions}, received ${embedding.length}.`,
        );
      }
      return embedding;
    } catch (error) {
      lastError = error;
      if (error instanceof HttpsError || attempt >= maxRetries || !isTransientOpenAIError(error)) {
        break;
      }
      await sleep(250 * 2 ** attempt);
    }
  }

  if (lastError instanceof HttpsError) throw lastError;
  throw new HttpsError("internal", "Could not generate wardrobe intelligence embedding.");
}
