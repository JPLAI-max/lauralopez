import { Link } from "wouter";
import tbheLogo from "@assets/tbhe-logo.png";

export default function Footer() {
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
          </ul>
        </div>
        <div>
          <h4 className="font-sans uppercase tracking-wider text-sm mb-6 text-secondary-foreground/70">Contact</h4>
          <ul className="space-y-4 text-primary-foreground/80">
            <li>Beverly Hills, CA</li>
            <li>inquiries@lauralopez-advisory.com</li>
            <li>+1 (310) 555-0199</li>
            <li className="pt-4 text-xs tracking-wider uppercase opacity-60">All inquiries are treated with complete confidentiality.</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
