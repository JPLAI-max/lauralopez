import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import tbheLogo from "@assets/tbhe-logo.png";
import { Menu, X } from "lucide-react";

export default function Navbar() {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Lock body scroll when mobile drawer is open; restore on close and unmount
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Close drawer automatically when viewport crosses to >= 1024px (desktop breakpoint)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setMobileOpen(false);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

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
        {/* shrink-0 prevents the logo from being squeezed by the nav row */}
        <Link href="/" className="flex items-center shrink-0" data-testid="link-home-logo" onClick={handleNav}>
          {/* Logo height is fluid — if navbar h-20/md:h-24 changes, update --header-h in index.css too */}
          <img src={tbheLogo} alt="The Beverly Hills Estates" className="h-[clamp(2.25rem,4vw,4rem)] w-auto" />
        </Link>

        {/* Desktop nav — visible at lg (1024px+); fluid gap compresses between 1024–1440px */}
        <nav className="hidden lg:flex items-center gap-[clamp(1.25rem,2.2vw,2rem)]">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              data-testid={`link-nav-${link.label.toLowerCase().replace(" ", "-")}`}
              className={`whitespace-nowrap text-sm tracking-wider uppercase font-sans transition-colors hover:text-secondary ${
                location === link.href ? "text-secondary" : "text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/contact"
            data-testid="link-nav-contact-cta"
            className={`whitespace-nowrap px-[clamp(1rem,1.6vw,1.5rem)] py-3 text-sm tracking-wider uppercase font-sans transition-all border ${
              location === "/contact"
                ? "bg-secondary border-secondary text-white"
                : "bg-transparent border-white text-white hover:bg-white hover:text-primary"
            }`}
          >
            Private Consultation
          </Link>
        </nav>

        {/* Mobile hamburger — hidden at lg (1024px+) */}
        <button
          className="lg:hidden text-white p-2"
          onClick={() => setMobileOpen((o) => !o)}
          data-testid="button-mobile-menu"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* Mobile drawer — hidden at lg (1024px+); scrolls on very short viewports */}
      {mobileOpen && (
        <div
          className="lg:hidden bg-primary border-t border-primary/20 px-6 pb-8 pt-4 flex flex-col gap-6 overflow-y-auto"
          style={{ maxHeight: "calc(100svh - var(--header-h))" }}
        >
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
