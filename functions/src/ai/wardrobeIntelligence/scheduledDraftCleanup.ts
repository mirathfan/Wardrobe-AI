import { FieldPath, getFirestore, type WriteBatch } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger, tracedHandler } from "../../shared/logger";
import { redactUid } from "../../shared/rateLimit";
import {
  DEFAULT_DRAFT_CLEANUP_CUTOFF_DAYS,
  cutoffTimestampForDays,
  getDraftCleanupReason,
  isAutoDeleteSafeAbandonedDraft,
} from "./draftCleanup";
import type { ClosetItemDocument } from "./types";

const SCHEDULED_DRAFT_CLEANUP_DELETE_CAP = 1000;
const USER_BATCH_SIZE = 100;
const USER_DRAFT_SCAN_LIMIT = 100;
const FIRESTORE_DELETE_BATCH_LIMIT = 400;
const MAX_SCHEDULED_USERS_PER_RUN = 500;

async function commitBatch(batch: WriteBatch, pendingWrites: number) {
  if (pendingWrites > 0) await batch.commit();
}

export const cleanupAbandonedDraftClosetItems = onSchedule(
  {
    schedule: "every day 03:15",
    timeZone: "America/Chicago",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  tracedHandler(async () => {
    const db = getFirestore();
    const cutoffDays = DEFAULT_DRAFT_CLEANUP_CUTOFF_DAYS;
    const cutoffMs = cutoffTimestampForDays(cutoffDays);
    let userCursor: string | null = null;
    let usersScanned = 0;
    let usersWithDrafts = 0;
    let totalChecked = 0;
    let totalDeleted = 0;
    let totalSkipped = 0;
    let batchNumber = 0;
    let hasMoreUsers = false;

    logger.info("[AURA_DRAFT_CLEANUP] started", {
      cutoffDays,
      deleteCap: SCHEDULED_DRAFT_CLEANUP_DELETE_CAP,
    });

    do {
      let usersQuery = db
        .collection("users")
        .orderBy(FieldPath.documentId())
        .limit(USER_BATCH_SIZE);
      if (userCursor) usersQuery = usersQuery.startAfter(userCursor);

      const usersSnap = await usersQuery.get();
      batchNumber += 1;
      hasMoreUsers = usersSnap.size === USER_BATCH_SIZE;
      if (usersSnap.empty) break;

      for (const userDoc of usersSnap.docs) {
        if (totalDeleted >= SCHEDULED_DRAFT_CLEANUP_DELETE_CAP) break;
        if (usersScanned >= MAX_SCHEDULED_USERS_PER_RUN) break;

        usersScanned += 1;
        const remainingDeletes = SCHEDULED_DRAFT_CLEANUP_DELETE_CAP - totalDeleted;
        const itemsSnap = await userDoc.ref
          .collection("items")
          .where("isDraft", "==", true)
          .limit(Math.min(USER_DRAFT_SCAN_LIMIT, remainingDeletes))
          .get();

        if (itemsSnap.empty) continue;
        usersWithDrafts += 1;

        let userChecked = 0;
        let userDeleted = 0;
        let userSkipped = 0;
        let batch = db.batch();
        let pendingWrites = 0;

        for (const itemDoc of itemsSnap.docs) {
          if (totalDeleted >= SCHEDULED_DRAFT_CLEANUP_DELETE_CAP) break;
          const freshSnap = await itemDoc.ref.get();
          if (!freshSnap.exists) continue;

          userChecked += 1;
          totalChecked += 1;
          const item = { id: freshSnap.id, ...freshSnap.data() } as ClosetItemDocument;
          const reason = getDraftCleanupReason(item, cutoffMs, cutoffDays);
          if (!isAutoDeleteSafeAbandonedDraft(item, cutoffMs)) {
            userSkipped += 1;
            totalSkipped += 1;
            continue;
          }

          batch.delete(itemDoc.ref);
          pendingWrites += 1;
          userDeleted += 1;
          totalDeleted += 1;

          if (pendingWrites >= FIRESTORE_DELETE_BATCH_LIMIT) {
            await commitBatch(batch, pendingWrites);
            batch = db.batch();
            pendingWrites = 0;
          }

          logger.info("[AURA_DRAFT_CLEANUP] deleted abandoned draft", {
            uidHash: redactUid(userDoc.id),
            itemId: itemDoc.id,
            reason,
          });
        }

        await commitBatch(batch, pendingWrites);

        logger.info("[AURA_DRAFT_CLEANUP] user summary", {
          uidHash: redactUid(userDoc.id),
          checked: userChecked,
          deleted: userDeleted,
          skipped: userSkipped,
        });
      }

      userCursor = usersSnap.docs[usersSnap.docs.length - 1]?.id ?? null;
      // TODO: Move this to a collection-group cleanup query if the user base grows beyond the daily scan cap.
      if (usersScanned >= MAX_SCHEDULED_USERS_PER_RUN) break;
    } while (hasMoreUsers && userCursor && totalDeleted < SCHEDULED_DRAFT_CLEANUP_DELETE_CAP);

    logger.info("[AURA_DRAFT_CLEANUP] completed", {
      cutoffDays,
      usersScanned,
      usersWithDrafts,
      totalChecked,
      totalDeleted,
      totalSkipped,
      batchesExecuted: batchNumber,
      stoppedAtDeleteCap: totalDeleted >= SCHEDULED_DRAFT_CLEANUP_DELETE_CAP,
      stoppedAtUserCap: usersScanned >= MAX_SCHEDULED_USERS_PER_RUN && hasMoreUsers,
    });
  }),
);
