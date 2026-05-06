import { deleteDoc, doc } from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";

import { db, storage } from "./firebase";

type DeleteCleanupResult = {
  attempted: number;
  failed: number;
};

function isOwnedItemStoragePath(uid: string, itemId: string, path: string) {
  const prefix = `users/${uid}/items/${itemId}`;
  return path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}/`);
}

function storagePathFromValue(uid: string, itemId: string, value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("file:")) {
    return null;
  }

  if (isOwnedItemStoragePath(uid, itemId, raw)) return raw;

  if (raw.startsWith("gs://")) {
    const path = raw.replace(/^gs:\/\/[^/]+\//, "");
    return isOwnedItemStoragePath(uid, itemId, path) ? path : null;
  }

  try {
    const url = new URL(raw);
    if (!/firebasestorage\.googleapis\.com$/i.test(url.hostname)) return null;
    const marker = "/o/";
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    const encodedPath = url.pathname.slice(markerIndex + marker.length);
    const path = decodeURIComponent(encodedPath);
    return isOwnedItemStoragePath(uid, itemId, path) ? path : null;
  } catch {
    return null;
  }
}

function collectOwnedStoragePaths(uid: string, itemId: string, value: unknown, paths: Set<string>, depth = 0) {
  if (depth > 6 || value == null) return;
  if (typeof value === "string") {
    const path = storagePathFromValue(uid, itemId, value);
    if (path) paths.add(path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectOwnedStoragePaths(uid, itemId, entry, paths, depth + 1));
    return;
  }
  if (typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((entry) =>
      collectOwnedStoragePaths(uid, itemId, entry, paths, depth + 1),
    );
  }
}

export async function deleteOwnedItemStorage(
  uid: string,
  itemId: string,
  item: unknown,
): Promise<DeleteCleanupResult> {
  const paths = new Set<string>();
  collectOwnedStoragePaths(uid, itemId, item, paths);
  const results = await Promise.allSettled(
    Array.from(paths).map(async (path) => {
      try {
        await deleteObject(ref(storage, path));
      } catch (error) {
        if ((error as { code?: unknown })?.code === "storage/object-not-found") return;
        throw error;
      }
    }),
  );
  return {
    attempted: paths.size,
    failed: results.filter((result) => result.status === "rejected").length,
  };
}

export async function deleteWardrobeItem(uid: string, itemId: string, item: unknown) {
  const cleanup = await deleteOwnedItemStorage(uid, itemId, item).catch(() => ({
    attempted: 0,
    failed: 1,
  }));
  await deleteDoc(doc(db, "users", uid, "items", itemId));
  return cleanup;
}
