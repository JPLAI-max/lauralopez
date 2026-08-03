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

// Fallback hardcoded properties — matches original TopPicks.tsx exactly
const FALLBACK_PICKS: PublicProperty[] = [
  { id: "1", address: "Beverly Hills North of Sunset", neighborhood: "Beverly Hills", status: "pick", listPrice: "27500000", soldPrice: null, soldDate: null, beds: "7", baths: "9", sqft: null, lotSqft: null, yearBuilt: null, architect: "Classic Revival", isLauraListing: false, listingBrokerage: "Various", commentary: "An exceptionally rare flat acre in the city's most established corridor. The architectural pedigree provides a foundation for generational holding. The scale of the public rooms cannot be replicated under current hillside ordinances.", architectureNotes: null, lotNotes: null, valueNotes: null, heroMediaId: null, heroUrl: "/images/top-pick-1.png", heroSrcset: null, heroAlt: "Beverly Hills North of Sunset", heroFocalX: "0.5", heroFocalY: "0.5", featured: false, sortOrder: 0, archived: false, createdAt: "", updatedAt: "" },
  { id: "2", address: "Trousdale Estates", neighborhood: "Trousdale Estates", status: "pick", listPrice: "20000000", soldPrice: null, soldDate: null, beds: "4", baths: "5", sqft: null, lotSqft: null, yearBuilt: null, architect: "Mid-Century Modernist", isLauraListing: false, listingBrokerage: "Various", commentary: "Perfectly sited to capture explosive city-to-ocean views while maintaining profound privacy. A prime candidate for meticulous restoration. The roofline and terrazzo detailing remain intact from the original 1968 commission.", architectureNotes: null, lotNotes: null, valueNotes: null, heroMediaId: null, heroUrl: "/images/top-pick-2.png", heroSrcset: null, heroAlt: "Trousdale Estates", heroFocalX: "0.5", heroFocalY: "0.5", featured: false, sortOrder: 1, archived: false, createdAt: "", updatedAt: "" },
  { id: "3", address: "Holmby Hills", neighborhood: "Holmby Hills", status: "pick", listPrice: "50000000", soldPrice: null, soldDate: null, beds: "9", baths: "12", sqft: null, lotSqft: null, yearBuilt: null, architect: "Traditional Compound", isLauraListing: false, listingBrokerage: "Various", commentary: "Estate-sized acreage offering immediate proximity to the Platinum Triangle's core. Represents significant land value protected by neighborhood scale. Includes separate dual guest structures and championship tennis court.", architectureNotes: null, lotNotes: null, valueNotes: null, heroMediaId: null, heroUrl: "/images/top-pick-3.png", heroSrcset: null, heroAlt: "Holmby Hills", heroFocalX: "0.5", heroFocalY: "0.5", featured: false, sortOrder: 2, archived: false, createdAt: "", updatedAt: "" },
  { id: "4", address: "Pacific Palisades", neighborhood: "Pacific Palisades", status: "pick", listPrice: "25000000", soldPrice: null, soldDate: null, beds: "6", baths: "8", sqft: null, lotSqft: null, yearBuilt: null, architect: "Contemporary Luxury", isLauraListing: false, listingBrokerage: "Various", commentary: "Unobstructed views of the Pacific with a flawless indoor-outdoor flow. The engineering required to achieve these cantilevered volumes is extraordinary, representing a sunk cost that benefits the next steward.", architectureNotes: null, lotNotes: null, valueNotes: null, heroMediaId: null, heroUrl: "/images/top-pick-4.png", heroSrcset: null, heroAlt: "Pacific Palisades", heroFocalX: "0.5", heroFocalY: "0.5", featured: false, sortOrder: 3, archived: false, createdAt: "", updatedAt: "" },
  { id: "5", address: "Beverly Park", neighborhood: "Beverly Park", status: "pick", listPrice: "67500000", soldPrice: null, soldDate: null, beds: "10", baths: "14", sqft: null, lotSqft: null, yearBuilt: null, architect: "European Villa", isLauraListing: false, listingBrokerage: "Various", commentary: "Positioned within the most secure enclave in Los Angeles. This asset provides the scale necessary for significant entertaining while offering the privacy demanded by high-profile principals.", architectureNotes: null, lotNotes: null, valueNotes: null, heroMediaId: null, heroUrl: "/images/top-pick-5.png", heroSrcset: null, heroAlt: "Beverly Park", heroFocalX: "0.5", heroFocalY: "0.5", featured: false, sortOrder: 4, archived: false, createdAt: "", updatedAt: "" },
  { id: "6", address: "Bel Air", neighborhood: "Bel Air", status: "pick", listPrice: "35000000", soldPrice: null, soldDate: null, beds: "5", baths: "7", sqft: null, lotSqft: null, yearBuilt: null, architect: "Modern Architectural", isLauraListing: false, listingBrokerage: "Various", commentary: "A rare lower Bel Air offering with a private gate and long drive. The integration of the structure into the natural canyon topography exemplifies the best of contemporary California design.", architectureNotes: null, lotNotes: null, valueNotes: null, heroMediaId: null, heroUrl: "/images/top-pick-6.png", heroSrcset: null, heroAlt: "Bel Air", heroFocalX: "0.5", heroFocalY: "0.5", featured: false, sortOrder: 5, archived: false, createdAt: "", updatedAt: "" },
];

function PropertyCard({ pick }: { pick: PublicProperty }) {
  const stats = [
    pick.beds && `${pick.beds} Beds`,
    pick.baths && `${pick.baths} Baths`,
    pick.sqft && `${pick.sqft.toLocaleString()} SF`,
    pick.lotSqft && `${(pick.lotSqft / 43560).toFixed(1)} Acres`,
  ].filter(Boolean).join(" • ");

  const priceLabel = pick.soldPrice
    ? `Closed ${formatPrice(pick.soldPrice)}${pick.soldDate ? ` · ${new Date(pick.soldDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : ""}`
    : formatPrice(pick.listPrice);

  const imgStyle = {
    objectPosition: focalObjectPosition(pick.heroFocalX, pick.heroFocalY),
  };

  return (
    <motion.div variants={fadeUpVariant} className="group">
      <div className="aspect-[4/3] bg-card mb-8 overflow-hidden">
        {pick.heroUrl ? (
          <img
            src={pick.heroUrl}
            srcSet={pick.heroSrcset ?? undefined}
            sizes="(max-width: 768px) 100vw, 50vw"
            alt={pick.heroAlt ?? pick.address}
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
        <div className="flex justify-between items-start gap-4">
          <div>
            {pick.architect && (
              <span className="font-sans text-xs uppercase tracking-widest text-secondary block mb-2">
                {pick.architect}
              </span>
            )}
            <h3 className="font-serif text-3xl text-primary">{pick.address}</h3>
          </div>
          {pick.status === "sold" && (
            <span className="shrink-0 px-3 py-1 border border-primary/30 font-sans text-xs uppercase tracking-widest text-primary/60">
              Sold
            </span>
          )}
        </div>

        <div className="w-12 h-px bg-border my-4" />

        <p className="font-serif text-lg leading-relaxed text-foreground/80 italic min-h-[120px]">
          "{pick.commentary}"
        </p>

        {!pick.isLauraListing && pick.listingBrokerage && (
          <p className="font-sans text-xs text-muted-foreground">
            Listing brokerage: {pick.listingBrokerage}
          </p>
        )}

        <div className="pt-6 border-t border-border flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            {stats && (
              <span className="font-sans text-sm tracking-wider uppercase block text-muted-foreground">
                {stats}
              </span>
            )}
            {priceLabel && (
              <span className="font-sans text-sm tracking-wider uppercase block font-medium mt-1">
                {priceLabel}
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
}

export default function TopPicks() {
  const [allProperties, setAllProperties] = useState<PublicProperty[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch both pick and sold properties
    publicApi.properties
      .list({ status: "pick,sold" })
      .then((res) => {
        setAllProperties(res.properties.length > 0 ? res.properties : FALLBACK_PICKS);
      })
      .catch(() => setAllProperties(FALLBACK_PICKS))
      .finally(() => setLoading(false));
  }, []);

  const picks = loading
    ? FALLBACK_PICKS
    : allProperties.filter((p) => p.status === "pick");

  const previouslyFeatured = loading
    ? []
    : allProperties.filter((p) => p.status === "sold");

  return (
    <div className="w-full pb-24 bg-background">
      <div className="container mx-auto px-6">
        <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="max-w-7xl mx-auto">

          <motion.div variants={fadeUpVariant} className="mb-20 text-center max-w-4xl mx-auto">
            <h1 className="font-serif text-[clamp(2.25rem,6vw,3.75rem)] text-primary mb-6">Laura's Top Picks</h1>
            <p className="font-serif text-xl text-foreground/80 leading-relaxed">
              Properties personally curated by Laura Lopez — not necessarily her listings, but properties she believes represent exceptional strategic value in the current market.
            </p>
          </motion.div>

          {picks.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16">
              {picks.map((pick) => (
                <PropertyCard key={pick.id} pick={pick} />
              ))}
            </div>
          )}

          {picks.length === 0 && !loading && (
            <motion.div variants={fadeUpVariant} className="text-center py-24">
              <p className="font-serif text-xl text-foreground/60">No current picks at this time.</p>
            </motion.div>
          )}

          {previouslyFeatured.length > 0 && (
            <motion.div variants={fadeUpVariant} className="mt-32">
              <div className="border-b border-border pb-4 mb-16">
                <h2 className="font-sans uppercase tracking-widest text-lg text-primary">Previously Featured</h2>
                <p className="font-serif text-muted-foreground mt-2">
                  Properties Laura called. The record of what they closed at.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16">
                {previouslyFeatured.map((pick) => (
                  <PropertyCard key={pick.id} pick={pick} />
                ))}
              </div>
            </motion.div>
          )}

        </motion.div>
      </div>
    </div>
  );
}
