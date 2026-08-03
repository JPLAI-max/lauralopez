import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  contactsApi,
  type Contact,
  type ContactInteraction,
} from "@/lib/admin-api";
import {
  X,
  Search,
  Archive,
  Plus,
  Bell,
  BellOff,
  Upload,
  ChevronRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CONTACT_TYPES = [
  { value: "",               label: "All types" },
  { value: "client",         label: "Client" },
  { value: "attorney",       label: "Attorney" },
  { value: "wealth_manager", label: "Wealth Manager" },
  { value: "trust_officer",  label: "Trust Officer" },
  { value: "family_office",  label: "Family Office" },
  { value: "private_banker", label: "Private Banker" },
  { value: "agent",          label: "Agent" },
  { value: "vendor",         label: "Vendor" },
  { value: "other",          label: "Other" },
];

const TYPE_CHIP: Record<string, string> = {
  client:         "bg-blue-50 text-blue-700 border-blue-200",
  attorney:       "bg-purple-50 text-purple-700 border-purple-200",
  wealth_manager: "bg-emerald-50 text-emerald-700 border-emerald-200",
  trust_officer:  "bg-teal-50 text-teal-700 border-teal-200",
  family_office:  "bg-indigo-50 text-indigo-700 border-indigo-200",
  private_banker: "bg-sky-50 text-sky-700 border-sky-200",
  agent:          "bg-amber-50 text-amber-700 border-amber-200",
  vendor:         "bg-orange-50 text-orange-700 border-orange-200",
  other:          "bg-muted text-muted-foreground border-border",
};

const INTERACTION_ICONS: Record<string, string> = {
  note: "📝", email: "✉️", call: "📞", meeting: "🤝", event: "📅",
};

function fmtType(t: string) {
  return (CONTACT_TYPES.find((c) => c.value === t)?.label) ?? t;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

// ---------------------------------------------------------------------------
// Create Contact Modal
// ---------------------------------------------------------------------------
function CreateContactModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Contact) => void }) {
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    company: "", contactType: "other", neighborhood: "", notes: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await contactsApi.create({
        ...form,
        email: form.email || undefined,
        phone: form.phone || undefined,
        company: form.company || undefined,
        neighborhood: form.neighborhood || undefined,
        notes: form.notes || undefined,
      });
      onCreated(res.contact);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create contact");
    } finally {
      setSaving(false);
    }
  }

  const field = (label: string, key: keyof typeof form, type = "text") => (
    <div>
      <label className="block text-xs uppercase tracking-wider text-foreground/50 mb-0.5">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="w-full border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card border border-border w-full max-w-md">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">New Contact</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {field("First Name *", "firstName")}
            {field("Last Name", "lastName")}
          </div>
          {field("Email", "email", "email")}
          {field("Phone", "phone", "tel")}
          {field("Company", "company")}
          {field("Neighborhood", "neighborhood")}
          <div>
            <label className="block text-xs uppercase tracking-wider text-foreground/50 mb-0.5">Type</label>
            <select
              value={form.contactType}
              onChange={(e) => setForm((f) => ({ ...f, contactType: e.target.value }))}
              className="w-full border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {CONTACT_TYPES.slice(1).map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          {field("Notes", "notes")}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-1.5 text-xs border border-border hover:bg-muted">Cancel</button>
            <button
              type="submit"
              disabled={saving || !form.firstName}
              className="flex-1 py-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import Modal
// ---------------------------------------------------------------------------
function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ action: string; email: string | null; name: string }[] | null>(null);
  const [counts, setCounts] = useState<{ created: number; merged: number } | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length === 0) { setError("No rows found in CSV"); return; }
    setRows(parsed);
    setError("");

    // Map CSV columns → API fields
    const apiRows = parsed.map((r) => ({
      firstName:   r["first_name"] || r["firstname"] || r["first name"] || (r["name"] ?? "").split(" ")[0] || "",
      lastName:    r["last_name"]  || r["lastname"]  || r["last name"]  || (r["name"] ?? "").split(" ").slice(1).join(" ") || "",
      email:       r["email"] || null,
      phone:       r["phone"] || r["phone_number"] || null,
      company:     r["company"] || r["organization"] || null,
      contactType: r["type"] || r["contact_type"] || "other",
      notes:       r["notes"] || r["note"] || null,
    }));

    setLoading(true);
    try {
      const res = await contactsApi.import(apiRows, true);
      setPreview(res.preview);
      setCounts({ created: res.created, merged: res.merged });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    const apiRows = rows.map((r) => ({
      firstName:   r["first_name"] || r["firstname"] || r["first name"] || (r["name"] ?? "").split(" ")[0] || "",
      lastName:    r["last_name"]  || r["lastname"]  || r["last name"]  || (r["name"] ?? "").split(" ").slice(1).join(" ") || "",
      email:       r["email"] || null,
      phone:       r["phone"] || r["phone_number"] || null,
      company:     r["company"] || r["organization"] || null,
      contactType: r["type"] || r["contact_type"] || "other",
      notes:       r["notes"] || r["note"] || null,
    }));

    setLoading(true);
    try {
      const res = await contactsApi.import(apiRows, false);
      setCounts({ created: res.created, merged: res.merged });
      setDone(true);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card border border-border w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold">Import Contacts from CSV</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {!done ? (
            <>
              <p className="text-xs text-muted-foreground">
                Expected columns: <code className="bg-muted px-1">first_name, last_name, email, phone, company, type, notes</code>
                <br />Or use a single <code className="bg-muted px-1">name</code> column; it will be split on the last space.
                <br /><strong>Imported contacts are never auto-subscribed to Market Intelligence.</strong>
              </p>
              <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="text-xs" />
              {error && <p className="text-xs text-destructive">{error}</p>}

              {loading && <p className="text-xs text-muted-foreground">Processing…</p>}

              {preview && counts && (
                <>
                  <div className="flex gap-4 text-xs font-medium">
                    <span className="text-emerald-700">{counts.created} to create</span>
                    <span className="text-amber-700">{counts.merged} to merge</span>
                  </div>
                  <div className="border border-border overflow-y-auto max-h-48">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left px-2 py-1 border-b border-border">Action</th>
                          <th className="text-left px-2 py-1 border-b border-border">Name</th>
                          <th className="text-left px-2 py-1 border-b border-border">Email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((p, i) => (
                          <tr key={i} className={p.action === "merge" ? "bg-amber-50" : ""}>
                            <td className="px-2 py-0.5 border-b border-border capitalize">{p.action}</td>
                            <td className="px-2 py-0.5 border-b border-border">{p.name}</td>
                            <td className="px-2 py-0.5 border-b border-border text-muted-foreground">{p.email ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    onClick={handleCommit}
                    disabled={loading}
                    className="w-full py-2 text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {loading ? "Importing…" : `Confirm Import (${counts.created + counts.merged} rows)`}
                  </button>
                </>
              )}
            </>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm font-medium text-foreground">Import complete</p>
              <p className="text-xs text-muted-foreground mt-1">
                {counts?.created} created · {counts?.merged} merged
              </p>
              <button onClick={onClose} className="mt-4 px-4 py-1.5 text-xs border border-border hover:bg-muted">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contact Detail Panel
// ---------------------------------------------------------------------------
function ContactDetail({
  contactId,
  onClose,
  onArchived,
}: {
  contactId: string;
  onClose: () => void;
  onArchived: () => void;
}) {
  const qc = useQueryClient();
  const [noteBody, setNoteBody] = useState("");
  const [noteKind, setNoteKind] = useState("note");
  const [addingNote, setAddingNote] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["contact-detail", contactId],
    queryFn: () => contactsApi.get(contactId),
  });

  const archiveMut = useMutation({
    mutationFn: () => contactsApi.archive(contactId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-contacts"] });
      onArchived();
    },
  });

  const subscribeMut = useMutation({
    mutationFn: (sub: boolean) => sub ? contactsApi.subscribe(contactId) : contactsApi.unsubscribe(contactId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact-detail", contactId] }),
  });

  async function addNote() {
    if (!noteBody.trim()) return;
    setAddingNote(true);
    try {
      await contactsApi.addInteraction(contactId, { kind: noteKind, body: noteBody });
      setNoteBody("");
      qc.invalidateQueries({ queryKey: ["contact-detail", contactId] });
    } finally {
      setAddingNote(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col flex-1 lg:flex-none lg:w-[400px] lg:shrink-0 border-l border-border bg-card">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <span className="text-sm font-semibold">Contact</span>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <p className="text-xs text-muted-foreground p-4">Loading…</p>
      </div>
    );
  }

  if (!data) return null;
  const { contact, interactions, transactions } = data;
  const fullName = `${contact.firstName} ${contact.lastName}`.trim();
  const isSubscribed = contact.subscribedIntelligence && !contact.unsubscribedAt;

  return (
    <div className="flex flex-col flex-1 lg:flex-none lg:w-[400px] lg:shrink-0 border-l border-border bg-card overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold truncate">{fullName || "—"}</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0 ml-2">
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-5 text-sm">
        {/* Type chip + subscribe */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-2 py-0.5 border rounded ${TYPE_CHIP[contact.contactType] ?? TYPE_CHIP.other}`}>
            {fmtType(contact.contactType)}
          </span>
          <button
            onClick={() => subscribeMut.mutate(!isSubscribed)}
            disabled={subscribeMut.isPending}
            className={`flex items-center gap-1 text-xs px-2 py-0.5 border rounded transition-colors disabled:opacity-50 ${
              isSubscribed
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {isSubscribed ? <Bell size={10} /> : <BellOff size={10} />}
            {isSubscribed ? "Subscribed" : "Subscribe"}
          </button>
          {contact.unsubscribedAt && (
            <span className="text-xs text-muted-foreground">Unsubscribed {fmtDate(contact.unsubscribedAt)}</span>
          )}
        </div>

        {/* Contact fields */}
        <div className="grid grid-cols-1 gap-1 text-xs">
          {contact.email && (
            <div className="flex justify-between">
              <span className="text-foreground/40 uppercase tracking-wider">Email</span>
              <a href={`mailto:${contact.email}`} className="text-primary underline truncate ml-2">{contact.email}</a>
            </div>
          )}
          {contact.phone && (
            <div className="flex justify-between">
              <span className="text-foreground/40 uppercase tracking-wider">Phone</span>
              <span>{contact.phone}</span>
            </div>
          )}
          {contact.company && (
            <div className="flex justify-between">
              <span className="text-foreground/40 uppercase tracking-wider">Company</span>
              <span className="truncate ml-2">{contact.company}</span>
            </div>
          )}
          {contact.neighborhood && (
            <div className="flex justify-between">
              <span className="text-foreground/40 uppercase tracking-wider">Neighborhood</span>
              <span>{contact.neighborhood}</span>
            </div>
          )}
          {contact.lastContactedAt && (
            <div className="flex justify-between">
              <span className="text-foreground/40 uppercase tracking-wider">Last contact</span>
              <span>{fmtDate(contact.lastContactedAt)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-foreground/40 uppercase tracking-wider">Source</span>
            <span className="capitalize">{contact.source}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-foreground/40 uppercase tracking-wider">Added</span>
            <span>{fmtDate(contact.createdAt)}</span>
          </div>
        </div>

        {contact.notes && (
          <div>
            <p className="text-xs uppercase tracking-wider text-foreground/40 mb-1">Notes</p>
            <p className="text-xs text-foreground/70 bg-background border border-border p-2 whitespace-pre-wrap">{contact.notes}</p>
          </div>
        )}

        {/* Linked transactions */}
        {transactions.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wider text-foreground/40 mb-1">Transactions</p>
            <div className="space-y-1">
              {transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-xs bg-background border border-border px-2 py-1.5">
                  <span className="truncate">{t.propertyAddress}</span>
                  <span className="ml-2 shrink-0 text-muted-foreground capitalize">{t.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick-add interaction */}
        <div>
          <p className="text-xs uppercase tracking-wider text-foreground/40 mb-1.5">Add Interaction</p>
          <div className="flex gap-1.5">
            <select
              value={noteKind}
              onChange={(e) => setNoteKind(e.target.value)}
              className="text-xs border border-border bg-background px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary shrink-0"
            >
              {["note", "email", "call", "meeting", "event"].map((k) => (
                <option key={k} value={k}>{k.charAt(0).toUpperCase() + k.slice(1)}</option>
              ))}
            </select>
            <input
              type="text"
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addNote(); }}
              placeholder="Type and press Enter…"
              className="flex-1 text-xs border border-border bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary min-w-0"
            />
            <button
              onClick={addNote}
              disabled={!noteBody.trim() || addingNote}
              className="text-xs px-2 py-1 border border-border hover:bg-muted disabled:opacity-40 shrink-0"
            >
              Add
            </button>
          </div>
        </div>

        {/* Interaction timeline — newest first */}
        {interactions.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wider text-foreground/40 mb-1.5">Timeline</p>
            <div className="space-y-2">
              {interactions.map((ix) => (
                <InteractionItem key={ix.id} ix={ix} />
              ))}
            </div>
          </div>
        )}

        {/* Archive */}
        <button
          onClick={() => { if (confirm("Archive this contact?")) archiveMut.mutate(); }}
          disabled={archiveMut.isPending || contact.archived}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
        >
          <Archive size={12} />
          {contact.archived ? "Archived" : "Archive contact"}
        </button>
      </div>
    </div>
  );
}

function InteractionItem({ ix }: { ix: ContactInteraction }) {
  return (
    <div className="border border-border bg-background px-3 py-2 text-xs">
      <div className="flex items-center gap-1.5 mb-0.5 text-foreground/50">
        <span>{INTERACTION_ICONS[ix.kind] ?? "•"}</span>
        <span className="capitalize">{ix.kind}</span>
        <span className="ml-auto">{fmtDateTime(ix.occurredAt)}</span>
      </div>
      <p className="text-foreground/80 whitespace-pre-wrap leading-snug">{ix.body}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Contacts Page
// ---------------------------------------------------------------------------
export default function AdminContacts() {
  const qc = useQueryClient();
  const [contactType, setContactType] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-contacts", contactType, search, page],
    queryFn: () =>
      contactsApi.list({ contactType: contactType || undefined, search: search || undefined, page }),
  });

  return (
    <div className="flex h-full min-h-0" style={{ minHeight: "calc(100vh - 6rem)" }}>
      {/* ── LIST PANEL ─────────────────────────────────────────────── */}
      <div
        className={`flex flex-col min-w-0 flex-1 ${selectedId ? "hidden lg:flex" : "flex"}`}
        style={{ minWidth: 320 }}
      >
        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <h1 className="text-lg font-semibold text-foreground shrink-0">
            Contacts
            {data?.intelligenceCount != null && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {data.intelligenceCount} subscribed
              </span>
            )}
          </h1>

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search
                size={11}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search name, email…"
                className="pl-6 pr-2 py-1 text-xs border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary w-40"
              />
            </div>

            {/* Type filter */}
            <select
              value={contactType}
              onChange={(e) => { setContactType(e.target.value); setPage(1); }}
              className="text-xs border border-border bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {CONTACT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            {/* Import */}
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1 text-xs px-2 py-1 border border-border hover:bg-muted transition-colors"
            >
              <Upload size={11} /> Import
            </button>

            {/* New */}
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1 text-xs px-2 py-1 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus size={11} /> New
            </button>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !data?.contacts.length ? (
          <p className="text-sm text-muted-foreground">
            {search || contactType ? "No matches." : "No contacts yet. Import a CSV or add one manually."}
          </p>
        ) : (
          <>
            <div className="border border-border overflow-x-auto">
              <table className="w-full text-sm border-collapse" style={{ minWidth: 520 }}>
                <thead className="bg-muted text-xs uppercase tracking-wider text-foreground/50">
                  <tr>
                    <th className="text-left px-3 py-1.5 border-b border-border font-medium">Name</th>
                    <th className="text-left px-3 py-1.5 border-b border-border font-medium hidden sm:table-cell">Type</th>
                    <th className="text-left px-3 py-1.5 border-b border-border font-medium hidden md:table-cell">Company</th>
                    <th className="text-left px-3 py-1.5 border-b border-border font-medium hidden lg:table-cell">Neighborhood</th>
                    <th className="text-left px-3 py-1.5 border-b border-border font-medium hidden xl:table-cell">Last Contact</th>
                    <th className="text-left px-3 py-1.5 border-b border-border font-medium">Intel</th>
                  </tr>
                </thead>
                <tbody>
                  {data.contacts.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className={`cursor-pointer hover:bg-muted/50 transition-colors ${
                        selectedId === c.id ? "bg-muted/40" : ""
                      }`}
                    >
                      <td className="px-3 py-1.5 border-b border-border">
                        <div className="text-sm leading-tight">{c.firstName} {c.lastName}</div>
                        {c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
                      </td>
                      <td className="px-3 py-1.5 border-b border-border hidden sm:table-cell">
                        <span className={`text-xs px-1.5 py-0.5 border rounded ${TYPE_CHIP[c.contactType] ?? TYPE_CHIP.other}`}>
                          {fmtType(c.contactType)}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 border-b border-border hidden md:table-cell text-xs text-muted-foreground">
                        {c.company ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 border-b border-border hidden lg:table-cell text-xs text-muted-foreground">
                        {c.neighborhood ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 border-b border-border hidden xl:table-cell text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDate(c.lastContactedAt)}
                      </td>
                      <td className="px-3 py-1.5 border-b border-border">
                        {c.subscribedIntelligence && !c.unsubscribedAt ? (
                          <Bell size={12} className="text-emerald-600" />
                        ) : (
                          <span className="text-muted-foreground/30 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.pagination.totalPages > 1 && (
              <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 border border-border hover:bg-muted disabled:opacity-40"
                >
                  ← Prev
                </button>
                <span>{page} / {data.pagination.totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                  disabled={page === data.pagination.totalPages}
                  className="px-2 py-1 border border-border hover:bg-muted disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── DETAIL PANEL ───────────────────────────────────────────── */}
      {selectedId && (
        <ContactDetail
          contactId={selectedId}
          onClose={() => setSelectedId(null)}
          onArchived={() => {
            setSelectedId(null);
            qc.invalidateQueries({ queryKey: ["admin-contacts"] });
          }}
        />
      )}

      {/* Modals */}
      {showCreate && (
        <CreateContactModal
          onClose={() => setShowCreate(false)}
          onCreated={(c) => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ["admin-contacts"] });
            setSelectedId(c.id);
          }}
        />
      )}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onDone={() => qc.invalidateQueries({ queryKey: ["admin-contacts"] })}
        />
      )}
    </div>
  );
}
