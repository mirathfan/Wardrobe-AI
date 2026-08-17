import { createHash } from "node:crypto";

export function hashEmbeddingInput(
  embeddingText: string,
  aiMetadataVersion: number,
  embeddingTextVersion: number,
  embeddingModel: string,
  embeddingDimensions: number,
): string {
  return createHash("sha256")
    .update(JSON.stringify({
      embeddingText,
      aiMetadataVersion,
      embeddingTextVersion,
      embeddingModel,
      embeddingDimensions,
    }))
    .digest("hex");
}
