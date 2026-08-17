import type { Metadata } from "next";
import Link from "next/link";
import { PolicyShell } from "@/components/PolicyShell";
import {
  policyUpdatedLabel,
  supportEmailHref,
  supportEmailLabel,
} from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy — AURA",
  description: "How AURA handles account, wardrobe, AI, and diagnostic data during beta.",
};

export default function PrivacyPage() {
  return (
    <PolicyShell
      eyebrow="Privacy / Beta"
      title="Privacy Policy"
      intro="How AURA handles the information needed to build your digital closet and provide AI styling features."
    >
      <p className="policy-updated">Last updated {policyUpdatedLabel}. This policy is prepared for AURA&apos;s beta and requires owner approval before external distribution.</p>

      <h2>Information AURA processes</h2>
      <p>AURA may process account identifiers, email address, display name, authentication provider, style and fit preferences, closet item details, clothing photos, edited or background-removed images, chat messages, saved and planned outfits, wear history, feedback, and product links or metadata you submit.</p>
      <p>If you grant permission, AURA may use location for local weather, read selected calendar context for outfit planning, and use microphone or speech input for voice chat. You can deny or revoke these permissions in iOS Settings.</p>

      <h2>How the information is used</h2>
      <p>AURA uses this information to authenticate you, store and organize your closet, process garment images, extract item details, generate closet-grounded styling suggestions, import product information, plan outfits, remember styling feedback, prevent abuse, enforce quotas, troubleshoot failures, and operate the beta.</p>

      <h2>AI and cloud processing</h2>
      <p>AURA uses Firebase and Google Cloud for authentication, Firestore, file storage, Cloud Functions, and operational logs. Selected prompts, conversation context, wardrobe metadata, profile preferences, product metadata, images, or temporary audio may be sent to OpenAI when required to provide an AI feature. AURA is designed not to send authentication tokens or unnecessary account contact information in AI requests.</p>

      <h2>Service providers</h2>
      <p>Depending on enabled beta features, AURA may use Firebase and Google Cloud, OpenAI, Apple, Google Sign-In, Sentry, weather services such as Open-Meteo, and shopping/search or affiliate providers. Product search and affiliate functionality may remain disabled during beta.</p>

      <h2>Diagnostics</h2>
      <p>AURA uses Sentry when configured to receive crash and error diagnostics. The integration disables default PII collection, scrubs sensitive fields and user content, and uses an anonymous hashed user identifier. Operational logs may also be retained by Firebase or Google Cloud.</p>

      <h2>Sharing and sale</h2>
      <p>AURA does not sell personal information. Information is shared with service providers only as needed to operate, secure, diagnose, or provide the requested feature, or when required by law.</p>

      <h2>Retention and deletion</h2>
      <p>User-scoped account, closet, chat, outfit, preference, and image data is generally kept until you remove the content or delete your account. Operational logs, processor logs, backups, and non-user-specific caches may remain for limited periods under provider retention practices.</p>
      <p>Signed-in users can delete their account through <strong>Profile → Account → Danger Zone → Delete account</strong>. The deletion backend removes the Firebase Authentication user, the user&apos;s Firestore document tree, owned files under the user&apos;s Storage path, and known user-linked rate-limit records. Read the <Link href="/delete-account">account deletion instructions</Link>.</p>

      <h2>Your choices</h2>
      <p>You can manage device permissions, edit or delete supported content, stop using beta features, or delete your account. For privacy or deletion help, {supportEmailHref ? <a href={supportEmailHref}>{supportEmailLabel}</a> : <strong>{supportEmailLabel}</strong>}.</p>

      <h2>Children</h2>
      <p>AURA is not directed to children. The final minimum age and App Store age rating require owner approval before external beta distribution.</p>

      <h2>Changes and contact</h2>
      <p>This policy may change as the beta evolves. Material updates will be reflected on this page. Questions can be sent to {supportEmailHref ? <a href={supportEmailHref}>{supportEmailLabel}</a> : <strong>{supportEmailLabel}</strong>}.</p>
    </PolicyShell>
  );
}
