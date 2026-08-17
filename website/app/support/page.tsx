import type { Metadata } from "next";
import Link from "next/link";
import { PolicyShell } from "@/components/PolicyShell";
import { supportEmailHref, supportEmailLabel } from "@/lib/site";

export const metadata: Metadata = {
  title: "Support — AURA",
  description: "Troubleshooting and beta support for AURA.",
};

export default function SupportPage() {
  return (
    <PolicyShell
      eyebrow="Support / Early access"
      title="AURA Support"
      intro="Help with the AURA beta, account access, closet processing, and styling features."
    >
      <h2>Quick troubleshooting</h2>
      <ul>
        <li>Confirm you are using the newest AURA build available in TestFlight.</li>
        <li>Force close and reopen AURA after a stalled upload or chat response.</li>
        <li>Check your network connection before retrying photo processing, AURA chat, or product import.</li>
        <li>Review camera, photo, location, calendar, microphone, and speech permissions in iOS Settings.</li>
        <li>For sign-in trouble, confirm the same email or Apple/Google provider used to create the account.</li>
      </ul>

      <h2>Report a beta problem</h2>
      <p>Send feedback from TestFlight or email {supportEmailHref ? <a href={supportEmailHref}>{supportEmailLabel}</a> : <strong>{supportEmailLabel}</strong>}. Include the AURA build number, iPhone model, iOS version, feature area, steps to reproduce, expected result, actual result, and a screenshot when useful.</p>
      <p>Do not send passwords, authentication tokens, private keys, full private product URLs, or sensitive personal information.</p>

      <h2>Account and privacy help</h2>
      <p>If you can sign in, use the in-app deletion control described on the <Link href="/delete-account">delete-account page</Link>. If you cannot access the app, contact support from the email associated with your beta account and describe the help you need.</p>

      <div className="policy-link-row">
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/terms">Terms of Use</Link>
        <Link href="/delete-account">Delete account</Link>
      </div>
    </PolicyShell>
  );
}
