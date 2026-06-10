import Navbar from "./Navbar";
import Footer from "./Footer";
import { ReactNode, useEffect } from "react";
import { useLocation } from "wouter";

export default function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
