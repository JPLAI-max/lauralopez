/**
 * Transactions page — transaction timeline engine.
 *
 * Views:
 *   - list       (default)
 *   - create     (multi-step: form → preview → confirm)
 *   - detail     (milestone timeline + inline editing)
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  adminApi,
  type TransactionSummary,
  type Transaction,
  type TransactionMilestoneWithDerived,
  type TransactionMilestone,
  type MilestoneTemplate,
  type PreviewMilestone,
  type MilestoneStatus,
  type MilestoneCategory,
  ApiError,
} from "@/lib/admin-api";

// ─── Constants ───────────────────────────────────────────────────────────────

const COMPLIANCE_FOOTER =
  "Operational timeline tracking. Executed contracts and disclosures are retained separately by the brokerage.";

const MILESTONE_DISCLAIMER =
  "Default periods only. Confirm every date against the executed contract — all periods are negotiable and frequently modified.";

const CATEGORY_LABELS: Record<MilestoneCategory, string> = {
  contingency: "Contingency",
  disclosure: "Disclosure",
  inspection: "Inspection",
  financing: "Financing",
  admin: "Admin",
};

const CATEGORY_COLORS: Record<MilestoneCategory, string> = {
  contingency: "bg-orange-100 text-orange-800",
  disclosure: "bg-blue-100 text-blue-800",
  inspection: "bg-purple-100 text-purple-800",
  financing: "bg-green-100 text-green-800",
  admin: "bg-gray-100 text-gray-700",
};

const STATUS_COLORS: Record<string, string> = {
  active: "text-emerald-700 bg-emerald-50",
  pending: "text-amber-700 bg-amber-50",
  closed: "text-sky-700 bg-sky-50",
  cancelled: "text-gray-500 bg-gray-100",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtMoney(s: string | null): string {
  if (!s) return "";
  const n = parseFloat(s);
  if (isNaN(n)) return s;
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-sm uppercase tracking-wide ${className}`}>
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <Badge label={status} className={STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"} />;
}

function OverdueDot({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-bold">
      {count}
    </span>
  );
}

// ─── List view ───────────────────────────────────────────────────────────────

function ListView({
  onSelect,
  onNew,
}: {
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const { data, isLoading, error } = useQuery({
    queryKey: ["transactions", statusFilter],
    queryFn: () => adminApi.transactions.list({ status: statusFilter || undefined }),
  });

  const txns = data?.transactions ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Transactions</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Active transaction timelines</p>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="bg-primary text-primary-foreground px-4 py-2 text-xs uppercase tracking-wider hover:bg-primary/90 transition-colors shrink-0"
        >
          + New
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-border pb-0">
        {["active", "pending", "closed", "cancelled", ""].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs uppercase tracking-wide transition-colors border-b-2 -mb-px ${statusFilter === s ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {s === "" ? "All" : s}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>}
      {error && <p className="text-sm text-destructive py-4">Failed to load transactions.</p>}
      {!isLoading && txns.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">No transactions found.</p>
      )}

      {/* Desktop table */}
      {txns.length > 0 && (
        <>
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="text-left py-2 pr-4 font-medium">Property</th>
                  <th className="text-left py-2 pr-4 font-medium">Client</th>
                  <th className="text-left py-2 pr-4 font-medium">Side</th>
                  <th className="text-left py-2 pr-4 font-medium">Status</th>
                  <th className="text-left py-2 pr-4 font-medium">COE</th>
                  <th className="text-left py-2 pr-4 font-medium">Next Milestone</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {txns.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => onSelect(t.id)}
                    className="hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 pr-4 max-w-[180px] truncate font-medium text-foreground">
                      {t.propertyAddress}
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{t.clientName}</td>
                    <td className="py-2.5 pr-4">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">{t.side}</span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums text-muted-foreground text-xs">
                      {fmtDate(t.closeOfEscrowDate)}
                    </td>
                    <td className="py-2.5 pr-4">
                      {t.nextMilestone ? (
                        <span className="text-xs text-foreground">
                          {t.nextMilestone.label}{" "}
                          <span className="text-muted-foreground">
                            {fmtDate(t.nextMilestone.effectiveDate)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <OverdueDot count={t.overdueCount} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {txns.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t.id)}
                className="w-full text-left border border-border bg-card p-3 space-y-1.5 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground leading-snug">{t.propertyAddress}</p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <StatusBadge status={t.status} />
                    <OverdueDot count={t.overdueCount} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t.clientName} · {t.side.toUpperCase()} · COE {fmtDate(t.closeOfEscrowDate)}
                </p>
                {t.nextMilestone && (
                  <p className="text-xs text-foreground">
                    Next: {t.nextMilestone.label}{" "}
                    <span className="text-muted-foreground">{fmtDate(t.nextMilestone.effectiveDate)}</span>
                  </p>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      <p className="text-[11px] text-muted-foreground/60 pt-4 border-t border-border">
        {COMPLIANCE_FOOTER}
      </p>
    </div>
  );
}

// ─── Milestone row ────────────────────────────────────────────────────────────

function MilestoneRow({
  milestone,
  txId,
  onUpdated,
}: {
  milestone: TransactionMilestoneWithDerived;
  txId: string;
  onUpdated: (m: TransactionMilestoneWithDerived) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [dateVal, setDateVal] = useState(milestone.overrideDate ?? milestone.computedDate ?? "");
  const [saving, setSaving] = useState(false);

  const td = today();
  const isOverdue = milestone.status === "pending" && !!milestone.effectiveDate && milestone.effectiveDate < td;

  async function saveDate() {
    if (!dateVal) return;
    setSaving(true);
    try {
      const res = await adminApi.transactions.patchMilestone(txId, milestone.id, {
        overrideDate: dateVal || null,
      });
      onUpdated(res.milestone);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function clearOverride() {
    setSaving(true);
    try {
      const res = await adminApi.transactions.patchMilestone(txId, milestone.id, {
        overrideDate: null,
      });
      onUpdated(res.milestone);
      setDateVal(milestone.computedDate ?? "");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(status: MilestoneStatus) {
    setSaving(true);
    try {
      const res = await adminApi.transactions.patchMilestone(txId, milestone.id, { status });
      onUpdated(res.milestone);
    } finally {
      setSaving(false);
    }
  }

  const rowBg =
    milestone.status === "complete"
      ? "bg-emerald-50/60"
      : milestone.status === "waived"
        ? "bg-gray-50"
        : isOverdue
          ? "bg-red-50/60"
          : "";

  return (
    <div className={`border border-border p-3 space-y-2 ${rowBg}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          {/* Status indicator */}
          <div className="mt-0.5 shrink-0">
            {milestone.status === "complete" ? (
              <span className="text-emerald-600 text-xs">✓</span>
            ) : milestone.status === "waived" ? (
              <span className="text-gray-400 text-xs">–</span>
            ) : isOverdue ? (
              <span className="text-red-600 text-xs font-bold">!</span>
            ) : (
              <span className="text-muted-foreground text-xs">○</span>
            )}
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-medium leading-snug ${milestone.status === "waived" ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {milestone.label}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={`text-[10px] px-1 rounded-sm font-medium uppercase tracking-wide ${CATEGORY_COLORS[milestone.category]}`}>
                {CATEGORY_LABELS[milestone.category]}
              </span>
              {milestone.requiresWrittenRemoval && (
                <span className={`text-[10px] px-1 rounded-sm font-medium uppercase tracking-wide ${milestone.removalDeliveredAt ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                  {milestone.removalDeliveredAt ? "Removal delivered" : "Written removal req."}
                </span>
              )}
              {isOverdue && (
                <span className="text-[10px] px-1 rounded-sm font-medium uppercase tracking-wide bg-red-100 text-red-700">
                  Overdue
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Date */}
        <div className="shrink-0 text-right space-y-1">
          {editing ? (
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={dateVal}
                onChange={(e) => setDateVal(e.target.value)}
                className="text-xs border border-border bg-background px-1.5 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={saveDate}
                disabled={saving}
                className="text-xs bg-primary text-primary-foreground px-2 py-1 hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => { setEditing(true); setDateVal(milestone.overrideDate ?? milestone.computedDate ?? ""); }}
                className={`tabular-nums text-xs hover:underline ${isOverdue ? "text-red-700 font-semibold" : "text-muted-foreground"}`}
              >
                {fmtDate(milestone.effectiveDate)}
              </button>
              {milestone.overrideDate && (
                <button
                  type="button"
                  onClick={clearOverride}
                  className="block text-[10px] text-muted-foreground/60 hover:text-muted-foreground mt-0.5"
                >
                  reset ↩
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      {milestone.status === "pending" && (
        <div className="flex items-center gap-3 pt-1 border-t border-border/50">
          <button
            type="button"
            onClick={() => setStatus("complete")}
            disabled={saving}
            className="text-[11px] text-emerald-700 hover:text-emerald-900 uppercase tracking-wide disabled:opacity-50"
          >
            Mark complete
          </button>
          <button
            type="button"
            onClick={() => setStatus("waived")}
            disabled={saving}
            className="text-[11px] text-muted-foreground hover:text-foreground uppercase tracking-wide disabled:opacity-50"
          >
            Waive
          </button>
          {milestone.requiresWrittenRemoval && !milestone.removalDeliveredAt && (
            <button
              type="button"
              onClick={async () => {
                setSaving(true);
                try {
                  const res = await adminApi.transactions.patchMilestone(txId, milestone.id, {
                    removalDeliveredAt: new Date().toISOString(),
                  });
                  onUpdated(res.milestone);
                } finally { setSaving(false); }
              }}
              disabled={saving}
              className="text-[11px] text-amber-700 hover:text-amber-900 uppercase tracking-wide disabled:opacity-50"
            >
              Mark removal delivered
            </button>
          )}
        </div>
      )}
      {milestone.status === "complete" && (
        <button
          type="button"
          onClick={() => setStatus("pending")}
          disabled={saving}
          className="text-[11px] text-muted-foreground hover:text-foreground uppercase tracking-wide disabled:opacity-50 pt-1 border-t border-border/50"
        >
          Undo complete
        </button>
      )}
      {milestone.status === "waived" && (
        <button
          type="button"
          onClick={() => setStatus("pending")}
          disabled={saving}
          className="text-[11px] text-muted-foreground hover:text-foreground uppercase tracking-wide disabled:opacity-50 pt-1 border-t border-border/50"
        >
          Restore
        </button>
      )}
    </div>
  );
}

// ─── Detail view ─────────────────────────────────────────────────────────────

function DetailView({
  txId,
  onBack,
}: {
  txId: string;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const [milestones, setMilestones] = useState<TransactionMilestoneWithDerived[] | null>(null);
  const [showEvents, setShowEvents] = useState(false);
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newCat, setNewCat] = useState<MilestoneCategory>("admin");
  const [newDate, setNewDate] = useState("");
  const [addingSaving, setAddingSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["transaction", txId],
    queryFn: async () => {
      const res = await adminApi.transactions.get(txId);
      setMilestones(res.milestones);
      return res;
    },
  });

  const { data: eventsData } = useQuery({
    queryKey: ["transaction-events", txId],
    queryFn: () => adminApi.transactions.events(txId),
    enabled: showEvents,
  });

  const patchTxn = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.transactions.patch(txId, body as Parameters<typeof adminApi.transactions.patch>[1]),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["transaction", txId] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  function handleMilestoneUpdated(updated: TransactionMilestoneWithDerived) {
    setMilestones((prev) =>
      prev ? prev.map((m) => (m.id === updated.id ? updated : m)) : prev,
    );
  }

  async function handleAddMilestone(e: React.FormEvent) {
    e.preventDefault();
    setAddingSaving(true);
    try {
      const res = await adminApi.transactions.addMilestone(txId, {
        label: newLabel,
        category: newCat,
        effectiveDate: newDate || undefined,
      });
      const enriched: TransactionMilestoneWithDerived = {
        ...res.milestone,
        effectiveDate: res.milestone.overrideDate ?? res.milestone.computedDate,
        overdue: false,
      };
      setMilestones((prev) => [...(prev ?? []), enriched]);
      setNewLabel("");
      setNewDate("");
      setShowAddMilestone(false);
    } finally {
      setAddingSaving(false);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>;
  if (!data) return <p className="text-sm text-destructive py-4">Transaction not found.</p>;

  const { transaction: txn } = data;
  const displayMilestones = milestones ?? data.milestones;

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground uppercase tracking-wide">
          ← Back
        </button>
        <span className="text-muted-foreground/40">|</span>
        <StatusBadge status={txn.status} />
      </div>

      <div className="border border-border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-lg text-foreground leading-snug">{txn.propertyAddress}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {txn.clientName} · {txn.side.toUpperCase()}
              {txn.purchasePrice ? ` · ${fmtMoney(txn.purchasePrice)}` : ""}
            </p>
          </div>
          <select
            value={txn.status}
            onChange={(e) => patchTxn.mutate({ status: e.target.value })}
            className="text-xs border border-border bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary shrink-0"
          >
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="closed">Closed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-xs pt-2 border-t border-border/50">
          <Field label="Acceptance" value={fmtDate(txn.acceptanceDate)} />
          <Field label="COE" value={fmtDate(txn.closeOfEscrowDate)} />
          {txn.escrowCompany && <Field label="Escrow" value={txn.escrowCompany} />}
          {txn.lender && <Field label="Lender" value={txn.lender} />}
          {txn.coopAgent && <Field label="Coop Agent" value={txn.coopAgent} />}
          {txn.clientEmail && <Field label="Client Email" value={txn.clientEmail} />}
        </div>
      </div>

      {/* Milestones */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-xs font-medium uppercase tracking-wider text-foreground">
            Timeline
          </h3>
          <button
            type="button"
            onClick={() => setShowAddMilestone((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground uppercase tracking-wide"
          >
            + Add milestone
          </button>
        </div>

        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1.5">
          {MILESTONE_DISCLAIMER}
        </p>

        {showAddMilestone && (
          <form onSubmit={handleAddMilestone} className="border border-border bg-card p-3 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Add milestone</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                required
                type="text"
                placeholder="Label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="sm:col-span-2 border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <select
                value={newCat}
                onChange={(e) => setNewCat(e.target.value as MilestoneCategory)}
                className="border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={addingSaving}
                className="bg-primary text-primary-foreground px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-primary/90 disabled:opacity-50"
              >
                {addingSaving ? "Adding…" : "Add"}
              </button>
              <button
                type="button"
                onClick={() => setShowAddMilestone(false)}
                className="border border-border px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {displayMilestones.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">No milestones yet.</p>
        )}

        <div className="space-y-1.5">
          {displayMilestones.map((m) => (
            <MilestoneRow
              key={m.id}
              milestone={m}
              txId={txId}
              onUpdated={handleMilestoneUpdated}
            />
          ))}
        </div>
      </div>

      {/* Audit trail toggle */}
      <div className="pt-2 border-t border-border">
        <button
          type="button"
          onClick={() => setShowEvents((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground uppercase tracking-wide"
        >
          {showEvents ? "Hide" : "Show"} audit trail
        </button>
        {showEvents && eventsData && (
          <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
            {eventsData.events.map((ev) => (
              <div key={ev.id} className="text-xs text-muted-foreground border-l-2 border-border pl-2 py-0.5">
                <span className="text-foreground font-medium">{ev.action}</span>{" "}
                · {ev.actor} · {new Date(ev.createdAt).toLocaleString()}
              </div>
            ))}
            {eventsData.events.length === 0 && <p className="text-xs text-muted-foreground">No events yet.</p>}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground/60 pt-2 border-t border-border">
        {COMPLIANCE_FOOTER}
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}</p>
      <p className="text-foreground">{value || "—"}</p>
    </div>
  );
}

// ─── Create flow ──────────────────────────────────────────────────────────────

type CreateStep = "form" | "preview" | "confirm";

interface CreateFormData {
  propertyAddress: string;
  side: "buy" | "sell";
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  acceptanceDate: string;
  closeOfEscrowDate: string;
  purchasePrice: string;
  templateId: string;
  notes: string;
}

function CreateView({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (id: string) => void;
}) {
  const [step, setStep] = useState<CreateStep>("form");
  const [form, setForm] = useState<CreateFormData>({
    propertyAddress: "",
    side: "buy",
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    acceptanceDate: "",
    closeOfEscrowDate: "",
    purchasePrice: "",
    templateId: "",
    notes: "",
  });
  const [preview, setPreview] = useState<PreviewMilestone[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: templatesData } = useQuery({
    queryKey: ["milestone-templates"],
    queryFn: () => adminApi.transactions.templates(),
  });

  const templates = useMemo(
    () => (templatesData?.templates ?? []).filter((t) => !form.side || t.side === form.side),
    [templatesData, form.side],
  );

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.templateId) {
      // No template: go straight to confirm with empty milestone list
      setPreview([]);
      setStep("confirm");
      return;
    }
    setSaving(true);
    try {
      const res = await adminApi.transactions.preview({
        templateId: form.templateId,
        acceptanceDate: form.acceptanceDate || undefined,
        closeOfEscrowDate: form.closeOfEscrowDate || undefined,
      });
      setPreview(res.milestones);
      setStep("preview");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to preview milestones");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    setError("");
    setSaving(true);
    try {
      const pp = parseFloat(form.purchasePrice);
      const res = await adminApi.transactions.create({
        propertyAddress: form.propertyAddress,
        side: form.side,
        clientName: form.clientName,
        clientEmail: form.clientEmail || undefined,
        clientPhone: form.clientPhone || undefined,
        acceptanceDate: form.acceptanceDate || undefined,
        closeOfEscrowDate: form.closeOfEscrowDate || undefined,
        purchasePrice: isNaN(pp) ? undefined : pp,
        templateId: form.templateId || undefined,
        milestoneOverrides: Object.keys(overrides).length > 0 ? overrides : undefined,
        notes: form.notes || undefined,
      });
      onCreated(res.transaction.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create transaction");
      setSaving(false);
    }
  }

  const fld = (field: keyof CreateFormData) => ({
    value: form[field],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value })),
  });

  const inputCls =
    "border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary w-full";

  if (step === "form") {
    return (
      <div className="space-y-4 max-w-lg">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground uppercase tracking-wide">
            ← Cancel
          </button>
          <h1 className="text-lg font-semibold text-foreground">New Transaction</h1>
        </div>

        <form onSubmit={handlePreview} className="space-y-4 border border-border bg-card p-4">
          <Section label="Property">
            <input required placeholder="Property address" {...fld("propertyAddress")} className={inputCls} />
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Side</span>
                <select {...fld("side")} className={inputCls}>
                  <option value="buy">Buy (Buyer)</option>
                  <option value="sell">Sell (Seller)</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Purchase price</span>
                <input type="number" placeholder="0" {...fld("purchasePrice")} className={inputCls} />
              </label>
            </div>
          </Section>

          <Section label="Client">
            <input required placeholder="Client name" {...fld("clientName")} className={inputCls} />
            <div className="grid grid-cols-2 gap-3">
              <input type="email" placeholder="Email (optional)" {...fld("clientEmail")} className={inputCls} />
              <input type="tel" placeholder="Phone (optional)" {...fld("clientPhone")} className={inputCls} />
            </div>
          </Section>

          <Section label="Key Dates">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Acceptance date</span>
                <input type="date" {...fld("acceptanceDate")} className={inputCls} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Close of escrow</span>
                <input type="date" {...fld("closeOfEscrowDate")} className={inputCls} />
              </label>
            </div>
          </Section>

          <Section label="Template">
            <select {...fld("templateId")} className={inputCls}>
              <option value="">No template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Select a template to auto-generate milestones from your key dates.
            </p>
          </Section>

          <Section label="Notes">
            <textarea
              rows={2}
              placeholder="Internal notes (optional)"
              {...fld("notes")}
              className={inputCls}
            />
          </Section>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-primary text-primary-foreground py-2.5 text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Computing…" : form.templateId ? "Preview milestones →" : "Create transaction →"}
          </button>
        </form>
      </div>
    );
  }

  if (step === "preview") {
    return (
      <div className="space-y-4 max-w-lg">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setStep("form")} className="text-xs text-muted-foreground hover:text-foreground uppercase tracking-wide">
            ← Edit
          </button>
          <h1 className="text-lg font-semibold text-foreground">Preview Milestones</h1>
        </div>

        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1.5">
          {MILESTONE_DISCLAIMER}
        </p>

        <div className="border border-border bg-card p-4 space-y-2">
          {preview.map((m) => (
            <div key={m.templateItemId} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/50 last:border-0">
              <div>
                <p className="text-sm text-foreground">{m.label}</p>
                <span className={`text-[10px] px-1 rounded-sm font-medium uppercase tracking-wide ${CATEGORY_COLORS[m.category]}`}>
                  {CATEGORY_LABELS[m.category]}
                </span>
              </div>
              <input
                type="date"
                value={overrides[m.templateItemId] ?? m.computedDate ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setOverrides((o) => {
                    const next = { ...o };
                    if (val && val !== m.computedDate) next[m.templateItemId] = val;
                    else delete next[m.templateItemId];
                    return next;
                  });
                }}
                className="text-xs border border-border bg-background px-2 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-primary shrink-0"
              />
            </div>
          ))}
          {preview.length === 0 && (
            <p className="text-sm text-muted-foreground py-2 text-center">No milestones from template.</p>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <button
          type="button"
          onClick={handleCreate}
          disabled={saving}
          className="w-full bg-primary text-primary-foreground py-2.5 text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? "Creating…" : "Confirm & create →"}
        </button>

        <p className="text-[11px] text-muted-foreground/60">{COMPLIANCE_FOOTER}</p>
      </div>
    );
  }

  // step === "confirm" (no template)
  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setStep("form")} className="text-xs text-muted-foreground hover:text-foreground uppercase tracking-wide">
          ← Edit
        </button>
        <h1 className="text-lg font-semibold text-foreground">Confirm</h1>
      </div>
      <div className="border border-border bg-card p-4">
        <p className="text-sm text-foreground font-medium">{form.propertyAddress}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {form.clientName} · {form.side.toUpperCase()} · COE {fmtDate(form.closeOfEscrowDate) ?? "—"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">No template — milestones can be added after creation.</p>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button
        type="button"
        onClick={handleCreate}
        disabled={saving}
        className="w-full bg-primary text-primary-foreground py-2.5 text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {saving ? "Creating…" : "Create transaction →"}
      </button>
      <p className="text-[11px] text-muted-foreground/60">{COMPLIANCE_FOOTER}</p>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium uppercase tracking-wider text-muted-foreground pb-1 border-b border-border/50 w-full">
        {label}
      </legend>
      {children}
    </fieldset>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────

type View = { kind: "list" } | { kind: "create" } | { kind: "detail"; id: string };

export default function AdminTransactions() {
  const [view, setView] = useState<View>({ kind: "list" });
  const qc = useQueryClient();

  if (view.kind === "list") {
    return (
      <ListView
        onSelect={(id) => setView({ kind: "detail", id })}
        onNew={() => setView({ kind: "create" })}
      />
    );
  }

  if (view.kind === "create") {
    return (
      <CreateView
        onBack={() => setView({ kind: "list" })}
        onCreated={(id) => {
          void qc.invalidateQueries({ queryKey: ["transactions"] });
          setView({ kind: "detail", id });
        }}
      />
    );
  }

  return (
    <DetailView
      txId={view.id}
      onBack={() => {
        void qc.invalidateQueries({ queryKey: ["transactions"] });
        setView({ kind: "list" });
      }}
    />
  );
}
