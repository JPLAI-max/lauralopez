import { motion } from "framer-motion";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function Privacy() {
  const s = useSiteSettings();
  const address = s.business_address || "Beverly Hills, CA";
  const email   = s.contact_email;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="w-full pb-32"
    >
      <div className="container mx-auto px-6">
        <div className="max-w-2xl mx-auto">

          <h1 className="font-serif text-[clamp(2rem,5vw,3rem)] text-primary mb-4 mt-8">
            Privacy Policy
          </h1>
          <p className="font-sans text-xs uppercase tracking-widest text-muted-foreground mb-12">
            Effective: January 1, 2025
          </p>

          <div className="prose prose-stone dark:prose-invert prose-headings:font-serif prose-headings:font-normal prose-p:font-serif prose-p:leading-relaxed prose-p:text-foreground/80 prose-a:text-primary">

            <h2>Who we are</h2>
            <p>
              {s.agent_name ? `${s.agent_name} operates ` : "We operate "}
              this website{s.brokerage_name ? ` under ${s.brokerage_name}` : ""}.{" "}
              {address && `Our principal place of business is ${address}.`}
            </p>

            <h2>What we collect</h2>
            <p>
              When you submit an inquiry through this site, we collect:
            </p>
            <ul>
              <li>Your name, email address, and phone number (if provided)</li>
              <li>Your professional affiliation and the nature of your inquiry</li>
              <li>Your message content</li>
              <li>Your IP address, for rate-limiting purposes only</li>
            </ul>
            <p>
              We do not use cookies for tracking or analytics. We do not sell,
              rent, or share your personal information with third parties.
            </p>

            <h2>Email communications</h2>
            <p>
              We send market intelligence and research updates only to people who
              explicitly check the opt-in checkbox on the inquiry form. This
              checkbox is unchecked by default — submitting an inquiry does not
              enroll you in any mailing list unless you choose to opt in.
            </p>

            <h2>How to unsubscribe</h2>
            <p>
              To be removed from our market intelligence distribution list, reply
              to any email with "Unsubscribe" in the subject line
              {email ? `, or email us directly at ${email}` : ""}.
              We will process your request within five business days.
            </p>

            <h2>Data retention</h2>
            <p>
              Inquiry records are retained for up to three years to support
              ongoing client relationships. You may request deletion of your
              personal data at any time by contacting us directly.
            </p>

            <h2>Security</h2>
            <p>
              All data is transmitted over encrypted HTTPS connections. Access to
              inquiry records is restricted to authorised personnel only.
            </p>

            <h2>Contact</h2>
            <p>
              Questions about this policy may be directed to:
            </p>
            <address className="not-italic font-serif text-foreground/80">
              {s.agent_name && <>{s.agent_name}<br /></>}
              {s.brokerage_name && <>{s.brokerage_name}<br /></>}
              {address && <>{address}<br /></>}
              {email && <a href={`mailto:${email}`}>{email}</a>}
            </address>

          </div>
        </div>
      </div>
    </motion.div>
  );
}
