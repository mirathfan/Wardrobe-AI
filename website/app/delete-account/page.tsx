import type { Metadata } from "next";
import Link from "next/link";
import { PolicyShell } from "@/components/PolicyShell";
import { supportEmailHref, supportEmailLabel } from "@/lib/site";

export const metadata: Metadata = {
  title: "Delete Your AURA Account",
  description: "How to delete an AURA account and its user-scoped data.",
};

export default function DeleteAccountPage() {
  return (
    <PolicyShell
      eyebrow="Account / Privacy"
      title="Delete your AURA account"
      intro="A signed-in user can permanently delete their account from inside the AURA app."
    >
      <h2>Delete from the app</h2>
      <ol>
        <li>Open AURA and sign in to the account you want to delete.</li>
        <li>Open the <strong>Profile</strong> tab.</li>
        <li>Select <strong>Account</strong>.</li>
        <li>Scroll to <strong>Danger Zone</strong> and select <strong>Delete account</strong>.</li>
        <li>Review both confirmation prompts and choose <strong>Delete</strong> on the final prompt.</li>
      </ol>
      <p>After the backend reports success, AURA clears user-scoped local app data, signs the account out, and returns to the welcome screen.</p>

      <h2>Data covered by the deletion</h2>
      <p>The account-deletion backend removes the Firebase Authentication user, the user&apos;s Firestore document and nested subcollections, files stored under the user&apos;s Firebase Storage path, and known function rate-limit records linked to the account. This includes user-scoped closet items and images, AURA chats, saved looks, outfit plans, preferences, and related metadata stored beneath the account.</p>

      <h2>Practical retention limits</h2>
      <p>The primary user-scoped deletion runs as part of the in-app request. Operational logs, processor logs, backups, and non-user-specific product caches may remain for limited periods according to the applicable provider&apos;s retention practices.</p>

      <h2>If you cannot access AURA</h2>
      <p>Contact {supportEmailHref ? <a href={supportEmailHref}>{supportEmailLabel}</a> : <strong>{supportEmailLabel}</strong>} from the email associated with your beta account. Do not send your password or authentication tokens.</p>
      <p>For more information, read the <Link href="/privacy">Privacy Policy</Link>.</p>
    </PolicyShell>
  );
}
