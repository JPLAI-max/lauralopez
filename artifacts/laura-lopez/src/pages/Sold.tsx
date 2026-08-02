import { motion, type Variants } from "framer-motion";

const fadeUpVariant: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } },
};

const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

export interface SoldProperty {
  id: string;
  address: string;
  neighborhood: string;
  soldPrice: string;
  soldDate: string;
  beds: number;
  baths: number;
  sqft: string;
  imageUrl?: string;
  representedSide?: "Buyer" | "Seller" | "Both";
  url?: string;
}

const placeholderSolds: SoldProperty[] = [];

function SoldCard({ property }: { property: SoldProperty }) {
  return (
    <motion.div
      variants={fadeUpVariant}
      className="group cursor-pointer"
      data-testid={`card-sold-${property.id}`}
    >
      <a href={property.url || "#"} target={property.url ? "_blank" : undefined} rel="noreferrer">
        <div className="aspect-[4/3] mb-5 overflow-hidden bg-card relative">
          {property.imageUrl ? (
            <img
              src={property.imageUrl}
              alt={property.address}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            />
          ) : (
            <div className="w-full h-full bg-card flex items-center justify-center">
              <span className="font-sans text-xs tracking-widest uppercase text-muted-foreground">
                Photo Pending
              </span>
            </div>
          )}
          <div className="absolute top-4 left-4 bg-primary px-3 py-1">
            <span className="font-sans text-xs tracking-widest uppercase text-primary-foreground">
              Sold
            </span>
          </div>
          {property.representedSide && (
            <div className="absolute top-4 right-4 bg-secondary/90 px-3 py-1">
              <span className="font-sans text-xs tracking-widest uppercase text-white">
                {property.representedSide}
              </span>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-start gap-4">
            <h3 className="font-serif text-xl leading-snug text-foreground group-hover:text-primary transition-colors">
              {property.address}
            </h3>
            <span className="font-sans text-sm tracking-wider text-secondary shrink-0 pt-1">
              {property.soldPrice}
            </span>
          </div>
          <p className="font-sans text-xs tracking-widest uppercase text-muted-foreground">
            {property.neighborhood}
          </p>
          <div className="flex gap-6 pt-1">
            <span className="font-sans text-sm text-muted-foreground">
              {property.beds} BD
            </span>
            <span className="font-sans text-sm text-muted-foreground">
              {property.baths} BA
            </span>
            {property.sqft && (
              <span className="font-sans text-sm text-muted-foreground">
                {property.sqft} SF
              </span>
            )}
            <span className="font-sans text-sm text-muted-foreground ml-auto">
              {property.soldDate}
            </span>
          </div>
        </div>
      </a>
    </motion.div>
  );
}

export default function Sold() {
  const hasSolds = placeholderSolds.length > 0;

  return (
    <div className="min-h-screen bg-background pt-24">
      <section className="py-20 border-b border-border">
        <div className="container mx-auto px-6">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUpVariant}
            className="max-w-2xl"
          >
            <p className="font-sans text-xs tracking-widest uppercase text-primary/60 mb-4">
              Transaction History
            </p>
            <h1 className="font-serif text-5xl md:text-6xl text-foreground mb-6">
              Recent Sales
            </h1>
            <p className="font-serif text-xl text-muted-foreground leading-relaxed">
              A record of completed transactions — properties acquired and placed for clients of Laura Lopez and The Beverly Hills Estates.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-24">
        <div className="container mx-auto px-6">
          {hasSolds ? (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10"
            >
              {placeholderSolds.map((property) => (
                <SoldCard key={property.id} property={property} />
              ))}
            </motion.div>
          ) : (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={fadeUpVariant}
              className="py-24 text-center"
            >
              <div className="max-w-lg mx-auto space-y-6">
                <div className="w-16 h-px bg-secondary mx-auto" />
                <h2 className="font-serif text-2xl text-foreground">
                  Transaction Record Coming Soon
                </h2>
                <p className="font-serif text-muted-foreground leading-relaxed">
                  Laura's recent sales and completed transactions will appear here once connected to The Beverly Hills Estates portfolio. Her track record spans Beverly Hills, Bel Air, Holmby Hills, Trousdale Estates, and Beverly Park.
                </p>
                <div className="pt-4">
                  <a
                    href="/contact"
                    className="inline-block px-8 py-4 bg-primary text-primary-foreground font-sans text-sm tracking-wider uppercase hover:opacity-90 transition-opacity"
                    data-testid="button-sold-cta"
                  >
                    Private Consultation
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </section>
    </div>
  );
}
