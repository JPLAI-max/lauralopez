import { useEffect } from "react";
import { Link } from "wouter";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import tbheLogo from "@assets/tbhe-logo.png";

export default function Footer() {
  const s = useSiteSettings();

  const dreOk = Boolean(s.dre_license_number.trim());
  const brokerOk = Boolean(s.brokerage_name.trim());

  // Warn loudly when required compliance fields are absent.
  useEffect(() => {
    if (!dreOk || !brokerOk) {
      const msg =
        "[DRE compliance] dre_license_number and brokerage_name are required " +
        "by California law but are not configured in Settings. " +
        "The license disclosure block will be incomplete.";
      console.error(msg);
    }
  }, [dreOk, brokerOk]);

  return (
    <footer className="bg-primary text-primary-foreground py-20">
      <div className="container mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12">
        <div className="md:col-span-2 space-y-6">
          <img src={tbheLogo} alt="The Beverly Hills Estates" className="h-12 w-auto brightness-0 invert opacity-90" />
          <p className="font-serif text-lg text-primary-foreground/80 max-w-md">
            Strategic real estate advisory for families, advisors, and investors throughout Beverly Hills and Los Angeles.
          </p>
        </div>

        <div>
          <h4 className="font-sans uppercase tracking-wider text-sm mb-6 text-secondary-foreground/70">Navigation</h4>
          <ul className="space-y-4">
            <li><Link href="/" className="hover:text-secondary transition-colors">Home</Link></li>
            <li><Link href="/about" className="hover:text-secondary transition-colors">About Laura</Link></li>
            <li><Link href="/market-intelligence" className="hover:text-secondary transition-colors">Market Intelligence</Link></li>
            <li><Link href="/top-picks" className="hover:text-secondary transition-colors">Top Picks</Link></li>
            <li><Link href="/contact" className="hover:text-secondary transition-colors">Contact</Link></li>
            <li><Link href="/privacy" className="hover:text-secondary transition-colors text-primary-foreground/60 text-xs tracking-wider">Privacy Policy</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-sans uppercase tracking-wider text-sm mb-6 text-secondary-foreground/70">Contact</h4>
          <ul className="space-y-4 text-primary-foreground/80">
            {s.business_address ? (
              <li>{s.business_address}</li>
            ) : (
              <li>Beverly Hills, CA</li>
            )}
            {s.contact_email && <li>{s.contact_email}</li>}
            {s.contact_phone && <li>{s.contact_phone}</li>}
            <li className="pt-4 text-xs tracking-wider uppercase opacity-60">All inquiries are treated with complete confidentiality.</li>
          </ul>
        </div>
      </div>

      {/* DRE / Compliance block — required on every page */}
      <div className="container mx-auto px-6 mt-12 pt-8 border-t border-primary-foreground/10">
        {/* Dev-only visible warning when license data is missing */}
        {import.meta.env.DEV && (!dreOk || !brokerOk) && (
          <p className="font-sans text-xs bg-yellow-400 text-yellow-900 px-3 py-2 rounded mb-4 inline-block">
            ⚠ DRE compliance fields not configured — go to Admin → Settings to add your license numbers.
          </p>
        )}
        <p className="font-sans text-xs text-primary-foreground/50 leading-relaxed">
          {s.agent_name && s.dre_license_number && (
            <>{s.agent_name} · DRE #{s.dre_license_number}<br /></>
          )}
          {s.brokerage_name && s.brokerage_dre_number && (
            <>{s.brokerage_name} · DRE #{s.brokerage_dre_number}<br /></>
          )}
          {s.business_address && <>{s.business_address}</>}
          {!dreOk && !brokerOk && !import.meta.env.DEV && (
            // Production silent fallback — fields render nothing but error was logged above
            <span />
          )}
        </p>
      </div>
    </footer>
  );
}
