import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Byline",
  description: "How Byline collects, uses, and protects your information.",
};

// DRAFT TEMPLATE — original plain-language scaffold, not legal advice.
// The bracketed <span className="legal-ph"> items must be filled in and
// the whole document reviewed by counsel before launch.
export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="legal-meta">
        Last updated <span className="legal-ph">[effective date]</span>
      </p>

      <div className="legal-draft">
        <b>Draft template — not legal advice.</b> This is a plain-language
        starting point generated for Byline, not a finished or
        jurisdiction-compliant policy. Fill in every{" "}
        <span className="legal-ph">[bracketed]</span> item and have it reviewed
        by qualified counsel (including GDPR/CCPA obligations as applicable)
        before publishing.
      </div>

      <p>
        This Privacy Policy explains how{" "}
        <span className="legal-ph">[Company legal name]</span> (&ldquo;Byline,&rdquo;
        &ldquo;we,&rdquo; &ldquo;us&rdquo;) collects, uses, and shares
        information when you use the Byline website and service (the
        &ldquo;Service&rdquo;). By using the Service you agree to the practices
        described here.
      </p>

      <h2>1. Information we collect</h2>
      <p>We collect the following categories of information:</p>
      <ul>
        <li>
          <b>Information you provide.</b> Contact details (such as name and
          email) if you create an account or get in touch, and the subjects you
          choose to track — the people, issues, bills, and organizations you add
          to a watchlist.
        </li>
        <li>
          <b>Usage and device information.</b> Standard log data such as IP
          address, browser type, pages viewed, and timestamps, collected
          automatically when you use the Service.
        </li>
        <li>
          <b>Cookies and similar technologies.</b> Used to keep you signed in,
          remember preferences, and understand aggregate usage. See{" "}
          <a href="#cookies">Cookies</a> below.
        </li>
      </ul>

      <h2>2. How we use information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>provide, operate, and improve the Service;</li>
        <li>
          run the analyses you request — querying AI assistants about the
          subjects on your watchlist and reporting how they describe them;
        </li>
        <li>communicate with you about the Service and respond to requests;</li>
        <li>
          maintain security, prevent abuse, and comply with legal obligations.
        </li>
      </ul>

      <h2>3. How Byline queries AI assistants</h2>
      <p>
        To produce its reports, the Service sends neutral, standardized prompts
        about your subjects to third-party AI assistants (such as ChatGPT,
        Gemini, Claude, and Perplexity) and records their responses. We do not
        disclose your identity, account, or full watchlist to those providers
        beyond what is contained in an individual prompt. Your use of the
        Service is also subject to those providers&rsquo; own terms and privacy
        practices.
      </p>

      <h2>4. How we share information</h2>
      <p>
        We do not sell your personal information. We share information only:
      </p>
      <ul>
        <li>
          with service providers and sub-processors who help us run the Service
          (for example, hosting, the AI providers above, and analytics), under
          contractual confidentiality and security obligations;
        </li>
        <li>
          to comply with law, enforce our terms, or protect the rights, safety,
          and security of Byline, our users, or the public;
        </li>
        <li>
          in connection with a merger, acquisition, or sale of assets, with
          notice consistent with this policy.
        </li>
      </ul>

      <h2>5. Data retention</h2>
      <p>
        We keep information for as long as needed to provide the Service and for
        legitimate business or legal purposes, then delete or anonymize it. You
        may request deletion of your account and associated data as described
        below.
      </p>

      <h2>6. Security</h2>
      <p>
        We use reasonable administrative, technical, and organizational measures
        to protect information. No method of transmission or storage is
        completely secure, however, and we cannot guarantee absolute security.
      </p>

      <h2 id="rights">7. Your choices and rights</h2>
      <p>
        Depending on your location, you may have rights to access, correct,
        delete, or export your personal information, and to object to or
        restrict certain processing. To exercise these rights, contact us at{" "}
        <span className="legal-ph">[privacy@yourdomain.com]</span>. We will
        respond consistent with applicable law (including{" "}
        <span className="legal-ph">[GDPR / CCPA / other]</span> where it
        applies).
      </p>

      <h2 id="cookies">8. Cookies and analytics</h2>
      <p>
        We use cookies and similar technologies for authentication,
        preferences, and aggregate analytics. You can control cookies through
        your browser settings; disabling some may affect how the Service works.
      </p>

      <h2>9. International users</h2>
      <p>
        We may process and store information in{" "}
        <span className="legal-ph">[country/region]</span>. Where required, we
        rely on appropriate safeguards for cross-border transfers.
      </p>

      <h2>10. Children&rsquo;s privacy</h2>
      <p>
        The Service is intended for professional use and is not directed to
        children under <span className="legal-ph">[16/18]</span>. We do not
        knowingly collect information from them.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        We may update this policy from time to time. We will post the updated
        version here and revise the &ldquo;Last updated&rdquo; date; material
        changes may be communicated by additional notice.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about this policy? Contact us at{" "}
        <span className="legal-ph">[privacy@yourdomain.com]</span>
        {" "}or <span className="legal-ph">[mailing address]</span>.
      </p>
    </>
  );
}
