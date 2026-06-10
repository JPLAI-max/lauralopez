import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import tbheLogo from "@assets/tbhe-logo.png";

export default function Navbar() {
  const [location] = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { href: "/about", label: "About" },
    { href: "/market-intelligence", label: "Intelligence" },
    { href: "/top-picks", label: "Top Picks" },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-300 ${
        scrolled ? "bg-background/95 backdrop-blur-sm border-b border-border shadow-sm" : "bg-transparent"
      }`}
    >
      <div className="container mx-auto px-6 h-24 flex items-center justify-between">
        <Link href="/" className="flex items-center" data-testid="link-home-logo">
          <img src={tbheLogo} alt="The Beverly Hills Estates" className="h-10 w-auto" />
        </Link>
        <nav className="hidden md:flex items-center space-x-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              data-testid={`link-nav-${link.label.toLowerCase().replace(" ", "-")}`}
              className={`text-sm tracking-wider uppercase font-sans transition-colors hover:text-secondary ${
                location === link.href ? "text-secondary" : scrolled ? "text-foreground" : "text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/contact"
            data-testid="link-nav-contact-cta"
            className={`px-6 py-3 text-sm tracking-wider uppercase font-sans transition-all border ${
              scrolled
                ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                : "bg-transparent text-white border-white hover:bg-white hover:text-primary"
            }`}
          >
            Private Consultation
          </Link>
        </nav>
      </div>
    </header>
  );
}
