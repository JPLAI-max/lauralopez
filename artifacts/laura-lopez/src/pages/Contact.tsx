import { motion, type Variants } from "framer-motion";
import ContactForm from "@/components/ContactForm";

const fadeUpVariant: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } },
};

export default function Contact() {
  return (
    <div className="w-full pt-32 pb-24 min-h-screen bg-card">
      <div className="container mx-auto px-6">
        <motion.div initial="hidden" animate="visible" variants={fadeUpVariant} className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-16 lg:gap-24">
          
          <div className="w-full lg:w-1/3">
            <h1 className="font-serif text-5xl text-primary mb-8">Private Consultation</h1>
            <div className="w-12 h-px bg-border mb-8"></div>
            
            <div className="font-serif text-lg text-foreground/80 leading-relaxed space-y-6 mb-12">
              <p>
                I maintain a deliberately constrained advisory practice to ensure each client receives the attention and rigor required for complex real estate structuring.
              </p>
              <p>
                Whether you are evaluating a potential acquisition, requiring a strategic review of existing legacy assets, or navigating the disposition of a significant estate, all conversations begin with absolute discretion.
              </p>
            </div>

            <div className="space-y-8 border-t border-border pt-8">
              <div>
                <h4 className="font-sans uppercase tracking-widest text-xs text-secondary mb-2">Direct Contact</h4>
                <p className="font-serif text-lg">inquiries@lauralopez-advisory.com</p>
                <p className="font-serif text-lg">+1 (310) 555-0199</p>
              </div>
              
              <div>
                <h4 className="font-sans uppercase tracking-widest text-xs text-secondary mb-2">Office</h4>
                <p className="font-serif text-lg">Beverly Hills Estates<br />Beverly Hills, CA 90210</p>
              </div>

              <div className="p-6 bg-background border border-border">
                <p className="font-sans uppercase tracking-wider text-xs text-primary/80 leading-relaxed">
                  All inquiries, whether direct or via intermediaries, are treated with complete confidentiality. We adhere to strict non-disclosure protocols.
                </p>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-2/3">
            <div className="bg-background p-8 md:p-12 border border-border shadow-sm">
              <h2 className="font-serif text-3xl text-primary mb-8">Inquiry Detail</h2>
              <ContactForm />
            </div>
          </div>

        </motion.div>
      </div>
    </div>
  );
}
