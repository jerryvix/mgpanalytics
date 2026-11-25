import { useEffect, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router-dom";
import privacyPolicy from "../../docs/legal/privacy-policy.md?raw";
import termsOfUse from "../../docs/legal/terms-of-use.md?raw";

// Privacy Policy, Terms of Use and Support (D-110). The policy and terms render straight
// from docs/legal/*.md, so the repo copy and the live page can't drift. The app's Profile
// links here (mobile/src/constants/links.ts), and so does the App Store listing.

export const SUPPORT_EMAIL = "support@mgp-analytics.com";

const md: Components = {
  h1: ({ children }) => <h1 className="text-3xl font-semibold tracking-tight text-foreground mb-3">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-semibold text-foreground mt-10 mb-3">{children}</h2>,
  h3: ({ children }) => <h3 className="text-base font-semibold text-foreground mt-6 mb-2">{children}</h3>,
  p: ({ children }) => <p className="text-sm leading-7 text-foreground/80 my-3">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 space-y-1.5 text-sm leading-7 text-foreground/80 my-3">{children}</ul>,
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  a: ({ href, children }) => (
    <a href={href} className="text-terminal-green underline underline-offset-2 hover:opacity-80">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm text-left">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="px-3 py-2 font-semibold text-foreground bg-muted/40 align-top">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 text-foreground/80 align-top border-t border-border">{children}</td>,
};

function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} | MGP Analytics`;
  }, [title]);
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-10 md:py-16">
        <Link to="/" className="text-xs font-mono text-muted-foreground hover:text-terminal-green transition-colors">
          [ ← MGP ]
        </Link>
        <main className="mt-8">{children}</main>
        <footer className="mt-16 pt-6 border-t border-border text-xs font-mono text-muted-foreground flex flex-wrap gap-x-4 gap-y-2">
          <Link to="/privacy" className="hover:text-terminal-green transition-colors">PRIVACY POLICY</Link>
          <Link to="/terms" className="hover:text-terminal-green transition-colors">TERMS OF USE</Link>
          <Link to="/support" className="hover:text-terminal-green transition-colors">SUPPORT</Link>
        </footer>
      </div>
    </div>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalShell title="Privacy Policy">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>{privacyPolicy}</ReactMarkdown>
    </LegalShell>
  );
}

export function TermsOfUse() {
  return (
    <LegalShell title="Terms of Use">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>{termsOfUse}</ReactMarkdown>
    </LegalShell>
  );
}

export function Support() {
  return (
    <LegalShell title="Support">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground mb-3">Support</h1>
      <p className="text-sm leading-7 text-foreground/80 my-3">
        Questions, feedback or trouble with your account? Email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-terminal-green underline underline-offset-2 hover:opacity-80">
          {SUPPORT_EMAIL}
        </a>{" "}
        and we'll get back to you.
      </p>
      <h2 className="text-xl font-semibold text-foreground mt-10 mb-3">Common Questions</h2>
      <ul className="list-disc pl-5 space-y-1.5 text-sm leading-7 text-foreground/80 my-3">
        <li>
          <strong className="font-semibold text-foreground">Delete your account:</strong> in the app, go to Profile, then
          Delete Account. From the website, email us from the address on your account.
        </li>
        <li>
          <strong className="font-semibold text-foreground">Reset your password:</strong> tap Forgot Password on the sign-in
          screen and follow the link we email you.
        </li>
        <li>
          <strong className="font-semibold text-foreground">How fresh is the market data:</strong> it updates on a schedule,
          about every 6 hours.
        </li>
        <li>
          <strong className="font-semibold text-foreground">Need help with gambling:</strong> call 1-800-GAMBLER for free,
          confidential help, any time.
        </li>
      </ul>
    </LegalShell>
  );
}
