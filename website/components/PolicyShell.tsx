import Link from "next/link";

type PolicyShellProps = {
  eyebrow: string;
  title: string;
  intro: string;
  children: React.ReactNode;
};

const policyLinks = [
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
  ["Support", "/support"],
  ["Delete account", "/delete-account"],
] as const;

export function PolicyShell({ eyebrow, title, intro, children }: PolicyShellProps) {
  return (
    <div className="policy-page">
      <header className="policy-header">
        <Link className="wordmark" href="/" aria-label="AURA home">AURA®</Link>
        <nav aria-label="Policy navigation">
          {policyLinks.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
      </header>

      <main className="policy-main">
        <div className="policy-hero">
          <p className="section-index">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{intro}</p>
        </div>
        <article className="policy-card">{children}</article>
      </main>

      <footer className="policy-footer">
        <p>© 2026 AURA. Beta product information.</p>
        <Link href="/">Return to AURA</Link>
      </footer>
    </div>
  );
}
