import { motion } from "framer-motion";

const fadeUpVariant = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const categories = [
  {
    name: "Neighborhood Intelligence",
    articles: [
      { title: "Beverly Park: Guard-gated community overview, lot sizes, comp analysis", desc: "A comprehensive analysis of the enduring premium associated with Los Angeles' most secure enclave." },
      { title: "Trousdale Estates: Mid-century modernist architecture guide", desc: "Understanding the preservation value and renovation constraints of Trousdale's architectural heritage." },
      { title: "Holmby Hills: Estate-sized lots, proximity to UCLA, historic value", desc: "The structural advantages of Holmby Hills' rare flat acreage and platinum triangle positioning." },
      { title: "Beverly Hills Flats: Post-war traditional inventory analysis", desc: "Assessing the generational turnover and redevelopment potential within the Flats." },
      { title: "Bel Air: Canyon privacy, compound potential", desc: "Evaluating topographic constraints and privacy premiums in Bel Air's upper and lower canyons." }
    ]
  },
  {
    name: "Regulatory Intelligence",
    articles: [
      { title: "Proposition 19: Property tax implications for inherited real estate", desc: "Strategic planning required to navigate the reassessment of legacy assets upon transfer." },
      { title: "FIRPTA: Foreign buyer requirements and withholding rules", desc: "Essential compliance frameworks for international principals acquiring or divesting U.S. property." },
      { title: "FinCEN Beneficial Ownership: Reporting requirements for LLCs", desc: "Navigating new transparency mandates while maintaining appropriate corporate veils." },
      { title: "AB38: Fire hardening disclosure requirements", desc: "Understanding the liability and compliance landscape for hillside properties." }
    ]
  },
  {
    name: "Architecture",
    articles: [
      { title: "Paul Williams: The dean of Beverly Hills residential design", desc: "The enduring market premium commanded by verified Williams commissions." },
      { title: "Wallace Neff: Spanish Colonial Revival mastery", desc: "Identifying and preserving the hallmark details of Neff's most significant estates." },
      { title: "Richard Neutra: Case Study modernism in the hills", desc: "The unique valuation metrics applied to historically significant modernist structures." },
      { title: "Buff & Hensman: Desert modernism influence", desc: "The resurgence of post and beam architecture and its impact on hillside valuations." }
    ]
  },
  {
    name: "Insurance & Risk",
    articles: [
      { title: "Fire hardening strategies for brush-zone properties", desc: "Proactive structural enhancements to maintain insurability in high-risk zones." },
      { title: "Brush clearance compliance guides", desc: "Annual mitigation requirements for estate properties abutting natural topography." },
      { title: "Insurance optimization for high-value homes", desc: "Navigating the constricted California luxury insurance market." }
    ]
  }
];

export default function MarketIntelligence() {
  return (
    <div className="w-full pt-32 pb-24 bg-background">
      <div className="container mx-auto px-6">
        <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="max-w-6xl mx-auto">
          
          <motion.div variants={fadeUpVariant} className="mb-24 text-center max-w-3xl mx-auto">
            <h1 className="font-serif text-5xl md:text-6xl text-primary mb-6">Market Intelligence</h1>
            <p className="font-serif text-xl text-foreground/80 leading-relaxed">
              Proprietary research, neighborhood analysis, and regulatory guidance designed for family offices and institutional-grade investors navigating the Los Angeles luxury sector.
            </p>
          </motion.div>

          <div className="space-y-32">
            {categories.map((category, index) => (
              <motion.div key={index} variants={fadeUpVariant} className="space-y-8">
                <div className="border-b border-border pb-4 mb-8">
                  <h2 className="font-sans uppercase tracking-widest text-lg text-primary">{category.name}</h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {category.articles.map((article, i) => (
                    <div key={i} className="bg-card p-8 border border-border group cursor-pointer hover:shadow-md transition-all flex flex-col h-full">
                      <span className="font-sans text-xs uppercase tracking-widest text-secondary mb-4 block">{category.name}</span>
                      <h3 className="font-serif text-2xl mb-4 group-hover:text-primary transition-colors">{article.title}</h3>
                      <p className="font-serif text-muted-foreground mb-8 flex-1">{article.desc}</p>
                      <span className="font-sans text-xs uppercase tracking-widest text-primary flex items-center gap-2">
                        Request Full Report <span className="text-secondary opacity-0 group-hover:opacity-100 transition-opacity transform -translate-x-2 group-hover:translate-x-0">→</span>
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

        </motion.div>
      </div>
    </div>
  );
}
