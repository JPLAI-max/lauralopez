import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import {
  contentApi,
  campaignApi,
  type AdminArticle,
  type AdminMedia,
  type AdminProperty,
  type AdminSlot,
  type ArticleCategory,
  type SlotSuggestion,
  type CampaignTemplate,
  type CampaignPreviewTask,
} from "../../lib/admin-api";
import { ApiError } from "../../lib/admin-api";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
const CATEGORY_LABELS: Record<string, string> = {
  neighborhood: "Neighborhood",
  regulatory: "Regulatory",
  architecture: "Architecture",
  insurance: "Insurance",
  market: "Market",
};

function fmt(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Tab strip
// ---------------------------------------------------------------------------
type Tab = "articles" | "properties" | "media";

// ============================================================================
// ARTICLES TAB
// ============================================================================
function ArticlesTab() {
  const [articles, setArticles] = useState<AdminArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminArticle | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [category, setCategory] = useState<ArticleCategory>("neighborhood");
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");

  function loadArticles() {
    setLoading(true);
    contentApi.articles.list()
      .then((r) => setArticles(r.articles))
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadArticles(); }, []);

  function openCreate() {
    setEditing(null);
    setCreating(true);
    setTitle(""); setSlug(""); setSlugEdited(false);
    setCategory("neighborhood"); setExcerpt(""); setBody(""); setStatus("draft");
    setError(""); setPreview(false);
  }

  function openEdit(a: AdminArticle) {
    setEditing(a); setCreating(false);
    setTitle(a.title); setSlug(a.slug); setSlugEdited(true);
    setCategory(a.category as ArticleCategory); setExcerpt(a.excerpt);
    setBody(a.body); setStatus(a.status); setError(""); setPreview(false);
  }

  function close() { setEditing(null); setCreating(false); setError(""); }

  function handleTitleChange(v: string) {
    setTitle(v);
    if (!slugEdited) setSlug(slugify(v));
  }

  async function save() {
    if (!title.trim()) { setError("Title is required."); return; }
    if (!slug.trim()) { setError("Slug is required."); return; }
    setSaving(true); setError("");
    try {
      if (creating) {
        await contentApi.articles.create({ title, slug, category, excerpt, body, status });
      } else if (editing) {
        await contentApi.articles.patch(editing.id, { title, slug, category, excerpt, body, status });
      }
      loadArticles(); close();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string) {
    if (!confirm("Delete this article? This cannot be undone.")) return;
    await contentApi.articles.delete(id);
    loadArticles();
  }

  const showForm = creating || !!editing;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-sans text-xs uppercase tracking-widest text-muted-foreground">Articles</h2>
        <button onClick={openCreate} className="px-3 py-1.5 bg-primary text-primary-foreground font-sans text-xs uppercase tracking-widest hover:bg-primary/90">
          New Article
        </button>
      </div>

      {showForm && (
        <div className="border border-border p-4 space-y-3 bg-card">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-sans text-xs uppercase tracking-widest text-muted-foreground">
              {creating ? "New Article" : "Edit Article"}
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setPreview(!preview)}
                className="px-2 py-1 border border-border font-sans text-xs uppercase tracking-widest hover:bg-muted"
              >
                {preview ? "Edit" : "Preview"}
              </button>
              <button onClick={close} className="px-2 py-1 border border-border font-sans text-xs uppercase tracking-widest hover:bg-muted">
                Cancel
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          {!preview ? (
            <div className="space-y-3">
              <div>
                <label className="block font-sans text-xs text-muted-foreground mb-1">Title</label>
                <input
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Article title"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-sans text-xs text-muted-foreground mb-1">Slug</label>
                  <input
                    value={slug}
                    onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }}
                    className="w-full border border-border px-3 py-2 text-xs font-mono bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block font-sans text-xs text-muted-foreground mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ArticleCategory)}
                    className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-sans text-xs text-muted-foreground mb-1">Excerpt</label>
                <textarea
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  rows={2}
                  className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
              <div>
                <label className="block font-sans text-xs text-muted-foreground mb-1">Body (Markdown)</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  className="w-full border border-border px-3 py-2 text-xs font-mono bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                />
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "draft" | "published")}
                  className="border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-2 bg-primary text-primary-foreground font-sans text-xs uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <h4 className="font-serif text-2xl mb-2">{title}</h4>
              <p className="text-sm text-muted-foreground italic mb-4">{excerpt}</p>
              <div
                className="prose prose-sm max-w-none text-foreground"
                dangerouslySetInnerHTML={{ __html: marked.parse(body) as string }}
              />
            </div>
          )}
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!loading && articles.length === 0 && (
        <p className="text-sm text-muted-foreground">No articles yet. Run seed-content to populate.</p>
      )}

      {!loading && articles.length > 0 && (
        <div className="border border-border divide-y divide-border">
          {articles.map((a) => (
            <div key={a.id} className="flex items-start gap-3 p-3 hover:bg-muted/30">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className={`font-sans text-[10px] uppercase tracking-widest px-1.5 py-0.5 ${a.status === "published" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {a.status}
                  </span>
                  <span className="font-sans text-[10px] uppercase tracking-widest text-muted-foreground">
                    {CATEGORY_LABELS[a.category] ?? a.category}
                  </span>
                </div>
                <p className="text-sm font-medium truncate">{a.title}</p>
                <p className="text-xs text-muted-foreground">{a.status === "published" ? fmt(a.publishedAt) : `Updated ${fmt(a.updatedAt)}`}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEdit(a)} className="px-2 py-1 border border-border font-sans text-xs hover:bg-muted">Edit</button>
                <button onClick={() => del(a.id)} className="px-2 py-1 border border-destructive/40 text-destructive font-sans text-xs hover:bg-destructive/10">Del</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// CAMPAIGN OFFER MODAL
// ============================================================================
function CampaignOfferModal({
  propertyId,
  propertyAddress,
  onDone,
}: {
  propertyId:      string;
  propertyAddress: string;
  onDone:          () => void;
}) {
  const today       = new Date().toISOString().slice(0, 10);
  const [anchorDate, setAnchorDate]       = useState(today);
  const [templates, setTemplates]         = useState<CampaignTemplate[]>([]);
  const [templateId, setTemplateId]       = useState("");
  const [preview, setPreview]             = useState<CampaignPreviewTask[] | null>(null);
  const [previewing, setPreviewing]       = useState(false);
  const [creating, setCreating]           = useState(false);
  const [error, setError]                 = useState("");

  useEffect(() => {
    campaignApi.templates.list().then((r) => {
      setTemplates(r.templates);
      const def = r.templates.find((t) => t.isDefault && t.trigger === "new_listing") ?? r.templates.find((t) => t.trigger === "new_listing");
      if (def) setTemplateId(def.id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!templateId || !anchorDate) return;
    setPreviewing(true); setPreview(null);
    campaignApi.preview({ propertyId, templateId, anchorDate })
      .then((r) => setPreview(r.tasks))
      .catch(() => setPreview([]))
      .finally(() => setPreviewing(false));
  }, [templateId, anchorDate, propertyId]);

  async function startCampaign() {
    if (!templateId) return;
    setCreating(true); setError("");
    try {
      await campaignApi.create({ propertyId, templateId, anchorDate, trigger: "new_listing" });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create campaign.");
    } finally { setCreating(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background border border-border w-full max-w-sm max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Start Listing Campaign?</h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{propertyAddress}</p>
          </div>
          <button onClick={onDone} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        {templates.length > 1 && (
          <div>
            <label className="block font-sans text-xs text-muted-foreground mb-1">Template</label>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}
              className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary">
              {templates.filter((t) => t.trigger === "new_listing").map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block font-sans text-xs text-muted-foreground mb-1">Anchor Date (listing date)</label>
          <input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)}
            className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>

        {previewing && <p className="text-xs text-muted-foreground">Loading preview…</p>}

        {preview && preview.length > 0 && (
          <div className="border border-border divide-y divide-border">
            <p className="font-sans text-[10px] uppercase tracking-widest text-muted-foreground px-2 py-1.5">
              {preview.length} tasks
            </p>
            {preview.map((task) => (
              <div key={task.templateItemId} className="flex items-center gap-2 px-2 py-1.5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{task.label}</p>
                  <p className="text-[10px] text-muted-foreground">{task.channel.replace(/_/g, " ")}</p>
                </div>
                <p className="text-[10px] font-mono text-muted-foreground shrink-0">
                  {task.computedDate ? new Date(task.computedDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : `+${task.offsetDays}d`}
                </p>
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex gap-2">
          <button onClick={startCampaign} disabled={creating || !templateId}
            className="flex-1 px-3 py-2 bg-primary text-primary-foreground font-sans text-xs uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50">
            {creating ? "Creating…" : "Start Campaign"}
          </button>
          <button onClick={onDone}
            className="px-3 py-2 border border-border font-sans text-xs uppercase tracking-widest hover:bg-muted">
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PROPERTIES TAB
// ============================================================================
function PropertiesTab() {
  const [properties, setProperties] = useState<AdminProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminProperty | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Campaign offer
  const [campaignOffer, setCampaignOffer] = useState<{ propertyId: string; propertyAddress: string } | null>(null);

  // Form fields
  const [addr, setAddr] = useState(""); const [nbhd, setNbhd] = useState("");
  const [propStatus, setPropStatus] = useState<"pick" | "listed" | "sold">("pick");
  const [listPrice, setListPrice] = useState(""); const [soldPrice, setSoldPrice] = useState("");
  const [soldDate, setSoldDate] = useState(""); const [beds, setBeds] = useState("");
  const [baths, setBaths] = useState(""); const [sqft, setSqft] = useState("");
  const [yearBuilt, setYearBuilt] = useState(""); const [architect, setArchitect] = useState("");
  const [isLaura, setIsLaura] = useState(false); const [brokerage, setBrokerage] = useState("");
  const [commentary, setCommentary] = useState(""); const [archNotes, setArchNotes] = useState("");
  const [lotNotes, setLotNotes] = useState(""); const [valueNotes, setValueNotes] = useState("");
  const [featured, setFeatured] = useState(false); const [sortOrder, setSortOrder] = useState("0");
  const [archived, setArchived] = useState(false);

  function loadProps() {
    setLoading(true);
    contentApi.properties.list()
      .then((r) => setProperties(r.properties))
      .catch(() => setProperties([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadProps(); }, []);

  function reset() {
    setAddr(""); setNbhd(""); setPropStatus("pick"); setListPrice(""); setSoldPrice("");
    setSoldDate(""); setBeds(""); setBaths(""); setSqft(""); setYearBuilt("");
    setArchitect(""); setIsLaura(false); setBrokerage(""); setCommentary("");
    setArchNotes(""); setLotNotes(""); setValueNotes(""); setFeatured(false);
    setSortOrder("0"); setArchived(false); setError("");
  }

  function openCreate() { setCreating(true); setEditing(null); reset(); }

  function openEdit(p: AdminProperty) {
    setEditing(p); setCreating(false);
    setAddr(p.address); setNbhd(p.neighborhood ?? ""); setPropStatus(p.status);
    setListPrice(p.listPrice ?? ""); setSoldPrice(p.soldPrice ?? "");
    setSoldDate(p.soldDate ?? ""); setBeds(p.beds ?? ""); setBaths(p.baths ?? "");
    setSqft(p.sqft ? String(p.sqft) : ""); setYearBuilt(p.yearBuilt ? String(p.yearBuilt) : "");
    setArchitect(p.architect ?? ""); setIsLaura(p.isLauraListing); setBrokerage(p.listingBrokerage ?? "");
    setCommentary(p.commentary ?? ""); setArchNotes(p.architectureNotes ?? "");
    setLotNotes(p.lotNotes ?? ""); setValueNotes(p.valueNotes ?? "");
    setFeatured(p.featured); setSortOrder(String(p.sortOrder)); setArchived(p.archived); setError("");
  }

  function close() { setEditing(null); setCreating(false); setError(""); }

  async function save() {
    if (!addr.trim()) { setError("Address is required."); return; }
    if (!isLaura && !brokerage.trim()) { setError("Listing brokerage is required when this is not Laura's listing."); return; }
    setSaving(true); setError("");
    try {
      const body = {
        address: addr, neighborhood: nbhd || null, status: propStatus,
        listPrice: listPrice ? parseFloat(listPrice) : null,
        soldPrice: soldPrice ? parseFloat(soldPrice) : null,
        soldDate: soldDate || null,
        beds: beds ? parseFloat(beds) : null, baths: baths ? parseFloat(baths) : null,
        sqft: sqft ? parseInt(sqft) : null, yearBuilt: yearBuilt ? parseInt(yearBuilt) : null,
        architect: architect || null, isLauraListing: isLaura,
        listingBrokerage: brokerage || null, commentary: commentary || null,
        architectureNotes: archNotes || null, lotNotes: lotNotes || null, valueNotes: valueNotes || null,
        featured, sortOrder: parseInt(sortOrder) || 0, archived,
      };
      const wasNotListed = creating || (editing && editing.status !== "listed");
      let savedId: string | undefined;
      if (creating) {
        const res = await contentApi.properties.create(body);
        savedId = res.property.id;
      } else if (editing) {
        await contentApi.properties.patch(editing.id, body);
        savedId = editing.id;
      }
      loadProps(); close();
      // Offer campaign when status is now "listed" and it wasn't before
      if (propStatus === "listed" && wasNotListed && savedId) {
        // Only offer if no active new_listing campaign exists for this property
        const { campaigns } = await campaignApi.list();
        const existing = campaigns.find(
          (c) => c.propertyId === savedId && c.trigger === "new_listing" && c.status !== "cancelled",
        );
        if (!existing) setCampaignOffer({ propertyId: savedId, propertyAddress: addr });
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed.");
    } finally { setSaving(false); }
  }

  async function archive(id: string) {
    if (!confirm("Archive this property? It will be hidden from the public site.")) return;
    await contentApi.properties.delete(id);
    loadProps();
  }

  const showForm = creating || !!editing;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-sans text-xs uppercase tracking-widest text-muted-foreground">Properties</h2>
        <button onClick={openCreate} className="px-3 py-1.5 bg-primary text-primary-foreground font-sans text-xs uppercase tracking-widest hover:bg-primary/90">
          New Property
        </button>
      </div>

      {showForm && (
        <div className="border border-border p-4 space-y-3 bg-card">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-sans text-xs uppercase tracking-widest text-muted-foreground">
              {creating ? "New Property" : "Edit Property"}
            </h3>
            <button onClick={close} className="px-2 py-1 border border-border font-sans text-xs uppercase tracking-widest hover:bg-muted">Cancel</button>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-sans text-xs text-muted-foreground mb-1">Address *</label>
              <input value={addr} onChange={(e) => setAddr(e.target.value)} className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="block font-sans text-xs text-muted-foreground mb-1">Neighborhood</label>
              <input value={nbhd} onChange={(e) => setNbhd(e.target.value)} className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="block font-sans text-xs text-muted-foreground mb-1">Status</label>
              <select value={propStatus} onChange={(e) => setPropStatus(e.target.value as typeof propStatus)} className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="pick">Top Pick</option>
                <option value="listed">Listed</option>
                <option value="sold">Sold</option>
              </select>
            </div>
            <div>
              <label className="block font-sans text-xs text-muted-foreground mb-1">List Price</label>
              <input type="number" value={listPrice} onChange={(e) => setListPrice(e.target.value)} className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" placeholder="e.g. 5000000" />
            </div>
            {propStatus === "sold" && (
              <>
                <div>
                  <label className="block font-sans text-xs text-muted-foreground mb-1">Sold Price *</label>
                  <input type="number" value={soldPrice} onChange={(e) => setSoldPrice(e.target.value)} className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="block font-sans text-xs text-muted-foreground mb-1">Sold Date *</label>
                  <input type="date" value={soldDate} onChange={(e) => setSoldDate(e.target.value)} className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </>
            )}
            <div>
              <label className="block font-sans text-xs text-muted-foreground mb-1">Beds</label>
              <input type="number" value={beds} onChange={(e) => setBeds(e.target.value)} className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="block font-sans text-xs text-muted-foreground mb-1">Baths</label>
              <input type="number" value={baths} onChange={(e) => setBaths(e.target.value)} className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="block font-sans text-xs text-muted-foreground mb-1">Sq Ft</label>
              <input type="number" value={sqft} onChange={(e) => setSqft(e.target.value)} className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="block font-sans text-xs text-muted-foreground mb-1">Year Built</label>
              <input type="number" value={yearBuilt} onChange={(e) => setYearBuilt(e.target.value)} className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="block font-sans text-xs text-muted-foreground mb-1">Architect / Style</label>
              <input value={architect} onChange={(e) => setArchitect(e.target.value)} className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="block font-sans text-xs text-muted-foreground mb-1">Sort Order</label>
              <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isLaura} onChange={(e) => setIsLaura(e.target.checked)} className="accent-primary" />
              <span className="text-sm">This is Laura's listing</span>
            </label>
            {!isLaura && (
              <div>
                <label className="block font-sans text-xs text-muted-foreground mb-1">Listing Brokerage * (required for non-Laura listings)</label>
                <input value={brokerage} onChange={(e) => setBrokerage(e.target.value)} className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="accent-primary" />
              <span className="text-sm">Featured</span>
            </label>
            {editing && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="accent-primary" />
                <span className="text-sm">Archived (hidden from public site)</span>
              </label>
            )}
          </div>

          <div>
            <label className="block font-sans text-xs text-muted-foreground mb-1">Commentary (Laura's voice)</label>
            <textarea value={commentary} onChange={(e) => setCommentary(e.target.value)} rows={4} className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
          </div>
          <div>
            <label className="block font-sans text-xs text-muted-foreground mb-1">Architecture Notes</label>
            <textarea value={archNotes} onChange={(e) => setArchNotes(e.target.value)} rows={2} className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-sans text-xs text-muted-foreground mb-1">Lot Notes</label>
              <textarea value={lotNotes} onChange={(e) => setLotNotes(e.target.value)} rows={2} className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
            </div>
            <div>
              <label className="block font-sans text-xs text-muted-foreground mb-1">Value Notes</label>
              <textarea value={valueNotes} onChange={(e) => setValueNotes(e.target.value)} rows={2} className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
            </div>
          </div>

          <button onClick={save} disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground font-sans text-xs uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50">
            {saving ? "Saving…" : "Save Property"}
          </button>
        </div>
      )}

      {campaignOffer && (
        <CampaignOfferModal
          propertyId={campaignOffer.propertyId}
          propertyAddress={campaignOffer.propertyAddress}
          onDone={() => setCampaignOffer(null)}
        />
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!loading && properties.length === 0 && (
        <p className="text-sm text-muted-foreground">No properties yet. Run seed-content to populate.</p>
      )}

      {!loading && properties.length > 0 && (
        <div className="border border-border divide-y divide-border">
          {properties.map((p) => (
            <div key={p.id} className={`flex items-start gap-3 p-3 hover:bg-muted/30 ${p.archived ? "opacity-50" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="font-sans text-[10px] uppercase tracking-widest px-1.5 py-0.5 bg-muted text-muted-foreground">
                    {p.status}
                  </span>
                  {p.archived && <span className="font-sans text-[10px] uppercase tracking-widest px-1.5 py-0.5 bg-muted text-muted-foreground">archived</span>}
                  {!p.isLauraListing && p.listingBrokerage && (
                    <span className="font-sans text-[10px] text-muted-foreground">{p.listingBrokerage}</span>
                  )}
                </div>
                <p className="text-sm font-medium truncate">{p.address}</p>
                <p className="text-xs text-muted-foreground">
                  {p.listPrice ? `$${(parseFloat(p.listPrice) / 1e6).toFixed(1)}M` : ""}
                  {p.soldPrice && p.soldDate ? ` · Sold ${fmt(p.soldDate)}` : ""}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEdit(p)} className="px-2 py-1 border border-border font-sans text-xs hover:bg-muted">Edit</button>
                {!p.archived && (
                  <button onClick={() => archive(p.id)} className="px-2 py-1 border border-border font-sans text-xs hover:bg-muted text-muted-foreground">Archive</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// FOCAL POINT EDITOR
// ============================================================================
function FocalPointEditor({
  media,
  onSave,
}: {
  media: AdminMedia;
  onSave: (focalX: number, focalY: number) => void;
}) {
  const [x, setX] = useState(parseFloat(media.focalX));
  const [y, setY] = useState(parseFloat(media.focalY));
  const containerRef = useRef<HTMLDivElement>(null);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = containerRef.current!.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setX(nx); setY(ny);
  }

  function handleDrag(e: React.MouseEvent<HTMLDivElement>) {
    if (e.buttons !== 1) return;
    handleClick(e);
  }

  const imageUrl = media.url ?? (Object.values(media.derivatives)[0] ?? null);

  return (
    <div className="space-y-2">
      <p className="font-sans text-xs text-muted-foreground">Click to set focal point</p>
      <div
        ref={containerRef}
        className="relative bg-muted cursor-crosshair select-none"
        style={{ aspectRatio: media.aspectRatio }}
        onClick={handleClick}
        onMouseMove={handleDrag}
      >
        {imageUrl && (
          <img
            src={imageUrl}
            alt={media.altText ?? media.filename}
            className="w-full h-full object-cover"
            style={{ objectPosition: `${Math.round(x * 100)}% ${Math.round(y * 100)}%` }}
            draggable={false}
          />
        )}
        <div
          className="absolute w-5 h-5 border-2 border-white rounded-full shadow-md -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: `${x * 100}%`, top: `${y * 100}%`, background: "rgba(255,255,255,0.3)" }}
        />
      </div>
      <button
        onClick={() => onSave(x, y)}
        className="px-3 py-1.5 bg-primary text-primary-foreground font-sans text-xs uppercase tracking-widest"
      >
        Save focal point
      </button>
    </div>
  );
}

// ============================================================================
// MEDIA TAB
// ============================================================================
type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; filename: string }
  | { phase: "done"; media: AdminMedia; suggestions: SlotSuggestion[] }
  | { phase: "assigning"; media: AdminMedia; slot: SlotSuggestion };

function MediaTab() {
  const [items, setItems] = useState<AdminMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminMedia | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>({ phase: "idle" });
  const [uploadError, setUploadError] = useState("");
  const [slots, setSlots] = useState<AdminSlot[]>([]);
  const [filterAspect, setFilterAspect] = useState<string>("all");
  const fileRef = useRef<HTMLInputElement>(null);

  function loadMedia() {
    setLoading(true);
    Promise.all([
      contentApi.media.list(),
      contentApi.slots.list(),
    ])
      .then(([mr, sr]) => { setItems(mr.media); setSlots(sr.slots); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadMedia(); }, []);

  async function handleFile(file: File) {
    setUploadError("");
    if (!file.type.startsWith("image/")) { setUploadError("Only image files are allowed."); return; }
    if (file.size > 25 * 1024 * 1024) { setUploadError("File exceeds 25 MB."); return; }

    setUploadState({ phase: "uploading", filename: file.name });

    try {
      const { uploadUrl, storageKey } = await contentApi.media.presign({
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });

      // Upload directly to R2
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload to storage failed.");

      const { media } = await contentApi.media.complete({
        storageKey,
        filename: file.name,
        mimeType: file.type,
      });

      const { suggestions } = await contentApi.media.slotSuggestions(media.id);
      setUploadState({ phase: "done", media, suggestions });
      loadMedia();
    } catch (e) {
      setUploadError(e instanceof ApiError ? `${e.message}` : (e as Error).message ?? "Upload failed.");
      setUploadState({ phase: "idle" });
    }
  }

  async function assignToSlot(media: AdminMedia, slot: SlotSuggestion) {
    await contentApi.slots.assign(slot.slotKey, media.id);
    setUploadState({ phase: "idle" });
    loadMedia();
  }

  async function saveFocal(media: AdminMedia, focalX: number, focalY: number) {
    const updated = await contentApi.media.patch(media.id, { focalX, focalY });
    setSelected(updated.media);
    setItems((prev) => prev.map((m) => (m.id === updated.media.id ? updated.media : m)));
  }

  async function deleteMedia(id: string) {
    if (!confirm("Delete this image? This cannot be undone.")) return;
    await contentApi.media.delete(id);
    setSelected(null);
    loadMedia();
  }

  // Aspect ratio filter options
  const aspectOptions = Array.from(new Set(items.map((m) => {
    const r = parseFloat(m.aspectRatio);
    if (r > 1.5) return "landscape";
    if (r < 0.85) return "portrait";
    return "square";
  })));

  const filtered = items.filter((m) => {
    if (filterAspect === "all") return true;
    const r = parseFloat(m.aspectRatio);
    if (filterAspect === "landscape") return r > 1.5;
    if (filterAspect === "portrait") return r < 0.85;
    if (filterAspect === "square") return r >= 0.85 && r <= 1.5;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-sans text-xs uppercase tracking-widest text-muted-foreground">Media Library</h2>
        <button
          onClick={() => fileRef.current?.click()}
          className="px-3 py-1.5 bg-primary text-primary-foreground font-sans text-xs uppercase tracking-widest hover:bg-primary/90"
        >
          Upload Image
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ""; }} />
      </div>

      {/* Upload status */}
      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
      {uploadState.phase === "uploading" && (
        <p className="text-sm text-muted-foreground">Uploading {uploadState.filename}…</p>
      )}
      {uploadState.phase === "done" && (
        <div className="border border-border p-4 space-y-3 bg-card">
          <p className="text-sm font-medium">
            Uploaded {uploadState.media.filename} — {uploadState.media.width}×{uploadState.media.height}
          </p>
          <p className="font-sans text-xs text-muted-foreground uppercase tracking-widest">Use for:</p>
          <div className="flex flex-wrap gap-2">
            {uploadState.suggestions.map((s) => (
              <button
                key={s.slotKey}
                onClick={() => setUploadState({ phase: "assigning", media: uploadState.media, slot: s })}
                className="px-3 py-1.5 border border-primary text-primary font-sans text-xs uppercase tracking-widest hover:bg-primary/10"
              >
                {s.label}
              </button>
            ))}
            <button
              onClick={() => setUploadState({ phase: "idle" })}
              className="px-3 py-1.5 border border-border font-sans text-xs uppercase tracking-widest hover:bg-muted"
            >
              Just add to library
            </button>
          </div>
        </div>
      )}
      {uploadState.phase === "assigning" && (
        <div className="border border-border p-4 space-y-3 bg-card">
          <p className="text-sm font-medium">Assign to "{uploadState.slot.label}"?</p>
          {uploadState.slot.currentThumbnail && (
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <p className="font-sans text-xs text-muted-foreground mb-1">Currently assigned</p>
                <img src={uploadState.slot.currentThumbnail} className="h-24 w-auto object-cover border border-border" alt="current" />
              </div>
              <div className="flex-1">
                <p className="font-sans text-xs text-muted-foreground mb-1">New image</p>
                {uploadState.media.url && (
                  <img
                    src={uploadState.media.url}
                    style={{ objectPosition: `${Math.round(parseFloat(uploadState.media.focalX) * 100)}% ${Math.round(parseFloat(uploadState.media.focalY) * 100)}%` }}
                    className="h-24 w-auto object-cover border border-border"
                    alt="new"
                  />
                )}
              </div>
            </div>
          )}
          {!uploadState.slot.currentThumbnail && uploadState.media.url && (
            <div>
              <p className="font-sans text-xs text-muted-foreground mb-1">New image</p>
              <img
                src={uploadState.media.url}
                style={{ aspectRatio: uploadState.slot.aspectRatio, objectFit: "cover", objectPosition: `${Math.round(parseFloat(uploadState.media.focalX) * 100)}% ${Math.round(parseFloat(uploadState.media.focalY) * 100)}%` }}
                className="max-h-48 border border-border"
                alt="new"
              />
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => assignToSlot(uploadState.media, uploadState.slot)}
              className="px-4 py-2 bg-primary text-primary-foreground font-sans text-xs uppercase tracking-widest hover:bg-primary/90"
            >
              Use this image
            </button>
            <button
              onClick={() => setUploadState({ phase: "done", media: uploadState.media, suggestions: [] })}
              className="px-4 py-2 border border-border font-sans text-xs uppercase tracking-widest hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter */}
      {items.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {["all", "landscape", "portrait", "square"].map((opt) => (
            <button
              key={opt}
              onClick={() => setFilterAspect(opt)}
              className={`px-2 py-1 font-sans text-xs uppercase tracking-widest border ${filterAspect === opt ? "border-primary text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!loading && items.length === 0 && (
        <p className="text-sm text-muted-foreground">No media yet. Upload your first image above.</p>
      )}

      {!loading && items.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {filtered.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelected(selected?.id === m.id ? null : m)}
              className={`aspect-square overflow-hidden border relative ${selected?.id === m.id ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50"}`}
            >
              {m.url ? (
                <img
                  src={m.url}
                  alt={m.altText ?? m.filename}
                  className="w-full h-full object-cover"
                  style={{ objectPosition: `${Math.round(parseFloat(m.focalX) * 100)}% ${Math.round(parseFloat(m.focalY) * 100)}%` }}
                />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  <span className="text-[10px] text-muted-foreground">No URL</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Media detail panel */}
      {selected && (
        <div className="border border-border p-4 space-y-4 bg-card">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{selected.filename}</p>
              <p className="text-xs text-muted-foreground">
                {selected.width}×{selected.height} · {formatBytes(selected.sizeBytes)} · {selected.mimeType}
              </p>
            </div>
            <button onClick={() => deleteMedia(selected.id)} className="shrink-0 px-2 py-1 border border-destructive/40 text-destructive font-sans text-xs hover:bg-destructive/10">
              Delete
            </button>
          </div>

          {/* Focal point editor */}
          <FocalPointEditor media={selected} onSave={(x, y) => saveFocal(selected, x, y)} />

          {/* Alt text */}
          <div>
            <label className="block font-sans text-xs text-muted-foreground mb-1">Alt text</label>
            <input
              defaultValue={selected.altText ?? ""}
              onBlur={async (e) => {
                const updated = await contentApi.media.patch(selected.id, { altText: e.target.value || null });
                setSelected(updated.media);
              }}
              className="w-full border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Slot assignment */}
          <div>
            <p className="font-sans text-xs uppercase tracking-widest text-muted-foreground mb-2">Assign to slot</p>
            <div className="flex flex-wrap gap-2">
              {slots.map((slot) => {
                const slotAspect = parseFloat(slot.aspectRatio);
                const mediaAspect = parseFloat(selected.aspectRatio);
                const ratioDiff = Math.abs(mediaAspect - slotAspect) / slotAspect;
                const compatible = selected.width >= slot.minWidth && ratioDiff <= 0.25;
                return (
                  <button
                    key={slot.slotKey}
                    disabled={!compatible}
                    onClick={async () => {
                      await contentApi.slots.assign(slot.slotKey, selected.id);
                      loadMedia();
                    }}
                    className={`px-2 py-1 border font-sans text-xs uppercase tracking-widest ${
                      compatible
                        ? "border-primary text-primary hover:bg-primary/10"
                        : "border-border text-muted-foreground opacity-40 cursor-not-allowed"
                    } ${slot.currentMediaId === selected.id ? "bg-primary/10" : ""}`}
                    title={!compatible ? `Requires min ${slot.minWidth}px width and similar aspect ratio` : ""}
                  >
                    {slot.label}
                    {slot.currentMediaId === selected.id && " ✓"}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN CONTENT PAGE
// ============================================================================
export default function AdminContent() {
  const [tab, setTab] = useState<Tab>("articles");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground mb-1">Content</h1>
        <p className="text-sm text-muted-foreground">Manage articles, properties, and media.</p>
      </div>

      {/* Tab strip */}
      <div className="flex border-b border-border gap-0">
        {(["articles", "properties", "media"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 font-sans text-xs uppercase tracking-widest border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "articles" && <ArticlesTab />}
      {tab === "properties" && <PropertiesTab />}
      {tab === "media" && <MediaTab />}
    </div>
  );
}
