import { HttpsError } from "firebase-functions/v2/https";
import {
  assertFunctionRateLimit,
  dayLimit,
  minuteLimit,
  redactUid,
} from "./rateLimit";

type DocRef = {
  path: string;
  collection: (name: string) => CollectionRef;
};

type CollectionRef = {
  path: string;
  doc: (id: string) => DocRef;
};

const store = new Map<string, Record<string, unknown>>();
const writtenPaths: string[] = [];

function collectionRef(path: string): CollectionRef {
  return {
    path,
    doc: (id: string) => docRef(`${path}/${id}`),
  };
}

function docRef(path: string): DocRef {
  return {
    path,
    collection: (name: string) => collectionRef(`${path}/${name}`),
  };
}

const firestore = {
  collection: (name: string) => collectionRef(name),
  runTransaction: jest.fn(async (callback: (transaction: unknown) => Promise<void>) => {
    const transaction = {
      get: jest.fn(async (ref: DocRef) => ({
        data: () => store.get(ref.path),
      })),
      set: jest.fn((ref: DocRef, data: Record<string, unknown>) => {
        writtenPaths.push(ref.path);
        store.set(ref.path, {
          ...(store.get(ref.path) ?? {}),
          ...data,
        });
      }),
    };
    await callback(transaction);
  }),
};

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: () => firestore,
  Timestamp: {
    fromMillis: (millis: number) => ({ millis }),
  },
}));

jest.mock("./logger", () => ({
  logger: {
    warn: jest.fn(),
  },
}));

describe("assertFunctionRateLimit", () => {
  beforeEach(() => {
    store.clear();
    writtenPaths.length = 0;
    jest.spyOn(Date, "now").mockReturnValue(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("blocks after minuteLimit is exceeded", async () => {
    await assertFunctionRateLimit("minute-user", "parseOutfitIntent", [minuteLimit(1)]);

    await expect(
      assertFunctionRateLimit("minute-user", "parseOutfitIntent", [minuteLimit(1)]),
    ).rejects.toBeInstanceOf(HttpsError);
  });

  it("blocks after dayLimit is exceeded", async () => {
    await assertFunctionRateLimit("day-user", "parseOutfitIntent", [dayLimit(1)]);

    await expect(
      assertFunctionRateLimit("day-user", "parseOutfitIntent", [dayLimit(1)]),
    ).rejects.toMatchObject({ code: "resource-exhausted" });
  });

  it("keeps different function keys in separate buckets", async () => {
    const user = "shared-user";

    await assertFunctionRateLimit(user, "outfitChat", [minuteLimit(1)]);
    await assertFunctionRateLimit(user, "outfitGeneration", [minuteLimit(1)]);

    await expect(
      assertFunctionRateLimit(user, "outfitChat", [minuteLimit(1)]),
    ).rejects.toMatchObject({ code: "resource-exhausted" });
  });

  it("writes hashed user IDs instead of raw user IDs in document paths", async () => {
    const rawUserId = "raw-user-123";

    await assertFunctionRateLimit(rawUserId, "productSearch", [minuteLimit(1)]);

    expect(writtenPaths.some((path) => path.includes(rawUserId))).toBe(false);
    expect(writtenPaths.some((path) => path.includes(redactUid(rawUserId)))).toBe(true);
  });
});
