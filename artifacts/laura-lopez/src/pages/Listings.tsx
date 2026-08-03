import { motion, type Variants } from "framer-motion";
import { Link } from "wouter";
import { useEffect, useState } from "react";
import { publicApi, type PublicProperty, formatPrice, focalObjectPosition } from "../lib/public-api";

const fadeUpVariant: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } },
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

export default function Listings() {
  const [listings, setListings] = useState<PublicProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    publicApi.properties
      .list({ status: "listed" })
      .then((res) => setListings(res.properties))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="w-full pb-24 bg-background">
      <div className="container mx-auto px-6">
        <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="max-w-7xl mx-auto">

          <motion.div variants={fadeUpVariant} className="mb-20 text-center max-w-4xl mx-auto">
            <h1 className="font-serif text-[clamp(2.25rem,6vw,3.75rem)] text-primary mb-6">Current Listings</h1>
            <p className="font-serif text-xl text-foreground/80 leading-relaxed">
              Properties currently represented by Laura Lopez and The Beverly Hills Estates.
            </p>
          </motion.div>

          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16">
              {[0, 1, 2].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[4/3] bg-muted mb-8" />
                  <div className="h-4 bg-muted rounded mb-3 w-2/3" />
                  <div className="h-8 bg-muted rounded mb-4 w-full" />
                  <div className="h-4 bg-muted rounded w-full" />
                </div>
              ))}
            </div>
          )}

          {!loading && (error || listings.length === 0) && (
            <motion.div variants={fadeUpVariant} className="text-center py-32">
              <p className="font-serif text-3xl text-primary mb-6">Listings Coming Soon</p>
              <p className="font-serif text-xl text-foreground/80 mb-12 max-w-2xl mx-auto">
                Properties in Beverly Hills, Bel Air, Holmby Hills, Trousdale Estates, and Beverly Park — available exclusively through Laura Lopez.
              </p>
              <Link
                href="/contact"
                className="inline-block px-10 py-4 border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors font-sans uppercase tracking-widest text-xs"
              >
                Private Consultation
              </Link>
            </motion.div>
          )}

          {!loading && !error && listings.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16">
              {listings.map((listing) => {
                const stats = [
                  listing.beds && `${listing.beds} Beds`,
                  listing.baths && `${listing.baths} Baths`,
                  listing.sqft && `${listing.sqft.toLocaleString()} SF`,
                  listing.lotSqft && `${(listing.lotSqft / 43560).toFixed(1)} Acres`,
                ].filter(Boolean).join(" • ");

                const imgStyle = {
                  objectPosition: focalObjectPosition(listing.heroFocalX, listing.heroFocalY),
                };

                return (
                  <motion.div key={listing.id} variants={fadeUpVariant} className="group">
                    <div className="aspect-[4/3] bg-card mb-8 overflow-hidden">
                      {listing.heroUrl ? (
                        <img
                          src={listing.heroUrl}
                          srcSet={listing.heroSrcset ?? undefined}
                          sizes="(max-width: 768px) 100vw, 50vw"
                          alt={listing.heroAlt ?? listing.address}
                          className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                          style={imgStyle}
                        />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center">
                          <span className="font-sans text-xs uppercase tracking-widest text-muted-foreground">No image</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      {listing.architect && (
                        <span className="font-sans text-xs uppercase tracking-widest text-secondary block">
                          {listing.architect}
                        </span>
                      )}
                      <h3 className="font-serif text-3xl text-primary">{listing.address}</h3>
                      {listing.neighborhood && listing.neighborhood !== listing.address && (
                        <p className="font-sans text-sm text-muted-foreground uppercase tracking-wider">
                          {listing.neighborhood}
                        </p>
                      )}

                      <div className="w-12 h-px bg-border my-4" />

                      {listing.commentary && (
                        <p className="font-serif text-lg leading-relaxed text-foreground/80 italic">
                          "{listing.commentary}"
                        </p>
                      )}

                      {!listing.isLauraListing && listing.listingBrokerage && (
                        <p className="font-sans text-xs text-muted-foreground">
                          Listing brokerage: {listing.listingBrokerage}
                        </p>
                      )}

                      <div className="pt-6 border-t border-border flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                        <div>
                          {stats && (
                            <span className="font-sans text-sm tracking-wider uppercase block text-muted-foreground">
                              {stats}
                            </span>
                          )}
                          {listing.listPrice && (
                            <span className="font-sans text-sm tracking-wider uppercase block font-medium mt-1">
                              {formatPrice(listing.listPrice)}
                            </span>
                          )}
                        </div>
                        <Link
                          href="/contact"
                          className="px-6 py-3 border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors font-sans uppercase tracking-widest text-xs text-center"
                        >
                          Inquire
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

        </motion.div>
      </div>
    </div>
  );
}
