import { auth } from "./firebase";

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
  return `users/${user.uid}/outfits/${dateKey}`;
}

/** Add item to outfit for a date */
export async function addItemToOutfit(dateKey: string, itemId: string, planned = true) {
  throw new Error(
    `Legacy outfit writer is disabled for ${outfitDocRef(
      dateKey
    )}. Use savePlannedOutfit()/markOutfitWorn() from src/utils/dailyOutfits instead.`
  );
}

/** Remove item from outfit for a date */
export async function removeItemFromOutfit(dateKey: string, itemId: string) {
  throw new Error(
    `Legacy outfit writer is disabled for ${outfitDocRef(
      dateKey
    )}. Use Firestore planner helpers from src/utils/dailyOutfits instead.`
  );
}

/** Mark outfit as worn (not planned anymore) */
export async function markOutfitWorn(dateKey: string) {
  throw new Error(
    `Legacy outfit writer is disabled for ${outfitDocRef(
      dateKey
    )}. Use markOutfitWorn(uid, dateKey, wornOutfit) from src/utils/dailyOutfits instead.`
  );
}
