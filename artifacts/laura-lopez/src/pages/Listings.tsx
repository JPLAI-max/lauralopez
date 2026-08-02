import { motion, type Variants } from "framer-motion";

const fadeUpVariant: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } },
};

const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

export interface Listing {
  id: string;
  address: string;
  neighborhood: string;
  price: string;
  beds: number;
  baths: number;
  sqft: string;
  imageUrl?: string;
  status: "active";
  propertyType?: string;
  mlsId?: string;
  url?: string;
}

const placeholderListings: Listing[] = [];

function ListingCard({ listing }: { listing: Listing }) {
  return (
    <motion.div
      variants={fadeUpVariant}
      className="group cursor-pointer"
      data-testid={`card-listing-${listing.id}`}
    >
      <a href={listing.url || "#"} target={listing.url ? "_blank" : undefined} rel="noreferrer">
        <div className="aspect-[4/3] mb-5 overflow-hidden bg-card">
          {listing.imageUrl ? (
            <img
              src={listing.imageUrl}
              alt={listing.address}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            />
          ) : (
            <div className="w-full h-full bg-card flex items-center justify-center">
              <span className="font-sans text-xs tracking-widest uppercase text-muted-foreground">
                Photo Pending
              </span>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-start gap-4">
            <h3 className="font-serif text-xl leading-snug text-foreground group-hover:text-primary transition-colors">
              {listing.address}
            </h3>
            <span className="font-sans text-sm tracking-wider text-secondary shrink-0 pt-1">
              {listing.price}
            </span>
          </div>
          <p className="font-sans text-xs tracking-widest uppercase text-muted-foreground">
            {listing.neighborhood}
          </p>
          <div className="flex gap-6 pt-1">
            <span className="font-sans text-sm text-muted-foreground">
              {listing.beds} BD
            </span>
            <span className="font-sans text-sm text-muted-foreground">
              {listing.baths} BA
            </span>
            {listing.sqft && (
              <span className="font-sans text-sm text-muted-foreground">
                {listing.sqft} SF
              </span>
            )}
          </div>
        </div>
      </a>
    </motion.div>
  );
}

export default function Listings() {
  const hasListings = placeholderListings.length > 0;

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
              Beverly Hills Estates
            </p>
            <h1 className="font-serif text-5xl md:text-6xl text-foreground mb-6">
              Current Listings
            </h1>
            <p className="font-serif text-xl text-muted-foreground leading-relaxed">
              Active properties available through Laura Lopez and The Beverly Hills Estates.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-24">
        <div className="container mx-auto px-6">
          {hasListings ? (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10"
            >
              {placeholderListings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
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
                  Listings Coming Soon
                </h2>
                <p className="font-serif text-muted-foreground leading-relaxed">
                  Laura's current active listings will appear here once connected to The Beverly Hills Estates portfolio. For immediate property inquiries, please request a private consultation.
                </p>
                <div className="pt-4">
                  <a
                    href="/contact"
                    className="inline-block px-8 py-4 bg-primary text-primary-foreground font-sans text-sm tracking-wider uppercase hover:opacity-90 transition-opacity"
                    data-testid="button-listings-cta"
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
