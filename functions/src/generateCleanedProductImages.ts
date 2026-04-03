import { getApps, initializeApp } from "firebase-admin/app";
import { logger } from "firebase-functions/v2";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

if (!getApps().length) {
  initializeApp();
}

export const generateCleanedProductImages = onDocumentWritten(
  {
    document: "users/{uid}/items/{itemId}",
    region: "us-central1",
    memory: "1GiB",
    timeoutSeconds: 60,
  },
  async (event) => {
    const uid = String(event.params.uid ?? "");
    const itemId = String(event.params.itemId ?? "");
    logger.info("Skipping cleaned image generation: ONNX disabled", { uid, itemId });
    return;
  }
);
