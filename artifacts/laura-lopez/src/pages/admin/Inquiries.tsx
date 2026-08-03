import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, type Inquiry } from "@/lib/admin-api";
import { X, Search, UserPlus, ExternalLink } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  read: "Read",
  archived: "Archived",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-secondary/15 text-secondary border-secondary/30",
  read: "bg-muted text-muted-foreground border-border",
  archived: "bg-muted/50 text-muted-foreground/60 border-border",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatField(value: string) {
  return value.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AdminInquiries() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Inquiry | null>(null);
  // contactId → null (not saved), string (existing contact id), or "saved" (just created)
  const [savedContact, setSavedContact] = useState<{ id: string; name: string } | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [saveContactError, setSaveContactError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-inquiries", statusFilter, page],
    queryFn: () =>
      adminApi.listInquiries({ status: statusFilter || undefined, page }),
  });

  // Client-side search: filters on name, email, message
  const inquiries = useMemo(() => {
    if (!data?.inquiries) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.inquiries;
    return data.inquiries.filter(
      (inq) =>
        inq.fullName.toLowerCase().includes(q) ||
        inq.email.toLowerCase().includes(q) ||
        inq.message.toLowerCase().includes(q),
    );
  }, [data?.inquiries, search]);

  const patchStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminApi.patchInquiry(id, status),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["admin-inquiries"] });
      qc.invalidateQueries({ queryKey: ["admin-unread-count"] });
      if (selected?.id === res.inquiry.id) setSelected(res.inquiry);
    },
  });

  function openDetail(inquiry: Inquiry) {
    setSelected(inquiry);
    setSavedContact(null);
    setSaveContactError("");
    if (inquiry.status === "new") {
      adminApi.getInquiry(inquiry.id).then((r) => {
        setSelected(r.inquiry);
        qc.invalidateQueries({ queryKey: ["admin-inquiries"] });
        qc.invalidateQueries({ queryKey: ["admin-unread-count"] });
      });
    }
  }

  async function handleSaveToContact() {
    if (!selected) return;
    setSavingContact(true);
    setSaveContactError("");
    try {
      const res = await adminApi.inquiryToContact(selected.id);
      setSavedContact({ id: res.contact.id, name: `${res.contact.firstName} ${res.contact.lastName}` });
    } catch (err) {
      setSaveContactError(err instanceof Error ? err.message : "Failed to save contact");
    } finally {
      setSavingContact(false);
    }
  }

  return (
    <div
      className="flex h-full min-h-0"
      style={{ minHeight: "calc(100vh - 6rem)" }}
    >
      {/* ── LIST PANEL ─────────────────────────────────────────────────── */}
      {/* Hidden below lg when detail is open; always visible on lg+ */}
      <div
        className={`flex flex-col min-w-0 flex-1 ${
          selected ? "hidden lg:flex" : "flex"
        }`}
        style={{ minWidth: 320 }}
      >
        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <h1 className="text-lg font-semibold text-foreground shrink-0">
            Inquiries
            {data?.unreadCount != null && data.unreadCount > 0 && (
              <span className="ml-2 bg-secondary text-white text-xs rounded-full px-1.5 py-0.5">
                {data.unreadCount}
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
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, message…"
                className="pl-6 pr-2 py-1 text-xs border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary w-48"
              />
            </div>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="text-xs border border-border bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All statuses</option>
              <option value="new">New</option>
              <option value="read">Read</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !inquiries.length ? (
          <p className="text-sm text-muted-foreground">
            {search ? "No matches." : "No inquiries found."}
          </p>
        ) : (
          <>
            {/* Table — min-width prevents column clipping when panel is open */}
            <div className="border border-border overflow-x-auto">
              <table className="w-full text-sm border-collapse" style={{ minWidth: 480 }}>
                <thead className="bg-muted text-xs uppercase tracking-wider text-foreground/50">
                  <tr>
                    <th className="text-left px-3 py-1.5 border-b border-border font-medium">Name</th>
                    <th className="text-left px-3 py-1.5 border-b border-border font-medium hidden sm:table-cell">
                      Type
                    </th>
                    <th className="text-left px-3 py-1.5 border-b border-border font-medium hidden md:table-cell">
                      Affiliation
                    </th>
                    <th className="text-left px-3 py-1.5 border-b border-border font-medium hidden xl:table-cell">
                      Date
                    </th>
                    <th className="text-left px-3 py-1.5 border-b border-border font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {inquiries.map((inq) => (
                    <tr
                      key={inq.id}
                      onClick={() => openDetail(inq)}
                      className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                        selected?.id === inq.id ? "bg-muted/40" : ""
                      } ${inq.status === "new" ? "font-medium" : ""}`}
                    >
                      <td className="px-3 py-1.5 border-b border-border">
                        <div className="text-sm leading-tight">{inq.fullName}</div>
                        <div className="text-xs text-muted-foreground">{inq.email}</div>
                      </td>
                      <td className="px-3 py-1.5 border-b border-border hidden sm:table-cell text-xs">
                        {formatField(inq.inquiryType)}
                      </td>
                      <td className="px-3 py-1.5 border-b border-border hidden md:table-cell text-xs">
                        {formatField(inq.affiliation)}
                      </td>
                      <td className="px-3 py-1.5 border-b border-border hidden xl:table-cell text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(inq.createdAt)}
                      </td>
                      <td className="px-3 py-1.5 border-b border-border whitespace-nowrap">
                        <span
                          className={`text-xs px-2 py-0.5 border rounded ${
                            STATUS_COLORS[inq.status] ?? ""
                          }`}
                        >
                          {STATUS_LABELS[inq.status] ?? inq.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data && data.pagination.totalPages > 1 && (
              <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 border border-border hover:bg-muted disabled:opacity-40 transition-colors"
                >
                  ← Prev
                </button>
                <span>
                  {page} / {data.pagination.totalPages}
                </span>
                <button
                  onClick={() =>
                    setPage((p) => Math.min(data.pagination.totalPages, p + 1))
                  }
                  disabled={page === data.pagination.totalPages}
                  className="px-2 py-1 border border-border hover:bg-muted disabled:opacity-40 transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── DETAIL PANEL ───────────────────────────────────────────────── */}
      {/* Full-width below lg (replaces list); fixed width at lg+ (side-by-side) */}
      {selected && (
        <div className="flex flex-col flex-1 lg:flex-none lg:w-96 lg:shrink-0 border-l border-border bg-card overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <h2 className="text-sm font-semibold">Inquiry Detail</h2>
            <button
              onClick={() => setSelected(null)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Header */}
            <div>
              <p className="font-semibold text-sm">{selected.fullName}</p>
              <a
                href={`mailto:${selected.email}?subject=Re: Your Inquiry — Laura Lopez`}
                className="text-xs text-primary underline break-all"
              >
                {selected.email}
              </a>
              {selected.phone && (
                <p className="text-xs text-muted-foreground mt-0.5">{selected.phone}</p>
              )}
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div>
                <span className="uppercase tracking-wider text-foreground/40 block">Type</span>
                <span>{formatField(selected.inquiryType)}</span>
              </div>
              <div>
                <span className="uppercase tracking-wider text-foreground/40 block">Affiliation</span>
                <span>{formatField(selected.affiliation)}</span>
              </div>
              <div className="col-span-2">
                <span className="uppercase tracking-wider text-foreground/40 block">Received</span>
                <span>{formatDate(selected.createdAt)}</span>
              </div>
            </div>

            {/* Message */}
            <div>
              <p className="text-xs uppercase tracking-wider text-foreground/40 mb-1">Message</p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/80 bg-background border border-border p-3">
                {selected.message}
              </p>
            </div>

            {/* Intelligence opt-in */}
            {(selected as any).subscribeIntelligence ? (
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2">
                <span>✓</span>
                <span>
                  Opted in to Market Intelligence
                  {(selected as any).consentAt
                    ? ` · ${new Date((selected as any).consentAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                    : ""}
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Did not opt in to Market Intelligence</p>
            )}

            {/* Reply */}
            <a
              href={`mailto:${selected.email}?subject=Re: Your Inquiry — Laura Lopez&body=Dear ${selected.fullName},%0A%0A`}
              className="block text-center text-xs uppercase tracking-wider px-4 py-2 border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              Reply via Email
            </a>

            {/* Save to Contacts */}
            {savedContact ? (
              <a
                href={`/admin/contacts?id=${savedContact.id}`}
                className="flex items-center gap-1.5 text-xs text-primary underline"
              >
                <ExternalLink size={12} />
                Linked to {savedContact.name}
              </a>
            ) : (
              <div>
                <button
                  onClick={handleSaveToContact}
                  disabled={savingContact}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <UserPlus size={12} />
                  {savingContact ? "Saving…" : "Save to Contacts"}
                </button>
                {saveContactError && (
                  <p className="text-xs text-destructive mt-1">{saveContactError}</p>
                )}
              </div>
            )}

            {/* Status */}
            <div>
              <p className="text-xs uppercase tracking-wider text-foreground/40 mb-2">Status</p>
              <div className="flex gap-2">
                {(["new", "read", "archived"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => patchStatus.mutate({ id: selected.id, status: s })}
                    disabled={selected.status === s || patchStatus.isPending}
                    className={`text-xs px-3 py-1 border transition-colors disabled:opacity-50 ${
                      selected.status === s
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
