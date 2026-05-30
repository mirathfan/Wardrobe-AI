import { getApps, initializeApp } from "firebase-admin/app";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { tracedHandler } from "./shared/logger";

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
  tracedHandler(async (event) => {
    void event;
    return;
  })
);
