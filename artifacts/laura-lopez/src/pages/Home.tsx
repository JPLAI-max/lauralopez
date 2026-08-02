import { motion, type Variants } from "framer-motion";
import tbheOg from "@assets/tbhe-og.jpg";
import { Link } from "wouter";
import ContactForm from "@/components/ContactForm";

const fadeUpVariant: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } },
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.2 } },
};

const viewportOpts = { once: true, margin: "0px" };

export default function Home() {
  return (
    <div className="w-full overflow-x-hidden">
      {/* Hero Section — full-bleed behind navbar via -mt-[var(--header-h)] */}
      <section className="relative min-h-[100svh] flex items-center justify-center overflow-hidden -mt-[var(--header-h)]">
        <div className="absolute inset-0 z-0">
          <img src={tbheOg} alt="Luxury Estate" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-primary/70 mix-blend-multiply"></div>
        </div>

        {/* paddingTop = --header-h + base vertical padding so text clears the navbar */}
        <div
          className="relative z-10 container mx-auto px-6 text-center text-white pb-24 md:pb-32"
          style={{ paddingTop: "calc(var(--header-h) + 6rem)" }}
        >
          <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="max-w-4xl mx-auto space-y-6">
            <motion.h1 variants={fadeUpVariant} className="font-serif text-[clamp(2.75rem,7vw,6rem)] tracking-tight">
              Laura Lopez
            </motion.h1>
            <motion.div variants={fadeUpVariant} className="w-24 h-px bg-secondary mx-auto"></motion.div>
            <motion.h2 variants={fadeUpVariant} className="font-sans text-[clamp(0.95rem,2vw,1.5rem)] uppercase tracking-widest font-light text-white/90">
              Director, Beverly Hills Estates
            </motion.h2>
            <motion.h3 variants={fadeUpVariant} className="font-sans text-[clamp(0.7rem,1.3vw,1rem)] tracking-wider uppercase opacity-80 pt-2">
              Advisor to Multi-Generational & High-Net-Worth Families
            </motion.h3>
            <motion.p variants={fadeUpVariant} className="font-serif text-[clamp(1.05rem,2vw,1.5rem)] pt-6 pb-10 opacity-90 max-w-2xl mx-auto italic">
              "Strategic real estate advisory for families, advisors, and investors throughout Beverly Hills and Los Angeles."
            </motion.p>
            <motion.div variants={fadeUpVariant} className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/contact" data-testid="button-hero-consultation" className="px-8 py-4 bg-secondary text-white uppercase tracking-wider text-sm hover:bg-secondary/90 transition-colors w-full sm:w-auto text-center border border-secondary">
                Private Consultation
              </Link>
              <Link href="/market-intelligence" data-testid="button-hero-intelligence" className="px-8 py-4 bg-transparent border border-white text-white uppercase tracking-wider text-sm hover:bg-white hover:text-primary transition-colors w-full sm:w-auto text-center">
                Market Intelligence
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Advisory Philosophy */}
      <section className="py-20 md:py-32 bg-background">
        <div className="container mx-auto px-6">
          <motion.div
            initial="hidden" whileInView="visible" viewport={viewportOpts}
            variants={fadeUpVariant}
            className="max-w-3xl mx-auto text-center space-y-8"
          >
            <h2 className="font-sans uppercase tracking-widest text-sm text-primary/60">Advisory Philosophy</h2>
            <h3 className="font-serif text-[clamp(1.75rem,4vw,3rem)] text-foreground">Real Estate as Long-Term Strategy</h3>
            <div className="w-12 h-px bg-border mx-auto"></div>
            <div className="font-serif text-[clamp(1.05rem,2vw,1.25rem)] leading-relaxed text-foreground/80 space-y-6 text-left">
              <p>
                True wealth preservation requires more than transactional expertise. It demands a holistic understanding of how real estate functions within a broader generational portfolio. My practice is built on the premise that legacy assets should be positioned with the same rigor as any other institutional holding.
              </p>
              <p>
                Operating at the intersection of architectural provenance and market economics, I advise families on the acquisition, disposition, and strategic repositioning of legacy estates. Discretion, unparalleled market intelligence, and an unhurried perspective form the foundation of every client relationship.
              </p>
            </div>
            <div className="pt-4">
              <Link href="/about" className="inline-block uppercase tracking-wider text-sm text-primary border-b border-primary pb-1 hover:text-secondary hover:border-secondary transition-colors">
                Read Full Biography
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Market Intelligence Preview */}
      <section className="py-20 md:py-32 bg-card">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={viewportOpts} variants={fadeUpVariant} className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
            <div className="max-w-2xl">
              <h2 className="font-sans uppercase tracking-widest text-sm text-primary/60 mb-4">Market Intelligence</h2>
              <h3 className="font-serif text-[clamp(1.75rem,3.5vw,2.25rem)] text-foreground">Proprietary Research & Insights</h3>
            </div>
            <Link href="/market-intelligence" className="uppercase tracking-wider text-xs px-6 py-3 border border-border hover:bg-white transition-colors shrink-0">
              View All Reports
            </Link>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={viewportOpts} variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {[
              { category: "Neighborhood", title: "Beverly Park Overview", desc: "Analysis of lot utility and architectural shifts in Los Angeles' premier guard-gated enclave." },
              { category: "Architecture", title: "Trousdale Estate Guide", desc: "The enduring value of mid-century modernist restoration versus ground-up development." },
              { category: "Regulatory", title: "Prop 19 Updates", desc: "Navigating complex property tax implications for multi-generational inherited real estate." }
            ].map((article, i) => (
              <motion.div key={i} variants={fadeUpVariant} className="group cursor-pointer">
                <div className="bg-background p-6 md:p-8 border border-border h-full flex flex-col transition-shadow hover:shadow-lg">
                  <span className="font-sans text-xs uppercase tracking-widest text-secondary mb-6 block">{article.category}</span>
                  <h4 className="font-serif text-[clamp(1.15rem,2.5vw,1.5rem)] mb-4 group-hover:text-primary transition-colors">{article.title}</h4>
                  <p className="text-muted-foreground font-serif leading-relaxed mb-8 flex-1">{article.desc}</p>
                  <span className="font-sans text-xs uppercase tracking-widest text-primary flex items-center gap-2">
                    Read Intelligence <span className="text-secondary opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                  </span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Laura's Top Picks */}
      <section className="py-20 md:py-32 bg-background">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={viewportOpts} variants={fadeUpVariant} className="mb-12 md:mb-16">
            <h2 className="font-sans uppercase tracking-widest text-sm text-primary/60 mb-4 text-center">Curated Selection</h2>
            <h3 className="font-serif text-[clamp(1.75rem,3.5vw,2.25rem)] text-foreground text-center">Laura's Top Picks</h3>
            <div className="w-12 h-px bg-border mx-auto mt-8"></div>
          </motion.div>

          <div className="space-y-16 md:space-y-24">
            {[
              {
                img: "/images/top-pick-1.png",
                area: "Beverly Hills North of Sunset",
                arch: "Classic Revival",
                commentary: "An exceptionally rare flat acre in the city's most established corridor. The architectural pedigree provides a foundation for generational holding.",
                price: "$25M – $30M"
              },
              {
                img: "/images/top-pick-2.png",
                area: "Trousdale Estates",
                arch: "Mid-Century Modernist",
                commentary: "Perfectly sited to capture explosive city-to-ocean views while maintaining profound privacy. A prime candidate for meticulous restoration.",
                price: "$18M – $22M"
              },
              {
                img: "/images/top-pick-3.png",
                area: "Holmby Hills",
                arch: "Traditional Compound",
                commentary: "Estate-sized acreage offering immediate proximity to the Platinum Triangle's core. Represents significant land value protected by neighborhood scale.",
                price: "$45M – $55M"
              }
            ].map((pick, i) => (
              <motion.div
                key={i}
                initial="hidden" whileInView="visible" viewport={viewportOpts}
                variants={fadeUpVariant}
                className={`flex flex-col ${i % 2 === 1 ? "lg:flex-row-reverse" : "lg:flex-row"} gap-8 lg:gap-24 items-center`}
              >
                <div className="w-full lg:w-3/5">
                  <div className="aspect-[16/9] relative overflow-hidden bg-card">
                    <img src={pick.img} alt={pick.area} className="w-full h-full object-cover" />
                  </div>
                </div>
                <div className="w-full lg:w-2/5 space-y-5">
                  <span className="font-sans text-xs uppercase tracking-widest text-secondary">{pick.arch}</span>
                  <h4 className="font-serif text-[clamp(1.35rem,3vw,1.875rem)]">{pick.area}</h4>
                  <div className="w-8 h-px bg-border"></div>
                  <p className="font-serif text-lg leading-relaxed text-foreground/80 italic">"{pick.commentary}"</p>
                  <div className="pt-4 flex justify-between items-center border-t border-border">
                    <span className="font-sans text-sm tracking-wider uppercase">{pick.price}</span>
                    <Link href="/contact" className="font-sans text-xs uppercase tracking-widest text-primary hover:text-secondary transition-colors">Inquire</Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-16 md:mt-24">
            <Link href="/top-picks" className="inline-block uppercase tracking-wider text-sm px-10 py-4 border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors">
              View All Curated Properties
            </Link>
          </div>
        </div>
      </section>

      {/* Current Listings */}
      <section className="py-20 md:py-32 bg-card border-t border-border">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
            <div className="max-w-2xl">
              <h2 className="font-sans uppercase tracking-widest text-sm text-primary/60 mb-4">Beverly Hills Estates</h2>
              <h3 className="font-serif text-3xl text-foreground">Current Portfolio</h3>
            </div>
            <Link href="/listings" className="uppercase tracking-wider text-xs px-6 py-3 border border-border hover:bg-white transition-colors shrink-0">
              View All Listings
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="group cursor-pointer">
                <div className="aspect-[4/3] mb-6 overflow-hidden bg-background">
                  <img src={`/images/listing-${i}.png`} alt={`Listing ${i}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                </div>
                <h4 className="font-serif text-xl mb-2">Confidential Listing</h4>
                <div className="flex justify-between items-center text-sm font-sans tracking-wider uppercase text-muted-foreground">
                  <span>Price Upon Request</span>
                  <span>Beverly Hills</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-32 bg-primary text-primary-foreground">
        <div className="container mx-auto px-6 max-w-4xl">
          <motion.div initial="hidden" whileInView="visible" viewport={viewportOpts} variants={fadeUpVariant} className="text-center mb-12 md:mb-16">
            <h2 className="font-serif text-[clamp(1.75rem,4vw,3rem)] mb-6 text-white">Begin a Confidential Conversation</h2>
            <p className="font-serif text-[clamp(1.05rem,2vw,1.25rem)] opacity-80 max-w-2xl mx-auto">
              Whether you are evaluating a generational holding, considering an off-market acquisition, or requiring a strategic portfolio review, discretion is assured.
            </p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={viewportOpts} variants={fadeUpVariant} className="bg-white text-foreground p-6 md:p-12">
            <ContactForm />
          </motion.div>
        </div>
      </section>
    </div>
  );
}
