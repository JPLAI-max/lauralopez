import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { intelApi } from "../../lib/admin-api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { AlertCircle, CheckCircle, ChevronRight, Database, FileText, Lock, Plus, RefreshCw, Shield, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Types (mirrors API shapes)
// ---------------------------------------------------------------------------
interface IntelSource { id: string; kind: string; title: string; url: string | null; capturedAt: string; notes: string | null }
interface Fact { id: string; address: string; neighborhood: string | null; eventType: string; eventDate: string; amount: string | null; description: string | null; confidence: string; sourceTitle: string; sourceCapturedAt: string; payload: Record<string, unknown> }
interface Report { id: string; title: string; periodStart: string; periodEnd: string; neighborhood: string | null; status: string; bodyMarkdown: string; factRefs: FactRef[]; generatedAt: string | null; approvedAt: string | null; publishedAt: string | null; createdAt: string }
interface FactRef { factId: string; table: string; token: string; formattedValue: string }
interface ExtractedFact { address: string; eventType: string; eventDate: string | null; amount: string | null; description: string | null; confidence: string; sourceSnippet: string; included?: boolean }
interface MlsTx { id: string; address: string; neighborhood: string | null; soldPrice: string | null; listPrice: string | null; soldDate: string | null; daysOnMarket: number | null; dataSource: string }
interface OffNote { id: string; address: string | null; neighborhood: string | null; note: string; signalType: string; confidence: string; observedAt: string }
interface ResolvedFact extends Fact { sourceKind: string; sourceUrl: string | null; sourceNotes: string | null }

type Tab = "ingest" | "facts" | "mls" | "reports";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const STATUS_COLOR: Record<string, string> = {
  draft:     "bg-muted text-muted-foreground",
  in_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  approved:  "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  published: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};
const CONF_COLOR: Record<string, string> = {
  verified: "text-green-600 dark:text-green-400",
  reported: "text-yellow-600 dark:text-yellow-400",
  estimated:"text-orange-500",
};
function fmtAmt(raw: string | null | undefined) {
  if (!raw) return "—";
  const n = parseFloat(raw);
  return isNaN(n) ? raw : "$" + Math.round(n).toLocaleString("en-US");
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Ingest tab
// ---------------------------------------------------------------------------
function IngestTab() {
  const qc = useQueryClient();
  const [step, setStep] = useState<"form" | "review" | "done">("form");
  const [pasteText, setPasteText] = useState("");
  const [srcTitle, setSrcTitle] = useState("");
  const [srcKind, setSrcKind] = useState("manual");
  const [srcUrl, setSrcUrl]   = useState("");
  const [srcDate, setSrcDate] = useState(new Date().toISOString().slice(0, 10));
  const [srcNotes, setSrcNotes] = useState("");
  const [extracted, setExtracted] = useState<ExtractedFact[]>([]);
  const [editedFacts, setEditedFacts] = useState<ExtractedFact[]>([]);
  const [error, setError] = useState<string | null>(null);

  const extractMut = useMutation({
    mutationFn: () => intelApi.ingest({
      type: "text",
      content: pasteText,
      sourceTitle: srcTitle,
      sourceKind: srcKind as "manual",
      sourceCapturedAt: new Date(srcDate + "T00:00:00Z").toISOString(),
      sourceUrl: srcUrl || null,
      sourceNotes: srcNotes || null,
    }),
    onSuccess: (data) => {
      const facts = (data.extractedFacts ?? []).map((f: ExtractedFact) => ({ ...f, included: true }));
      setExtracted(facts);
      setEditedFacts(facts);
      setStep("review");
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const confirmMut = useMutation({
    mutationFn: () => intelApi.ingestConfirm({
      source: {
        kind:       srcKind as "manual",
        title:      srcTitle,
        url:        srcUrl || null,
        capturedAt: new Date(srcDate + "T00:00:00Z").toISOString(),
        notes:      srcNotes || null,
      },
      facts: editedFacts.filter((f) => f.included !== false),
    }),
    onSuccess: () => {
      setStep("done");
      void qc.invalidateQueries({ queryKey: ["intel-facts"] });
      void qc.invalidateQueries({ queryKey: ["intel-sources"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateFact = useCallback((i: number, field: string, value: string | boolean) => {
    setEditedFacts((prev) => prev.map((f, idx) => idx === i ? { ...f, [field]: value } : f));
  }, []);

  if (step === "done") return (
    <div className="text-center py-16 space-y-3">
      <CheckCircle className="w-10 h-10 text-green-500 mx-auto" />
      <p className="font-medium text-foreground">Facts committed to the store.</p>
      <Button size="sm" variant="outline" onClick={() => { setStep("form"); setPasteText(""); setSrcTitle(""); setExtracted([]); }}>
        Ingest more
      </Button>
    </div>
  );

  if (step === "review") return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">
          Review {editedFacts.length} extracted fact{editedFacts.length !== 1 ? "s" : ""} — edit any value before confirming.
        </p>
        <Button size="sm" variant="ghost" onClick={() => setStep("form")}>← Back</Button>
      </div>
      {error && <p className="text-xs text-destructive bg-destructive/10 rounded p-2">{error}</p>}
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              {["✓","Address","Type","Date","Amount","Description","Confidence","Snippet"].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {editedFacts.map((f, i) => (
              <tr key={i} className={`border-t border-border ${f.included === false ? "opacity-40" : ""}`}>
                <td className="px-3 py-2">
                  <input type="checkbox" checked={f.included !== false}
                    onChange={(e) => updateFact(i, "included", e.target.checked)} />
                </td>
                <td className="px-3 py-2 min-w-[140px]">
                  <Input className="h-6 text-xs px-1" value={f.address}
                    onChange={(e) => updateFact(i, "address", e.target.value)} />
                </td>
                <td className="px-3 py-2">
                  <select className="bg-background border border-border rounded text-xs px-1 py-0.5"
                    value={f.eventType} onChange={(e) => updateFact(i, "eventType", e.target.value)}>
                    {["deed_transfer","permit_filed","permit_issued","entitlement","listing","price_change","sale","withdrawal"].map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 min-w-[110px]">
                  <Input className="h-6 text-xs px-1" value={f.eventDate ?? ""}
                    onChange={(e) => updateFact(i, "eventDate", e.target.value)} />
                </td>
                <td className="px-3 py-2 min-w-[100px]">
                  <Input className="h-6 text-xs px-1" value={f.amount ?? ""}
                    placeholder="digits only"
                    onChange={(e) => updateFact(i, "amount", e.target.value)} />
                </td>
                <td className="px-3 py-2 min-w-[160px]">
                  <Input className="h-6 text-xs px-1" value={f.description ?? ""}
                    onChange={(e) => updateFact(i, "description", e.target.value)} />
                </td>
                <td className="px-3 py-2">
                  <select className="bg-background border border-border rounded text-xs px-1 py-0.5"
                    value={f.confidence} onChange={(e) => updateFact(i, "confidence", e.target.value)}>
                    {["verified","reported","estimated"].map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 max-w-[180px]">
                  <span className="text-muted-foreground line-clamp-2" title={f.sourceSnippet}>{f.sourceSnippet}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={() => setStep("form")}>Cancel</Button>
        <Button size="sm" onClick={() => confirmMut.mutate()} disabled={confirmMut.isPending}>
          {confirmMut.isPending ? "Saving…" : `Confirm ${editedFacts.filter((f) => f.included !== false).length} fact(s)`}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Source metadata</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="col-span-full">
            <label className="text-xs text-muted-foreground mb-1 block">Source title *</label>
            <Input value={srcTitle} onChange={(e) => setSrcTitle(e.target.value)} placeholder="e.g. LA County Recorder — Q1 2025" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Kind</label>
            <Select value={srcKind} onValueChange={setSrcKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["manual","document","url","feed","recorder","permit_portal"].map((k) => (
                  <SelectItem key={k} value={k}>{k}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Captured on</label>
            <Input type="date" value={srcDate} onChange={(e) => setSrcDate(e.target.value)} />
          </div>
          <div className="col-span-full">
            <label className="text-xs text-muted-foreground mb-1 block">Source URL (optional)</label>
            <Input value={srcUrl} onChange={(e) => setSrcUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div className="col-span-full">
            <label className="text-xs text-muted-foreground mb-1 block">Notes (optional)</label>
            <Input value={srcNotes} onChange={(e) => setSrcNotes(e.target.value)} placeholder="Additional context about this source" />
          </div>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2">Paste text</h3>
        <p className="text-xs text-muted-foreground mb-2">Paste any text containing addresses, dates, and dollar amounts. The AI will extract structured facts — you review each before anything is saved.</p>
        <Textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          className="min-h-[160px] font-mono text-xs"
          placeholder={"412 N Mapleton Dr sold for $4,500,000 on March 15, 2025.\n501 Doheny Rd transferred via deed on January 8, 2025 — $8.2M.\n623 Loma Vista Dr permit filed February 2025 for $1.2M remodel."}
        />
      </div>
      {error && <p className="text-xs text-destructive bg-destructive/10 rounded p-2">{error}</p>}
      <Button onClick={() => extractMut.mutate()} disabled={!pasteText.trim() || !srcTitle.trim() || extractMut.isPending}>
        {extractMut.isPending ? "Extracting…" : "Extract facts →"}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Facts tab
// ---------------------------------------------------------------------------
function FactsTab({ onSelectFact }: { onSelectFact: (id: string) => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["intel-facts"], queryFn: intelApi.listFacts });
  const facts = (data?.facts ?? []) as Fact[];

  if (isLoading) return <p className="text-xs text-muted-foreground py-8 text-center">Loading…</p>;
  if (!facts.length) return (
    <div className="text-center py-16 space-y-2">
      <Database className="w-8 h-8 text-muted-foreground mx-auto" />
      <p className="text-sm text-muted-foreground">No facts yet — use the Ingest tab to add public-record events.</p>
    </div>
  );

  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            {["Address","Type","Date","Amount","Confidence","Source"].map((h) => (
              <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {facts.map((f) => (
            <tr key={f.id} onClick={() => onSelectFact(f.id)}
              className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors">
              <td className="px-3 py-2 font-medium text-foreground max-w-[180px] truncate">{f.address}</td>
              <td className="px-3 py-2">
                <Badge variant="outline" className="text-[10px] whitespace-nowrap">{f.eventType.replace(/_/g, " ")}</Badge>
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{f.eventDate}</td>
              <td className="px-3 py-2 whitespace-nowrap font-mono">{fmtAmt(f.amount)}</td>
              <td className={`px-3 py-2 font-medium ${CONF_COLOR[f.confidence] ?? ""}`}>{f.confidence}</td>
              <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">{f.sourceTitle}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MLS tab
// ---------------------------------------------------------------------------
function MlsTab() {
  const { data: txData, isLoading: txLoading } = useQuery({ queryKey: ["intel-mls"], queryFn: intelApi.listMlsTransactions });
  const { data: noteData, isLoading: noteLoading } = useQuery({ queryKey: ["intel-off-market"], queryFn: intelApi.listOffMarketNotes });
  const txs   = (txData?.transactions ?? []) as MlsTx[];
  const notes = (noteData?.notes ?? []) as OffNote[];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-4 h-4 text-orange-500" />
          <span className="text-sm font-semibold text-foreground">MLS Transactions</span>
          <Badge className="text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border-0">LICENSED — not exportable</Badge>
        </div>
        {txLoading ? <p className="text-xs text-muted-foreground">Loading…</p> : !txs.length ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No MLS transactions recorded.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>{["Address","Sold Price","Sold Date","DOM","Source"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-3 py-2 max-w-[180px] truncate font-medium">{t.address}</td>
                    <td className="px-3 py-2 font-mono">{fmtAmt(t.soldPrice)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{t.soldDate ?? "—"}</td>
                    <td className="px-3 py-2">{t.daysOnMarket ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{t.dataSource}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-red-500" />
          <span className="text-sm font-semibold text-foreground">Off-Market Notes</span>
          <Badge className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0">DEFAULT EXCLUDED from reports</Badge>
        </div>
        {noteLoading ? <p className="text-xs text-muted-foreground">Loading…</p> : !notes.length ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No off-market notes recorded.</p>
        ) : (
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="rounded border border-border p-3 text-xs space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {n.address && <span className="font-medium text-foreground">{n.address}</span>}
                  {n.neighborhood && <span className="text-muted-foreground">{n.neighborhood}</span>}
                  <Badge variant="outline" className="text-[10px]">{n.signalType.replace(/_/g, " ")}</Badge>
                  <span className={`font-medium ${CONF_COLOR[n.confidence] ?? ""}`}>{n.confidence}</span>
                  <span className="text-muted-foreground ml-auto">{n.observedAt}</span>
                </div>
                <p className="text-muted-foreground">{n.note}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report detail view with fact-ref highlighting and side panel
// ---------------------------------------------------------------------------
function ReportDetail({ reportId, onBack }: { reportId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [selectedFactId, setSelectedFactId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["intel-report", reportId],
    queryFn:  () => intelApi.getReport(reportId),
  });

  const report = data?.report as Report | undefined;
  const resolved = (data?.resolvedFacts ?? {}) as Record<string, ResolvedFact>;

  const genMut = useMutation({
    mutationFn: () => intelApi.generateReport(reportId),
    onSuccess:  () => { void refetch(); setError(null); },
    onError:    (e: Error) => setError(e.message),
  });
  const approveMut = useMutation({
    mutationFn: () => intelApi.approveReport(reportId),
    onSuccess:  () => { void refetch(); void qc.invalidateQueries({ queryKey: ["intel-reports"] }); },
    onError:    (e: Error) => setError(e.message),
  });
  const publishMut = useMutation({
    mutationFn: () => intelApi.publishReport(reportId),
    onSuccess:  () => { void refetch(); void qc.invalidateQueries({ queryKey: ["intel-reports"] }); },
    onError:    (e: Error) => setError(e.message),
  });

  if (isLoading) return <p className="text-xs text-muted-foreground py-8 text-center">Loading…</p>;
  if (!report)   return <p className="text-xs text-destructive py-4">Report not found.</p>;

  // Render body: replace {{fact:uuid}} with clickable spans
  function renderBody(md: string): React.ReactNode {
    const parts: React.ReactNode[] = [];
    let last = 0;
    const rx = /\{\{fact:([0-9a-f-]+)\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(md)) !== null) {
      if (m.index > last) parts.push(<span key={`txt-${last}`}>{md.slice(last, m.index)}</span>);
      const factId  = m[1]!;
      const ref     = ((report!.factRefs ?? []) as FactRef[]).find((r: FactRef) => r.factId === factId);
      const display = ref?.formattedValue ?? factId.slice(0, 8);
      parts.push(
        <button key={`fact-${m.index}`}
          onClick={() => setSelectedFactId(factId)}
          className="inline-flex items-center font-mono text-xs font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded px-1 py-0 mx-0.5 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors">
          {display}
        </button>,
      );
      last = m.index + m[0].length;
    }
    if (last < md.length) parts.push(<span key={`txt-end`}>{md.slice(last)}</span>);
    return <>{parts}</>;
  }

  const selectedFact = selectedFactId ? resolved[selectedFactId] : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap">
        <Button size="sm" variant="ghost" onClick={onBack} className="shrink-0">← Reports</Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-foreground truncate">{report.title}</h2>
            <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${STATUS_COLOR[report.status] ?? "bg-muted text-muted-foreground"}`}>
              {report.status.replace("_", " ")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{report.periodStart} → {report.periodEnd}{report.neighborhood ? ` · ${report.neighborhood}` : ""}</p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => genMut.mutate()} disabled={genMut.isPending || report.status === "published"}>
            <RefreshCw className="w-3 h-3 mr-1" />{genMut.isPending ? "Generating…" : "Generate"}
          </Button>
          {["draft","in_review"].includes(report.status) && (
            <Button size="sm" variant="outline" onClick={() => approveMut.mutate()} disabled={approveMut.isPending || !report.bodyMarkdown.trim()}>
              {approveMut.isPending ? "Approving…" : "Approve"}
            </Button>
          )}
          {report.status === "approved" && (
            <Button size="sm" onClick={() => publishMut.mutate()} disabled={publishMut.isPending}>
              {publishMut.isPending ? "Publishing…" : "Publish →"}
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-destructive bg-destructive/10 rounded p-2">{error}</p>}

      <div className="flex gap-4 min-h-0">
        {/* Body */}
        <div className="flex-1 min-w-0">
          {!report.bodyMarkdown.trim() ? (
            <div className="rounded border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
              No content yet — click Generate to produce the report.
            </div>
          ) : (
            <div className="rounded border border-border p-4 text-sm leading-relaxed whitespace-pre-wrap font-sans bg-card text-card-foreground">
              {renderBody(report.bodyMarkdown)}
            </div>
          )}
          {(report.factRefs as FactRef[]).length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-2">
              Click any <span className="font-mono bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded px-1">highlighted figure</span> to see its source.
            </p>
          )}
        </div>

        {/* Source side panel */}
        {selectedFact && (
          <aside className="w-64 shrink-0 rounded border border-border bg-muted/30 p-3 text-xs space-y-3 self-start">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground text-[11px] uppercase tracking-wide">Fact source</span>
              <button onClick={() => setSelectedFactId(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-2">
              <div><span className="text-muted-foreground">Address</span><br /><span className="font-medium text-foreground">{selectedFact.address}</span></div>
              <div><span className="text-muted-foreground">Event</span><br /><span className="font-medium text-foreground">{selectedFact.eventType.replace(/_/g," ")} · {selectedFact.eventDate}</span></div>
              {selectedFact.amount && <div><span className="text-muted-foreground">Amount</span><br /><span className="font-mono font-semibold text-foreground">{fmtAmt(selectedFact.amount)}</span></div>}
              <div><span className="text-muted-foreground">Confidence</span><br /><span className={`font-medium ${CONF_COLOR[selectedFact.confidence] ?? ""}`}>{selectedFact.confidence}</span></div>
              <div className="border-t border-border pt-2">
                <span className="text-muted-foreground">Source</span><br />
                <span className="font-medium text-foreground">{selectedFact.sourceTitle}</span><br />
                <span className="text-muted-foreground">{fmtDate(selectedFact.sourceCapturedAt)}</span>
                {selectedFact.sourceUrl && <div className="mt-1"><a href={selectedFact.sourceUrl} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline break-all">{selectedFact.sourceUrl}</a></div>}
                {selectedFact.sourceNotes && <div className="mt-1 text-muted-foreground italic">{selectedFact.sourceNotes}</div>}
              </div>
              {Boolean((selectedFact.payload as Record<string, unknown>)["sourceSnippet"]) && (
                <div className="border-t border-border pt-2">
                  <span className="text-muted-foreground">Source snippet</span><br />
                  <span className="text-foreground italic">"{String((selectedFact.payload as Record<string, unknown>)["sourceSnippet"])}"</span>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reports tab
// ---------------------------------------------------------------------------
function ReportsTab() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd,   setNewEnd]   = useState("");
  const [newNhood, setNewNhood] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["intel-reports"], queryFn: intelApi.listReports });
  const reports = (data?.reports ?? []) as Report[];

  const createMut = useMutation({
    mutationFn: () => intelApi.createReport({ title: newTitle, periodStart: newStart, periodEnd: newEnd, neighborhood: newNhood || null }),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ["intel-reports"] });
      setShowNew(false);
      setSelected(d.report.id);
    },
    onError: (e: Error) => setError(e.message),
  });

  if (selected) return <ReportDetail reportId={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm font-medium text-foreground">{reports.length} report{reports.length !== 1 ? "s" : ""}</span>
        <Button size="sm" onClick={() => setShowNew(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" />New report
        </Button>
      </div>

      {showNew && (
        <div className="rounded border border-border p-4 space-y-3 bg-muted/20">
          <p className="text-xs font-semibold text-foreground">New report</p>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-full">
              <label className="text-xs text-muted-foreground mb-1 block">Title *</label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Q1 2025 Beverly Hills Intelligence" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Period start</label>
              <Input type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Period end</label>
              <Input type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
            </div>
            <div className="col-span-full">
              <label className="text-xs text-muted-foreground mb-1 block">Neighborhood (optional)</label>
              <Input value={newNhood} onChange={(e) => setNewNhood(e.target.value)} placeholder="Beverly Hills" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button size="sm" onClick={() => createMut.mutate()} disabled={!newTitle || !newStart || !newEnd || createMut.isPending}>
              {createMut.isPending ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? <p className="text-xs text-muted-foreground py-8 text-center">Loading…</p> : !reports.length ? (
        <div className="text-center py-16 space-y-2">
          <FileText className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No reports yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <button key={r.id} onClick={() => setSelected(r.id)}
              className="w-full text-left rounded border border-border p-3 hover:bg-muted/30 transition-colors group flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-foreground text-sm truncate">{r.title}</span>
                  <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${STATUS_COLOR[r.status] ?? ""}`}>
                    {r.status.replace("_", " ")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {r.periodStart} → {r.periodEnd}
                  {r.neighborhood ? ` · ${r.neighborhood}` : ""}
                  {(r.factRefs as FactRef[]).length > 0 ? ` · ${(r.factRefs as FactRef[]).length} fact ref${(r.factRefs as FactRef[]).length !== 1 ? "s" : ""}` : ""}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fact detail side panel (for Facts tab)
// ---------------------------------------------------------------------------
function FactSidePanel({ factId, onClose }: { factId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["intel-fact", factId],
    queryFn:  () => intelApi.getFact(factId),
  });
  const fact = data?.fact as ResolvedFact | undefined;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars

  const deleteMut = useMutation({
    mutationFn: () => intelApi.deleteFact(factId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["intel-facts"] });
      onClose();
    },
  });

  if (isLoading) return (
    <aside className="w-64 shrink-0 rounded border border-border bg-muted/30 p-3 text-xs">Loading…</aside>
  );
  if (!fact) return null;

  return (
    <aside className="w-64 shrink-0 rounded border border-border bg-muted/30 p-3 text-xs space-y-3 self-start">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground text-[11px] uppercase tracking-wide">Fact detail</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className="space-y-2">
        <div><span className="text-muted-foreground">Address</span><br /><span className="font-medium text-foreground">{fact.address}</span></div>
        <div><span className="text-muted-foreground">Event</span><br /><span className="font-medium text-foreground">{fact.eventType.replace(/_/g," ")} · {fact.eventDate}</span></div>
        {fact.amount && <div><span className="text-muted-foreground">Amount</span><br /><span className="font-mono font-semibold text-foreground">{fmtAmt(fact.amount)}</span></div>}
        {fact.description && <div><span className="text-muted-foreground">Description</span><br /><span className="text-foreground">{fact.description}</span></div>}
        <div><span className="text-muted-foreground">Confidence</span><br /><span className={`font-medium ${CONF_COLOR[fact.confidence] ?? ""}`}>{fact.confidence}</span></div>
        <div className="border-t border-border pt-2">
          <span className="text-muted-foreground">Source</span><br />
          <span className="font-medium text-foreground">{fact.sourceTitle}</span><br />
          <span className="text-muted-foreground">{fmtDate(fact.sourceCapturedAt)}</span>
          {fact.sourceUrl && <div className="mt-1"><a href={fact.sourceUrl} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline break-all">{fact.sourceUrl}</a></div>}
        </div>
        {Boolean((fact.payload as Record<string,unknown>)["sourceSnippet"]) && (
          <div className="border-t border-border pt-2">
            <span className="text-muted-foreground">Source snippet</span><br />
            <span className="text-foreground italic">"{String((fact.payload as Record<string,unknown>)["sourceSnippet"])}"</span>
          </div>
        )}
      </div>
      <div className="border-t border-border pt-2">
        <button onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}
          className="text-destructive hover:text-destructive/80 text-[10px] font-medium transition-colors">
          {deleteMut.isPending ? "Deleting…" : "Delete fact"}
        </button>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function AdminIntelligence() {
  const [tab, setTab] = useState<Tab>("ingest");
  const [selectedFact, setSelectedFact] = useState<string | null>(null);

  const tabs: { id: Tab; label: string }[] = [
    { id: "ingest",  label: "Ingest" },
    { id: "facts",   label: "Facts" },
    { id: "mls",     label: "MLS / Off-market" },
    { id: "reports", label: "Reports" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-4 pt-4 pb-2 sm:px-6 border-b border-border shrink-0">
        <h1 className="text-lg font-semibold text-foreground mb-1">Intelligence</h1>
        <p className="text-xs text-muted-foreground mb-3">Fact store — every figure in a published report traces to a stored source.</p>
        {/* Tabs */}
        <div className="flex gap-0 -mb-px overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); setSelectedFact(null); }}
              className={`px-4 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {tab === "ingest" && <IngestTab />}
        {tab === "facts" && (
          <div className="flex gap-4">
            <div className="flex-1 min-w-0">
              <FactsTab onSelectFact={(id) => setSelectedFact(id)} />
            </div>
            {selectedFact && (
              <FactSidePanel factId={selectedFact} onClose={() => setSelectedFact(null)} />
            )}
          </div>
        )}
        {tab === "mls"     && <MlsTab />}
        {tab === "reports" && <ReportsTab />}
      </div>
    </div>
  );
}
