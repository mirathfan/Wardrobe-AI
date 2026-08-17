import type { Metadata } from "next";
import { PolicyShell } from "@/components/PolicyShell";
import {
  policyUpdatedLabel,
  supportEmailHref,
  supportEmailLabel,
} from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Use — AURA",
  description: "Terms for using the AURA AI Personal Stylist beta.",
};

export default function TermsPage() {
  return (
    <PolicyShell
      eyebrow="Terms / Beta"
      title="Terms of Use"
      intro="Plain-language terms for participating in the AURA beta."
    >
      <p className="policy-updated">Last updated {policyUpdatedLabel}. These terms require owner approval before external distribution.</p>

      <h2>Beta service</h2>
      <p>AURA is beta software. Features may be incomplete, limited, changed, paused, or removed. Access may be restricted while issues are fixed, costs are controlled, or the service is prepared for release.</p>

      <h2>AI recommendations</h2>
      <p>AURA provides AI-generated styling suggestions for personal organization and informational use. Recommendations may be inaccurate, incomplete, repetitive, unsuitable for an occasion, or inconsistent with your needs. Use your own judgment before wearing an outfit, buying an item, following care guidance, or relying on any recommendation.</p>

      <h2>Products and shopping</h2>
      <p>AURA may display product links, prices, availability, metadata, recommendations, or affiliate links. AURA does not guarantee price, availability, sizing, quality, merchant policies, delivery, or returns. Product information may be delayed or incorrect.</p>

      <h2>Your content</h2>
      <p>You retain ownership of the photos, messages, wardrobe information, links, and other content you provide. You permit AURA and its service providers to store, process, display, and transmit that content as needed to operate, secure, and troubleshoot the service. You must have the right to provide the content you upload.</p>

      <h2>Acceptable use</h2>
      <p>Do not upload illegal, abusive, infringing, or non-consensual content; submit passwords, private keys, tokens, or other credentials; bypass authentication, quotas, or rate limits; scrape or overload the service; reverse engineer protected parts of the service; or use AURA in a way that harms users or third-party systems.</p>

      <h2>Availability and accounts</h2>
      <p>You are responsible for your account activity. AURA may limit, suspend, or end beta access for security, legal, abuse-prevention, cost-control, or reliability reasons. You may stop using AURA or delete your account at any time.</p>

      <h2>Third-party services</h2>
      <p>AURA depends on third-party services including Firebase, Google Cloud, OpenAI, Apple, Google Sign-In, Sentry, and optional weather, search, merchant, or affiliate providers. Those services may have their own terms and policies.</p>

      <h2>No warranty</h2>
      <p>AURA is provided &quot;as is&quot; and &quot;as available.&quot; To the extent permitted by law, no guarantee is made that the beta will be uninterrupted, secure, accurate, error-free, or available at all times.</p>

      <h2>Limitation</h2>
      <p>To the maximum extent permitted by law, AURA and its owner will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, lost profits, data loss, purchases, wardrobe decisions, event outcomes, or reliance on AI-generated suggestions.</p>

      <h2>Changes and contact</h2>
      <p>These terms may be updated as AURA changes. Questions can be sent to {supportEmailHref ? <a href={supportEmailHref}>{supportEmailLabel}</a> : <strong>{supportEmailLabel}</strong>}.</p>
    </PolicyShell>
  );
}
