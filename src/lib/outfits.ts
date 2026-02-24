import {
    arrayRemove,
    arrayUnion,
    doc,
    serverTimestamp,
    setDoc,
    updateDoc,
} from "firebase/firestore";
import { auth, db } from "./firebase";

export function toDateKey(d: Date) {
  // YYYY-MM-DD (local)
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function outfitDocRef(dateKey: string) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  return doc(db, "users", user.uid, "outfits", dateKey);
}

/** Add item to outfit for a date */
export async function addItemToOutfit(dateKey: string, itemId: string, planned = true) {
  const ref = outfitDocRef(dateKey);

  // setDoc with merge creates the doc if it doesn't exist
  await setDoc(
    ref,
    {
      dateKey,
      planned,
      itemIds: arrayUnion(itemId),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Remove item from outfit for a date */
export async function removeItemFromOutfit(dateKey: string, itemId: string) {
  const ref = outfitDocRef(dateKey);
  await updateDoc(ref, {
    itemIds: arrayRemove(itemId),
    updatedAt: serverTimestamp(),
  });
}

/** Mark outfit as worn (not planned anymore) */
export async function markOutfitWorn(dateKey: string) {
  const ref = outfitDocRef(dateKey);
  await setDoc(
    ref,
    { planned: false, updatedAt: serverTimestamp() },
    { merge: true }
  );
}
