import { motion, type Variants } from "framer-motion";
import { Link } from "wouter";
import lauraPortrait from "@assets/IMG_0163_1781123890306.jpeg";

const fadeUpVariant: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } },
};

export default function About() {
  return (
    <div className="w-full  pb-24">
      <div className="container mx-auto px-6">
        <motion.div initial="hidden" animate="visible" variants={fadeUpVariant} className="max-w-5xl mx-auto">
          
          <div className="flex flex-col lg:flex-row gap-16 lg:gap-24 mb-32">
            <div className="w-full lg:w-1/2 order-2 lg:order-1">
              <h1 className="font-serif text-5xl md:text-6xl text-primary mb-8">Laura Lopez</h1>
              <h2 className="font-sans uppercase tracking-widest text-sm text-secondary mb-12 pb-6 border-b border-border">Director, Beverly Hills Estates</h2>
              
              <div className="font-serif text-lg leading-relaxed text-foreground/80 space-y-6">
                <p>
                  As a Director at Beverly Hills Estates, Laura Lopez serves as a strategic advisor to multi-generational families, family offices, and high-net-worth individuals on significant real estate decisions throughout Los Angeles' most distinguished neighborhoods.
                </p>
                <p>
                  Her practice departs from traditional residential brokerage, focusing instead on long-term strategic positioning. With deep expertise encompassing Beverly Hills, Bel Air, Holmby Hills, Trousdale Estates, and Beverly Park, Laura provides proprietary market intelligence and architectural context to inform generational wealth preservation.
                </p>
                <p>
                  A summa cum laude graduate of the University of Southern California, Laura brings an analytical rigor to luxury real estate. She understands that for her clientele, a property is rarely just a residence; it is a critical component of a broader institutional portfolio requiring meticulous management, tax awareness, and uncompromising discretion.
                </p>
              </div>

              <div className="mt-12 space-y-4">
                <div className="flex gap-4 items-center">
                  <div className="w-1.5 h-1.5 bg-secondary rounded-full"></div>
                  <span className="font-sans text-sm tracking-wider uppercase">USC, Summa Cum Laude</span>
                </div>
                <div className="flex gap-4 items-center">
                  <div className="w-1.5 h-1.5 bg-secondary rounded-full"></div>
                  <span className="font-sans text-sm tracking-wider uppercase">Director, Beverly Hills Estates</span>
                </div>
                <div className="flex gap-4 items-center">
                  <div className="w-1.5 h-1.5 bg-secondary rounded-full"></div>
                  <span className="font-sans text-sm tracking-wider uppercase">Specialist in Multi-Generational Advisory</span>
                </div>
              </div>
            </div>
            
            <div className="w-full lg:w-1/2 order-1 lg:order-2">
              <div className="aspect-[3/4] bg-card p-4">
                <img 
                  src={lauraPortrait} 
                  alt="Laura Lopez" 
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>

          <div className="bg-card p-12 md:p-20 text-center space-y-8">
            <h3 className="font-sans uppercase tracking-widest text-sm text-primary/60">Advisory Philosophy</h3>
            <p className="font-serif text-2xl md:text-3xl leading-relaxed text-foreground max-w-3xl mx-auto italic">
              "The most significant real estate decisions are measured not in market cycles, but in generations. I advise my clients to view prime Los Angeles real estate as a unique asset class that, when properly acquired and positioned, provides unparalleled wealth preservation."
            </p>
            <div className="pt-8">
              <Link href="/contact" className="px-8 py-4 bg-primary text-primary-foreground uppercase tracking-wider text-sm hover:bg-primary/90 transition-colors inline-block">
                Request a Consultation
              </Link>
            </div>
          </div>

        </motion.div>
      </div>
    </div>
  );
}
