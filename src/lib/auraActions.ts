import { logAuraLookStyleEvent } from "@/src/lib/auraMemory";
import { saveAuraLook, type SavedAuraLookRecord } from "@/src/lib/auraLooks";
import { saveAuraOutfitFeedback } from "@/src/lib/auraOutfitFeedback";
import { Toast } from "@/src/lib/toast";
import { markOutfitWorn, planOutfitForToday } from "@/src/lib/wearOutfit";
import type { AuraLook, AuraLookAction, AuraLookOptionMeta } from "@/src/types/aura";

type AuraAlertButton = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
};

type AuraLookActionFeedbackContext = {
  chatId?: string | null;
  messageId?: string | null;
  option?: AuraLookOptionMeta | null;
};

export type HandleAuraLookActionOptions = {
  uid?: string | null;
  action: AuraLookAction;
  look?: AuraLook | null;
  promptBase?: string | null;
  saveTitle?: string | null;
  feedbackContext?: AuraLookActionFeedbackContext | null;
  onPrompt: (prompt: string) => void | Promise<void>;
  onAlert: (title: string, message: string, buttons?: AuraAlertButton[]) => void;
  onSavedLook?: (saved: SavedAuraLookRecord) => void;
  onAfterSave?: () => void | Promise<void>;
  onAfterPlan?: () => void | Promise<void>;
  onAfterWear?: () => void | Promise<void>;
};

export function buildAuraLookFeedbackPrompt(action: AuraLookAction, promptBase: string) {
  if (action === "notMyVibe") {
    return `Take this in a different direction from ${promptBase}. Keep it polished, but shift the palette, silhouette, or overall attitude so it feels more like me.`;
  }
  if (action === "showMoreLikeThis") {
    return `Show me 3 more looks in the same lane as ${promptBase}, but vary the styling so they do not feel repetitive.`;
  }
  if (action === "lessLikeThis") {
    return `Pull away from ${promptBase}. Keep the same level of polish, but give me a noticeably different palette, silhouette, or vibe.`;
  }
  return "";
}

async function saveLookFeedback(
  uid: string,
  feedbackType: "outfit_liked" | "outfit_disliked",
  look: AuraLook,
  feedbackContext?: AuraLookActionFeedbackContext | null,
) {
  if (!feedbackContext) return;
  await saveAuraOutfitFeedback(uid, {
    feedbackType,
    look,
    chatId: feedbackContext.chatId,
    messageId: feedbackContext.messageId,
    option: feedbackContext.option,
    source: "aura",
  });
}

export async function handleSharedAuraLookAction({
  uid,
  action,
  look,
  promptBase,
  saveTitle,
  feedbackContext,
  onPrompt,
  onAlert,
  onSavedLook,
  onAfterSave,
  onAfterPlan,
  onAfterWear,
}: HandleAuraLookActionOptions) {
  if (!uid || !look) return false;

  const base = promptBase ?? look.lookTitle ?? "this look";

  if (action === "saveLook") {
    try {
      const saved = await saveAuraLook(uid, look, { title: saveTitle ?? base });
      onSavedLook?.(saved);
      void onAfterSave?.();
      Toast.saved();
    } catch (error: any) {
      if (__DEV__) {
        console.error("SAVE LOOK UI ERROR:", error);
      }
      Toast.error("Save failed", "Couldn’t save this look. Please try again.");
    }
    return true;
  }

  if (action === "planForToday") {
    try {
      await planOutfitForToday({
        uid,
        source: "aura",
        title: base,
        look,
      });
      void onAfterPlan?.();
      Toast.success("Planned", "This look is now attached to today.");
    } catch (error: any) {
      Toast.error("Plan failed", error?.message ?? "Unable to plan this look for today.");
    }
    return true;
  }

  if (action === "wearToday") {
    try {
      const result = await markOutfitWorn({
        uid,
        source: "aura",
        title: base,
        look,
      });
      void onAfterWear?.();
      Toast.success(
        result.alreadyMarked ? "Already marked worn today" : "Marked as worn today",
        result.alreadyMarked ? "AURA will not double-count it." : undefined,
      );
    } catch (error: any) {
      Toast.error("Couldn't mark worn. Try again.", error?.message);
    }
    return true;
  }

  if (action === "likeLook") {
    await logAuraLookStyleEvent(uid, "outfit_liked", look, { source: "aura" });
    await saveLookFeedback(uid, "outfit_liked", look, feedbackContext);
    onAlert("Noted", "AURA will keep more of this energy in rotation.");
    return true;
  }

  if (action === "notMyVibe") {
    await logAuraLookStyleEvent(uid, "outfit_disliked", look, { source: "aura" });
    await saveLookFeedback(uid, "outfit_disliked", look, feedbackContext);
    void onPrompt(buildAuraLookFeedbackPrompt(action, base));
    return true;
  }

  if (action === "showMoreLikeThis") {
    void logAuraLookStyleEvent(uid, "more_like_this", look, { source: "aura" });
    void onPrompt(buildAuraLookFeedbackPrompt(action, base));
    return true;
  }

  if (action === "lessLikeThis") {
    await logAuraLookStyleEvent(uid, "less_like_this", look, { source: "aura" });
    void onPrompt(buildAuraLookFeedbackPrompt(action, base));
    return true;
  }

  if (action === "shopMissingPieces") {
    const missingPieces = look.addToComplete.filter(Boolean);
    onAlert(
      "Missing pieces",
      missingPieces.length
        ? missingPieces.join("\n")
        : "AURA does not see any missing pieces in this look yet.",
      missingPieces.length
        ? [
            { text: "Close", style: "cancel" },
            {
              text: "Create shopping brief",
              onPress: () =>
                void onPrompt(
                  `Turn ${base} into a concise shopping brief. Tell me what is actually missing from my wardrobe, what matters most to buy first, and what can wait.`,
                ),
            },
          ]
        : [{ text: "Close", style: "cancel" }],
    );
    return true;
  }

  if (action === "useOnlyMyCloset") {
    void onPrompt(`Fix ${base} using only my closet. Keep the same overall intent, but make it feel more resolved with pieces I already own.`);
    return true;
  }

  if (action === "makeItDressier") {
    void onPrompt(`Fix ${base} and make it dressier. Keep it polished, tasteful, and still like me.`);
    return true;
  }

  return false;
}
