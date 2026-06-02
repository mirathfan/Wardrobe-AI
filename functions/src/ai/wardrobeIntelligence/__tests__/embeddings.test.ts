import { HttpsError } from "firebase-functions/v2/https";
import { createTextEmbedding, type OpenAIEmbeddingClient } from "../embeddings";

describe("createTextEmbedding", () => {
  const originalModel = process.env.AURA_EMBEDDING_MODEL;
  const originalDimensions = process.env.AURA_EMBEDDING_DIMENSIONS;

  beforeEach(() => {
    process.env.AURA_EMBEDDING_MODEL = "test-embedding-model";
    process.env.AURA_EMBEDDING_DIMENSIONS = "3";
  });

  afterEach(() => {
    if (originalModel === undefined) delete process.env.AURA_EMBEDDING_MODEL;
    else process.env.AURA_EMBEDDING_MODEL = originalModel;
    if (originalDimensions === undefined) delete process.env.AURA_EMBEDDING_DIMENSIONS;
    else process.env.AURA_EMBEDDING_DIMENSIONS = originalDimensions;
  });

  it("uses configured model and dimensions with a mocked OpenAI client", async () => {
    const create = jest.fn(async () => ({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    }));
    const client: OpenAIEmbeddingClient = { embeddings: { create } };

    await expect(createTextEmbedding("Category: top.", { client, maxRetries: 0 }))
      .resolves.toEqual([0.1, 0.2, 0.3]);

    expect(create).toHaveBeenCalledWith({
      model: "test-embedding-model",
      input: "Category: top.",
      dimensions: 3,
      encoding_format: "float",
    });
  });

  it("rejects empty input", async () => {
    const client: OpenAIEmbeddingClient = {
      embeddings: { create: jest.fn() },
    };

    await expect(createTextEmbedding("   ", { client, maxRetries: 0 }))
      .rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects dimension mismatches", async () => {
    const client: OpenAIEmbeddingClient = {
      embeddings: {
        create: jest.fn(async () => ({
          data: [{ embedding: [0.1, 0.2] }],
        })),
      },
    };

    await expect(createTextEmbedding("Category: top.", { client, maxRetries: 0 }))
      .rejects.toBeInstanceOf(HttpsError);
  });
});
