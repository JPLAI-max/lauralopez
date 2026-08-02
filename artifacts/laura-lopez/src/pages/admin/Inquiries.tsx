import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, type Inquiry } from "@/lib/admin-api";
import { X } from "lucide-react";

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
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Inquiry | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-inquiries", statusFilter, page],
    queryFn: () =>
      adminApi.listInquiries({ status: statusFilter || undefined, page }),
  });

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
    // Auto-mark as read via the detail endpoint (background)
    if (inquiry.status === "new") {
      adminApi.getInquiry(inquiry.id).then((r) => {
        setSelected(r.inquiry);
        qc.invalidateQueries({ queryKey: ["admin-inquiries"] });
        qc.invalidateQueries({ queryKey: ["admin-unread-count"] });
      });
    }
  }

  return (
    <div className="flex gap-0 h-full min-h-0" style={{ minHeight: "calc(100vh - 6rem)" }}>
      {/* List panel */}
      <div className={`flex flex-col flex-1 min-w-0 ${selected ? "hidden md:flex" : "flex"}`}>
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h1 className="text-lg font-semibold text-foreground">
            Inquiries
            {data?.unreadCount != null && data.unreadCount > 0 && (
              <span className="ml-2 bg-secondary text-white text-xs rounded-full px-1.5 py-0.5">
                {data.unreadCount}
              </span>
            )}
          </h1>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="text-xs border border-border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="read">Read</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !data?.inquiries.length ? (
          <p className="text-sm text-muted-foreground">No inquiries found.</p>
        ) : (
          <>
            <div className="border border-border overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-muted text-xs uppercase tracking-wider text-foreground/50">
                  <tr>
                    <th className="text-left px-3 py-2 border-b border-border font-medium">Name</th>
                    <th className="text-left px-3 py-2 border-b border-border font-medium hidden sm:table-cell">Type</th>
                    <th className="text-left px-3 py-2 border-b border-border font-medium hidden md:table-cell">Affiliation</th>
                    <th className="text-left px-3 py-2 border-b border-border font-medium hidden lg:table-cell">Date</th>
                    <th className="text-left px-3 py-2 border-b border-border font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.inquiries.map((inq) => (
                    <tr
                      key={inq.id}
                      onClick={() => openDetail(inq)}
                      className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                        selected?.id === inq.id ? "bg-muted/40" : ""
                      } ${inq.status === "new" ? "font-medium" : ""}`}
                    >
                      <td className="px-3 py-2 border-b border-border">
                        <div className="text-sm">{inq.fullName}</div>
                        <div className="text-xs text-muted-foreground">{inq.email}</div>
                      </td>
                      <td className="px-3 py-2 border-b border-border hidden sm:table-cell text-xs">
                        {formatField(inq.inquiryType)}
                      </td>
                      <td className="px-3 py-2 border-b border-border hidden md:table-cell text-xs">
                        {formatField(inq.affiliation)}
                      </td>
                      <td className="px-3 py-2 border-b border-border hidden lg:table-cell text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(inq.createdAt)}
                      </td>
                      <td className="px-3 py-2 border-b border-border">
                        <span className={`text-xs px-2 py-0.5 border rounded ${STATUS_COLORS[inq.status] ?? ""}`}>
                          {STATUS_LABELS[inq.status] ?? inq.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data.pagination.totalPages > 1 && (
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
                  onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
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

      {/* Detail panel */}
      {selected && (
        <div className="flex flex-col flex-1 md:flex-none md:w-96 border-l border-border bg-card overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
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

            {/* Reply */}
            <a
              href={`mailto:${selected.email}?subject=Re: Your Inquiry — Laura Lopez&body=Dear ${selected.fullName},%0A%0A`}
              className="block text-center text-xs uppercase tracking-wider px-4 py-2 border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              Reply via Email
            </a>

            {/* Status */}
            <div>
              <p className="text-xs uppercase tracking-wider text-foreground/40 mb-2">Status</p>
              <div className="flex gap-2">
                {(["new", "read", "archived"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => patchStatus.mutate({ id: selected.id, status: s })}
                    disabled={selected.status === s || patchStatus.isPending}
                    className={`text-xs px-3 py-1.5 border transition-colors disabled:opacity-50 ${
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
