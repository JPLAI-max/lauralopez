import { motion, type Variants } from "framer-motion";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { publicApi, type PublicArticle } from "../lib/public-api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import ContactForm from "@/components/ContactForm";

const fadeUpVariant: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } },
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const CATEGORY_LABELS: Record<string, string> = {
  neighborhood: "Neighborhood Intelligence",
  regulatory: "Regulatory Intelligence",
  architecture: "Architecture",
  insurance: "Insurance & Risk",
  market: "Market",
};

const CATEGORY_ORDER = ["neighborhood", "regulatory", "architecture", "insurance", "market"];

const REPORT_NAME = "Quarterly Market Report — Beverly Hills Estates";

// Hardcoded fallback data (matches original MarketIntelligence.tsx exactly)
const FALLBACK_ARTICLES: PublicArticle[] = [
  // Neighborhood Intelligence
  { id: "1", slug: "", title: "Beverly Park: Guard-gated community overview, lot sizes, comp analysis", category: "neighborhood", excerpt: "A comprehensive analysis of the enduring premium associated with Los Angeles' most secure enclave.", heroMediaId: null, publishedAt: null },
  { id: "2", slug: "", title: "Trousdale Estates: Mid-century modernist architecture guide", category: "neighborhood", excerpt: "Understanding the preservation value and renovation constraints of Trousdale's architectural heritage.", heroMediaId: null, publishedAt: null },
  { id: "3", slug: "", title: "Holmby Hills: Estate-sized lots, proximity to UCLA, historic value", category: "neighborhood", excerpt: "The structural advantages of Holmby Hills' rare flat acreage and platinum triangle positioning.", heroMediaId: null, publishedAt: null },
  { id: "4", slug: "", title: "Beverly Hills Flats: Post-war traditional inventory analysis", category: "neighborhood", excerpt: "Assessing the generational turnover and redevelopment potential within the Flats.", heroMediaId: null, publishedAt: null },
  { id: "5", slug: "", title: "Bel Air: Canyon privacy, compound potential", category: "neighborhood", excerpt: "Evaluating topographic constraints and privacy premiums in Bel Air's upper and lower canyons.", heroMediaId: null, publishedAt: null },
  // Regulatory
  { id: "6", slug: "", title: "Proposition 19: Property tax implications for inherited real estate", category: "regulatory", excerpt: "Strategic planning required to navigate the reassessment of legacy assets upon transfer.", heroMediaId: null, publishedAt: null },
  { id: "7", slug: "", title: "FIRPTA: Foreign buyer requirements and withholding rules", category: "regulatory", excerpt: "Essential compliance frameworks for international principals acquiring or divesting U.S. property.", heroMediaId: null, publishedAt: null },
  { id: "8", slug: "", title: "FinCEN Beneficial Ownership: Reporting requirements for LLCs", category: "regulatory", excerpt: "Navigating new transparency mandates while maintaining appropriate corporate veils.", heroMediaId: null, publishedAt: null },
  { id: "9", slug: "", title: "AB38: Fire hardening disclosure requirements", category: "regulatory", excerpt: "Understanding the liability and compliance landscape for hillside properties.", heroMediaId: null, publishedAt: null },
  // Architecture
  { id: "10", slug: "", title: "Paul Williams: The dean of Beverly Hills residential design", category: "architecture", excerpt: "The enduring market premium commanded by verified Williams commissions.", heroMediaId: null, publishedAt: null },
  { id: "11", slug: "", title: "Wallace Neff: Spanish Colonial Revival mastery", category: "architecture", excerpt: "Identifying and preserving the hallmark details of Neff's most significant estates.", heroMediaId: null, publishedAt: null },
  { id: "12", slug: "", title: "Richard Neutra: Case Study modernism in the hills", category: "architecture", excerpt: "The unique valuation metrics applied to historically significant modernist structures.", heroMediaId: null, publishedAt: null },
  { id: "13", slug: "", title: "Buff & Hensman: Desert modernism influence", category: "architecture", excerpt: "The resurgence of post and beam architecture and its impact on hillside valuations.", heroMediaId: null, publishedAt: null },
  // Insurance
  { id: "14", slug: "", title: "Fire hardening strategies for brush-zone properties", category: "insurance", excerpt: "Proactive structural enhancements to maintain insurability in high-risk zones.", heroMediaId: null, publishedAt: null },
  { id: "15", slug: "", title: "Brush clearance compliance guides", category: "insurance", excerpt: "Annual mitigation requirements for estate properties abutting natural topography.", heroMediaId: null, publishedAt: null },
  { id: "16", slug: "", title: "Insurance optimization for high-value homes", category: "insurance", excerpt: "Navigating the constricted California luxury insurance market.", heroMediaId: null, publishedAt: null },
];

export default function MarketIntelligence() {
  const [articles, setArticles] = useState<PublicArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

  useEffect(() => {
    publicApi.articles
      .list({ pageSize: 100 })
      .then((res) => {
        // If API returns articles, use them; otherwise fall back to seed data
        setArticles(res.articles.length > 0 ? res.articles : FALLBACK_ARTICLES);
      })
      .catch(() => setArticles(FALLBACK_ARTICLES))
      .finally(() => setLoading(false));
  }, []);

  // Group by category preserving display order
  const grouped = CATEGORY_ORDER.reduce<Record<string, PublicArticle[]>>((acc, cat) => {
    const items = articles.filter((a) => a.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  // Show fallback categories even while loading
  const displayData = loading
    ? CATEGORY_ORDER.reduce<Record<string, PublicArticle[]>>((acc, cat) => {
        const items = FALLBACK_ARTICLES.filter((a) => a.category === cat);
        if (items.length > 0) acc[cat] = items;
        return acc;
      }, {})
    : grouped;

  return (
    <div className="w-full pb-24 bg-background">
      <div className="container mx-auto px-6">
        <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="max-w-6xl mx-auto">

          <motion.div variants={fadeUpVariant} className="mb-24 text-center max-w-3xl mx-auto">
            <h1 className="font-serif text-[clamp(2.25rem,6vw,3.75rem)] text-primary mb-6">Market Intelligence</h1>
            <p className="font-serif text-xl text-foreground/80 leading-relaxed">
              Proprietary research, neighborhood analysis, and regulatory guidance designed for family offices and institutional-grade investors navigating the Los Angeles luxury sector.
            </p>
          </motion.div>

          <div className="space-y-32">
            {Object.entries(displayData).map(([category, categoryArticles], index) => (
              <motion.div key={index} variants={fadeUpVariant} className="space-y-8">
                <div className="border-b border-border pb-4 mb-8">
                  <h2 className="font-sans uppercase tracking-widest text-lg text-primary">
                    {CATEGORY_LABELS[category] ?? category}
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {categoryArticles.map((article) => {
                    const inner = (
                      <div className="bg-card p-8 border border-border group cursor-pointer hover:shadow-md transition-all flex flex-col h-full">
                        <span className="font-sans text-xs uppercase tracking-widest text-secondary mb-4 block">
                          {CATEGORY_LABELS[article.category] ?? article.category}
                        </span>
                        <h3 className="font-serif text-2xl mb-4 group-hover:text-primary transition-colors">
                          {article.title}
                        </h3>
                        <p className="font-serif text-muted-foreground mb-8 flex-1">{article.excerpt}</p>
                        <span className="font-sans text-xs uppercase tracking-widest text-primary flex items-center gap-2">
                          Read{" "}
                          <span className="text-secondary opacity-0 group-hover:opacity-100 transition-opacity transform -translate-x-2 group-hover:translate-x-0">
                            →
                          </span>
                        </span>
                      </div>
                    );

                    return article.slug ? (
                      <Link key={article.id} href={`/intelligence/${article.slug}`}>
                        {inner}
                      </Link>
                    ) : (
                      <div key={article.id}>{inner}</div>
                    );
                  })}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Quarterly Report CTA — distinct from article cards */}
          <motion.div
            variants={fadeUpVariant}
            className="mt-32 border-t border-border pt-16 text-center max-w-2xl mx-auto"
          >
            <span className="font-sans text-xs uppercase tracking-widest text-secondary mb-4 block">
              Proprietary Research
            </span>
            <h2 className="font-serif text-[clamp(1.5rem,4vw,2.5rem)] text-primary mb-6">
              Request the Quarterly Market Report
            </h2>
            <p className="font-serif text-foreground/70 leading-relaxed mb-10">
              Our quarterly report provides transaction-level analysis, micro-neighbourhood pricing shifts, and forward indicators not available in public data sources. Distributed exclusively to verified clients and advisory relationships.
            </p>
            <button
              onClick={() => setReportDialogOpen(true)}
              className="font-sans text-xs uppercase tracking-widest text-primary border border-primary px-10 py-4 hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              Request Report
            </button>
          </motion.div>

        </motion.div>
      </div>

      {/* Report request dialog — reuses ContactForm with preset values */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="mb-6">
            <DialogTitle className="font-serif text-2xl font-normal text-primary">
              Request the Quarterly Market Report
            </DialogTitle>
            <DialogDescription className="font-serif text-foreground/60 leading-relaxed">
              Complete the form below and we will follow up to verify your eligibility and arrange distribution.
            </DialogDescription>
          </DialogHeader>
          {/* key forces ContactForm to remount (fresh useForm state) each time dialog opens */}
          <ContactForm
            key={String(reportDialogOpen)}
            defaultInquiryType="market-report-request"
            defaultMessage={`I would like to request the ${REPORT_NAME}.`}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
