import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Byline",
  description: "The terms that govern your use of Byline.",
};

// DRAFT TEMPLATE — original plain-language scaffold, not legal advice.
// Fill in the bracketed items and have counsel review before launch.
export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="legal-meta">
        Last updated <span className="legal-ph">[effective date]</span>
      </p>

      <div className="legal-draft">
        <b>Draft template — not legal advice.</b> This is a plain-language
        starting point, not a finished agreement. Complete every{" "}
        <span className="legal-ph">[bracketed]</span> item and have it reviewed
        by qualified counsel before publishing or relying on it.
      </div>

      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and
        use of the Byline website and service (the &ldquo;Service&rdquo;)
        provided by <span className="legal-ph">[Company legal name]</span>{" "}
        (&ldquo;Byline,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;). By using the
        Service you agree to these Terms. If you don&rsquo;t agree, don&rsquo;t
        use the Service.
      </p>

      <h2>1. The Service and beta status</h2>
      <p>
        Byline tracks how leading AI assistants describe the people and issues
        you choose to monitor. The Service is currently offered as a free,
        evolving <b>beta</b>: features may change, break, or be discontinued,
        and it is provided on an &ldquo;as is&rdquo; basis (see Disclaimers
        below).
      </p>

      <h2>2. Eligibility and accounts</h2>
      <p>
        You must be at least <span className="legal-ph">[16/18]</span> and able
        to form a binding contract to use the Service. If the Service requires
        an account, you are responsible for the accuracy of your information and
        for activity under your account, and you agree to keep your credentials
        secure.
      </p>

      <h2>3. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use the Service for any unlawful purpose, or to harass, defame, or
          target any person in violation of applicable law;</li>
        <li>attempt to disrupt, reverse engineer, scrape, or gain unauthorized
          access to the Service or its systems;</li>
        <li>resell or provide the Service to third parties except as permitted;</li>
        <li>misrepresent your identity or your authority to monitor a subject.</li>
      </ul>

      <h2>4. Your content and watchlists</h2>
      <p>
        You retain ownership of the subjects, watchlists, and other content you
        submit (&ldquo;Your Content&rdquo;). You grant us a limited license to
        process Your Content as needed to provide and improve the Service. You
        represent that you have the right to monitor the subjects you add.
      </p>

      <h2>5. AI-generated content and accuracy</h2>
      <p>
        Reports include or summarize responses produced by third-party AI
        assistants. Those responses can be inaccurate, biased, outdated, or
        inconsistent, and Byline does not endorse, verify, or guarantee them.
        The Service is a measurement and monitoring tool, <b>not</b> legal,
        public-relations, financial, or other professional advice, and should
        not be relied on as the sole basis for any decision.
      </p>

      <h2>6. Intellectual property</h2>
      <p>
        The Service, including its software, design, and content (excluding Your
        Content), is owned by Byline and protected by intellectual-property
        laws. We grant you a limited, non-exclusive, non-transferable right to
        use the Service under these Terms.
      </p>

      <h2>7. Third-party services</h2>
      <p>
        The Service relies on and links to third-party services, including AI
        providers. We are not responsible for those services, and your use of
        them is subject to their own terms.
      </p>

      <h2>8. Disclaimers</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; and &ldquo;as
        available,&rdquo; without warranties of any kind, whether express or
        implied, including merchantability, fitness for a particular purpose,
        and non-infringement. We do not warrant that the Service will be
        uninterrupted, error-free, or accurate.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Byline will not be liable for
        any indirect, incidental, special, consequential, or punitive damages,
        or any loss of data, profits, or goodwill, arising from your use of the
        Service. Our total liability for any claim is limited to{" "}
        <span className="legal-ph">[amount / fees paid in the prior 12 months]</span>.
      </p>

      <h2>10. Termination</h2>
      <p>
        We may suspend or terminate your access at any time, including for
        violation of these Terms. You may stop using the Service at any time.
        Provisions that by their nature should survive termination will survive.
      </p>

      <h2>11. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. We will post the updated
        version here and revise the &ldquo;Last updated&rdquo; date; your
        continued use after changes take effect constitutes acceptance.
      </p>

      <h2>12. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of{" "}
        <span className="legal-ph">[jurisdiction]</span>, without regard to its
        conflict-of-laws rules. Any disputes will be resolved in{" "}
        <span className="legal-ph">[venue / dispute-resolution process]</span>.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions about these Terms? Contact us at{" "}
        <span className="legal-ph">[legal@yourdomain.com]</span>.
      </p>
    </>
  );
}
