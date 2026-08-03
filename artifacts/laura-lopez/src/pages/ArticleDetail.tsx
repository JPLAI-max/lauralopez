import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { marked } from "marked";
import { publicApi } from "../lib/public-api";

const CATEGORY_LABELS: Record<string, string> = {
  neighborhood: "Neighborhood Intelligence",
  regulatory:   "Regulatory Intelligence",
  architecture: "Architecture",
  insurance:    "Insurance & Risk",
  market:       "Market",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

export default function ArticleDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [article, setArticle] = useState<{
    id: string; slug: string; title: string; category: string;
    excerpt: string | null; body: string | null; heroUrl: string | null;
    heroAlt: string | null; publishedAt: string | null;
  } | null | "404" | "loading">("loading");

  useEffect(() => {
    if (!slug) { setArticle("404"); return; }
    setArticle("loading");
    publicApi.articles
      .get(slug)
      .then((res) => setArticle(res.article as typeof article & {}))
      .catch((err: { status?: number }) => {
        if (err?.status === 404) setArticle("404");
        else setArticle("404");
      });
  }, [slug]);

  // --- Loading ---
  if (article === "loading") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <span className="font-sans text-xs uppercase tracking-widest text-muted-foreground animate-pulse">
          Loading…
        </span>
      </div>
    );
  }

  // --- 404 ---
  if (article === "404" || !article) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 px-6 text-center">
        <span className="font-sans text-xs uppercase tracking-widest text-secondary">404</span>
        <h1 className="font-serif text-3xl text-primary">Article not found</h1>
        <p className="font-serif text-muted-foreground max-w-sm">
          This report may have been moved, unpublished, or does not exist.
        </p>
        <Link
          href="/market-intelligence"
          className="font-sans text-xs uppercase tracking-widest text-primary border-b border-primary pb-0.5 hover:opacity-70 transition-opacity"
        >
          ← Back to Market Intelligence
        </Link>
      </div>
    );
  }

  const bodyHtml = article.body
    ? String(marked.parse(article.body))
    : "";

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="w-full pb-32"
    >
      {/* Hero image */}
      {article.heroUrl && (
        <div className="w-full h-[45vh] sm:h-[55vh] overflow-hidden mb-16">
          <img
            src={article.heroUrl}
            alt={article.heroAlt ?? article.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Header */}
      <div className="container mx-auto px-6">
        <div className="max-w-2xl mx-auto">
          <nav className="mb-8">
            <Link
              href="/market-intelligence"
              className="font-sans text-xs uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
            >
              ← Market Intelligence
            </Link>
          </nav>

          {/* Category + date */}
          <div className="flex flex-wrap items-baseline gap-4 mb-6">
            <span className="font-sans text-xs uppercase tracking-widest text-secondary">
              {CATEGORY_LABELS[article.category] ?? article.category}
            </span>
            {article.publishedAt && (
              <>
                <span className="text-border text-xs">·</span>
                <time
                  dateTime={article.publishedAt}
                  className="font-sans text-xs uppercase tracking-widest text-muted-foreground"
                >
                  {fmtDate(article.publishedAt)}
                </time>
              </>
            )}
          </div>

          <h1 className="font-serif text-[clamp(1.75rem,5vw,3rem)] leading-tight text-primary mb-8">
            {article.title}
          </h1>

          {article.excerpt && (
            <p className="font-serif text-xl text-foreground/70 leading-relaxed mb-12 border-l-2 border-secondary pl-6">
              {article.excerpt}
            </p>
          )}
        </div>
      </div>

      {/* Body */}
      {bodyHtml && (
        <div className="container mx-auto px-6">
          <div
            className="
              max-w-2xl mx-auto
              prose prose-stone dark:prose-invert
              prose-headings:font-serif prose-headings:font-normal
              prose-p:font-serif prose-p:leading-relaxed prose-p:text-foreground/80
              prose-a:text-primary prose-a:no-underline hover:prose-a:underline
              prose-blockquote:border-secondary prose-blockquote:font-serif prose-blockquote:italic
              prose-strong:text-foreground
              prose-hr:border-border
              prose-li:font-serif prose-li:text-foreground/80
            "
            // Body is admin-generated markdown from the CMS — not user-supplied.
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        </div>
      )}

      {/* Footer nav */}
      <div className="container mx-auto px-6 mt-16">
        <div className="max-w-2xl mx-auto border-t border-border pt-8">
          <Link
            href="/market-intelligence"
            className="font-sans text-xs uppercase tracking-widest text-primary hover:opacity-70 transition-opacity"
          >
            ← Back to Market Intelligence
          </Link>
        </div>
      </div>
    </motion.article>
  );
}
