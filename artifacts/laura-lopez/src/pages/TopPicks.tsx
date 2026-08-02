import { motion, type Variants } from "framer-motion";
import { Link } from "wouter";

const fadeUpVariant: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } },
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const properties = [
  {
    id: 1,
    img: "/images/top-pick-1.png",
    area: "Beverly Hills North of Sunset",
    arch: "Classic Revival",
    commentary: "An exceptionally rare flat acre in the city's most established corridor. The architectural pedigree provides a foundation for generational holding. The scale of the public rooms cannot be replicated under current hillside ordinances.",
    stats: "1.2 Acres • 7 Beds • 9 Baths",
    price: "$25M - $30M"
  },
  {
    id: 2,
    img: "/images/top-pick-2.png",
    area: "Trousdale Estates",
    arch: "Mid-Century Modernist",
    commentary: "Perfectly sited to capture explosive city-to-ocean views while maintaining profound privacy. A prime candidate for meticulous restoration. The roofline and terrazzo detailing remain intact from the original 1968 commission.",
    stats: "0.8 Acres • 4 Beds • 5 Baths",
    price: "$18M - $22M"
  },
  {
    id: 3,
    img: "/images/top-pick-3.png",
    area: "Holmby Hills",
    arch: "Traditional Compound",
    commentary: "Estate-sized acreage offering immediate proximity to the Platinum Triangle's core. Represents significant land value protected by neighborhood scale. Includes separate dual guest structures and championship tennis court.",
    stats: "2.5 Acres • 9 Beds • 12 Baths",
    price: "$45M - $55M"
  },
  {
    id: 4,
    img: "/images/top-pick-4.png",
    area: "Pacific Palisades",
    arch: "Contemporary Luxury",
    commentary: "Unobstructed views of the Pacific with a flawless indoor-outdoor flow. The engineering required to achieve these cantilevered volumes is extraordinary, representing a sunk cost that benefits the next steward.",
    stats: "0.6 Acres • 6 Beds • 8 Baths",
    price: "$22M - $28M"
  },
  {
    id: 5,
    img: "/images/top-pick-5.png",
    area: "Beverly Park",
    arch: "European Villa",
    commentary: "Positioned within the most secure enclave in Los Angeles. This asset provides the scale necessary for significant entertaining while offering the privacy demanded by high-profile principals.",
    stats: "3.1 Acres • 10 Beds • 14 Baths",
    price: "$60M - $75M"
  },
  {
    id: 6,
    img: "/images/top-pick-6.png",
    area: "Bel Air",
    arch: "Modern Architectural",
    commentary: "A rare lower Bel Air offering with a private gate and long drive. The integration of the structure into the natural canyon topography exemplifies the best of contemporary California design.",
    stats: "1.5 Acres • 5 Beds • 7 Baths",
    price: "$30M - $40M"
  }
];

export default function TopPicks() {
  return (
    <div className="w-full  pb-24 bg-background">
      <div className="container mx-auto px-6">
        <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="max-w-7xl mx-auto">
          
          <motion.div variants={fadeUpVariant} className="mb-20 text-center max-w-4xl mx-auto">
            <h1 className="font-serif text-5xl md:text-6xl text-primary mb-6">Laura's Top Picks</h1>
            <p className="font-serif text-xl text-foreground/80 leading-relaxed">
              Properties personally curated by Laura Lopez — not necessarily her listings, but properties she believes represent exceptional strategic value in the current market.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16">
            {properties.map((pick) => (
              <motion.div key={pick.id} variants={fadeUpVariant} className="group">
                <div className="aspect-[4/3] bg-card mb-8 overflow-hidden">
                  <img 
                    src={pick.img} 
                    alt={pick.area} 
                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                  />
                </div>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <span className="font-sans text-xs uppercase tracking-widest text-secondary block mb-2">{pick.arch}</span>
                      <h3 className="font-serif text-3xl text-primary">{pick.area}</h3>
                    </div>
                  </div>
                  
                  <div className="w-12 h-px bg-border my-4"></div>
                  
                  <p className="font-serif text-lg leading-relaxed text-foreground/80 italic min-h-[120px]">
                    "{pick.commentary}"
                  </p>
                  
                  <div className="pt-6 border-t border-border flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <div>
                      <span className="font-sans text-sm tracking-wider uppercase block text-muted-foreground">{pick.stats}</span>
                      <span className="font-sans text-sm tracking-wider uppercase block font-medium mt-1">{pick.price}</span>
                    </div>
                    <Link href="/contact" className="px-6 py-3 border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors font-sans uppercase tracking-widest text-xs text-center">
                      Inquire
                    </Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

        </motion.div>
      </div>
    </div>
  );
}
