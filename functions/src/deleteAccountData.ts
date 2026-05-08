import { getAuth } from "firebase-admin/auth";
import {
  CollectionReference,
  DocumentReference,
  getFirestore,
  WriteBatch,
} from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  RATE_LIMITS,
  assertFunctionRateLimit,
  redactUid,
} from "./shared/rateLimit";

const FIRESTORE_BATCH_LIMIT = 400;
const STORAGE_DELETE_BATCH_LIMIT = 100;

type DeleteCounts = {
  firestoreDocumentsDeleted: number;
  storageFilesDeleted: number;
  rateLimitDocumentsDeleted: number;
  authUserDeleted: boolean;
};

async function commitBatch(batch: WriteBatch, pendingWrites: number) {
  if (pendingWrites > 0) await batch.commit();
}

async function deleteDocumentTree(docRef: DocumentReference): Promise<number> {
  let deleted = 0;
  const subcollections = await docRef.listCollections();
  for (const subcollection of subcollections) {
    deleted += await deleteCollectionTree(subcollection);
  }
  await docRef.delete();
  return deleted + 1;
}

async function deleteCollectionTree(collectionRef: CollectionReference): Promise<number> {
  let deleted = 0;
  let hasMoreDocuments = true;
  while (hasMoreDocuments) {
    const snapshot = await collectionRef.limit(FIRESTORE_BATCH_LIMIT).get();
    if (snapshot.empty) {
      hasMoreDocuments = false;
      continue;
    }

    let batch = getFirestore().batch();
    let pendingWrites = 0;
    for (const doc of snapshot.docs) {
      const subcollections = await doc.ref.listCollections();
      for (const subcollection of subcollections) {
        deleted += await deleteCollectionTree(subcollection);
      }
      batch.delete(doc.ref);
      pendingWrites += 1;
      deleted += 1;
      if (pendingWrites >= FIRESTORE_BATCH_LIMIT) {
        await commitBatch(batch, pendingWrites);
        batch = getFirestore().batch();
        pendingWrites = 0;
      }
    }
    await commitBatch(batch, pendingWrites);
  }
  return deleted;
}

async function deleteUserStorageFiles(uid: string) {
  const bucket = getStorage().bucket();
  const [files] = await bucket.getFiles({ prefix: `users/${uid}/` });
  for (let index = 0; index < files.length; index += STORAGE_DELETE_BATCH_LIMIT) {
    const chunk = files.slice(index, index + STORAGE_DELETE_BATCH_LIMIT);
    await Promise.all(
      chunk.map((file) =>
        file.delete().catch((error) => {
          if ((error as { code?: unknown })?.code === 404) return;
          throw error;
        }),
      ),
    );
  }
  return files.length;
}

async function deleteUserRateLimitDocs(uidHash: string) {
  let deleted = 0;
  const db = getFirestore();
  for (const endpoint of Object.keys(RATE_LIMITS)) {
    const userRef = db
      .collection("functionRateLimits")
      .doc(endpoint)
      .collection("users")
      .doc(uidHash);
    const windows = await userRef.collection("windows").get();
    let batch = db.batch();
    let pendingWrites = 0;
    for (const docSnap of windows.docs) {
      batch.delete(docSnap.ref);
      pendingWrites += 1;
      deleted += 1;
      if (pendingWrites >= FIRESTORE_BATCH_LIMIT) {
        await commitBatch(batch, pendingWrites);
        batch = db.batch();
        pendingWrites = 0;
      }
    }
    batch.delete(userRef);
    pendingWrites += 1;
    deleted += 1;
    await commitBatch(batch, pendingWrites);
  }
  return deleted;
}

export const deleteAccountData = onCall(
  { timeoutSeconds: 540, memory: "512MiB" },
  async (request): Promise<{ ok: true } & DeleteCounts> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be signed in.");
    }

    const requestedUid = String(request.data?.uid ?? "").trim();
    if (requestedUid && requestedUid !== uid) {
      throw new HttpsError("permission-denied", "You can only delete your own account data.");
    }
    await assertFunctionRateLimit(uid, "accountDelete", RATE_LIMITS.accountDelete);
    const uidHash = redactUid(uid);

    const userRef = getFirestore().collection("users").doc(uid);
    logger.info("[ACCOUNT_DELETE] starting account data deletion", { uidHash });

    const firestoreDocumentsDeleted = await deleteDocumentTree(userRef);
    const storageFilesDeleted = await deleteUserStorageFiles(uid);
    const rateLimitDocumentsDeleted = await deleteUserRateLimitDocs(uidHash);
    let authUserDeleted = false;
    try {
      await getAuth().deleteUser(uid);
      authUserDeleted = true;
    } catch (error) {
      if ((error as { code?: unknown })?.code !== "auth/user-not-found") {
        logger.error("[ACCOUNT_DELETE] auth deletion failed", {
          uidHash,
          firestoreDocumentsDeleted,
          storageFilesDeleted,
          rateLimitDocumentsDeleted,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new HttpsError("internal", "Account data was deleted, but Auth deletion failed.");
      }
    }

    logger.info("[ACCOUNT_DELETE] account data deletion complete", {
      uidHash,
      firestoreDocumentsDeleted,
      storageFilesDeleted,
      rateLimitDocumentsDeleted,
      authUserDeleted,
    });

    return {
      ok: true,
      firestoreDocumentsDeleted,
      storageFilesDeleted,
      rateLimitDocumentsDeleted,
      authUserDeleted,
    };
  },
);
