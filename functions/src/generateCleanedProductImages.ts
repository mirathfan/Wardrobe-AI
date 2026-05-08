import { getApps, initializeApp } from "firebase-admin/app";
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
    void event;
    return;
  }
);
