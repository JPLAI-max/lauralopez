import { Link, useLocation } from "wouter";
import { useState } from "react";
import tbheLogo from "@assets/tbhe-logo.png";
import { Menu, X } from "lucide-react";

export default function Navbar() {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { href: "/about", label: "About" },
    { href: "/market-intelligence", label: "Intelligence" },
    { href: "/top-picks", label: "Top Picks" },
    { href: "/listings", label: "Listings" },
    { href: "/sold", label: "Sold" },
  ];

  const handleNav = () => setMobileOpen(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-primary shadow-md border-b border-primary/20">
      <div className="container mx-auto px-6 h-20 md:h-24 flex items-center justify-between">
        <Link href="/" className="flex items-center" data-testid="link-home-logo" onClick={handleNav}>
          <img src={tbheLogo} alt="The Beverly Hills Estates" className="h-12 md:h-16 w-auto" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center space-x-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              data-testid={`link-nav-${link.label.toLowerCase().replace(" ", "-")}`}
              className={`text-sm tracking-wider uppercase font-sans transition-colors hover:text-secondary ${
                location === link.href ? "text-secondary" : "text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/contact"
            data-testid="link-nav-contact-cta"
            className={`px-6 py-3 text-sm tracking-wider uppercase font-sans transition-all border ${
              location === "/contact"
                ? "bg-secondary border-secondary text-white"
                : "bg-transparent border-white text-white hover:bg-white hover:text-primary"
            }`}
          >
            Private Consultation
          </Link>
        </nav>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-white p-2"
          onClick={() => setMobileOpen((o) => !o)}
          data-testid="button-mobile-menu"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden bg-primary border-t border-primary/20 px-6 pb-8 pt-4 flex flex-col gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              data-testid={`link-mobile-nav-${link.label.toLowerCase().replace(" ", "-")}`}
              onClick={handleNav}
              className={`text-base tracking-wider uppercase font-sans transition-colors hover:text-secondary ${
                location === link.href ? "text-secondary" : "text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/contact"
            data-testid="link-mobile-nav-contact"
            onClick={handleNav}
            className="mt-2 px-6 py-4 text-sm tracking-wider uppercase font-sans border border-white text-white text-center hover:bg-white hover:text-primary transition-colors"
          >
            Private Consultation
          </Link>
        </div>
      )}
    </header>
  );
}
