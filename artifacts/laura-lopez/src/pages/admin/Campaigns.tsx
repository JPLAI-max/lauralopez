import { useState } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  campaignApi,
  marketingTemplateApi,
  type CampaignSummary,
  type Campaign,
  type CampaignTask,
  type CampaignAsset,
  type AdminProperty,
  type CampaignChannel,
  type MarketingTemplate,
  ApiError,
} from "@/lib/admin-api";
import {
  Instagram,
  Mail,
  MapPin,
  Mic,
  FileText,
  Wrench,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  ChevronLeft,
  Download,
  RefreshCw,
  AlertTriangle,
  Megaphone,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TCPA_NOTICE =
  "Ringless voicemail is treated as a call under the TCPA and requires prior express written consent. Confirm compliance with brokerage counsel before use." as const;

const CHANNEL_ICON: Record<CampaignChannel | "manual", React.ReactNode> = {
  instagram_post:  <Instagram size={14} />,
  instagram_story: <Instagram size={14} />,
  email:           <Mail size={14} />,
  postcard:        <MapPin size={14} />,
  mailer:          <MapPin size={14} />,
  voicemail:       <Mic size={14} />,
  manual:          <Wrench size={14} />,
};

const CHANNEL_LABEL: Record<string, string> = {
  instagram_post:  "IG Post",
  instagram_story: "IG Story",
  email:           "Email",
  postcard:        "Postcard",
  mailer:          "Mailer",
  voicemail:       "Voicemail",
  manual:          "Manual",
};

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-muted text-muted-foreground",
  ready:     "bg-blue-100 text-blue-700",
  done:      "bg-green-100 text-green-700",
  skipped:   "bg-muted/60 text-muted-foreground/60",
  active:    "bg-primary/10 text-primary",
  complete:  "bg-green-100 text-green-700",
  cancelled: "bg-destructive/10 text-destructive",
  draft:     "bg-amber-100 text-amber-700",
  approved:  "bg-green-100 text-green-700",
  rejected:  "bg-red-100 text-red-700",
};

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function chip(label: string, cls: string) {
  return (
    <span className={`px-1.5 py-0.5 font-sans text-[10px] uppercase tracking-widest rounded-sm ${cls}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------
function CampaignList({ onSelect }: { onSelect: (id: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn:  () => campaignApi.list(),
  });

  const campaigns = data?.campaigns ?? [];

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-16 space-y-2">
        <Megaphone size={32} className="mx-auto text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No campaigns yet.</p>
        <p className="text-xs text-muted-foreground/70">
          Set a property status to "Listed" to start a campaign.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border divide-y divide-border">
      {campaigns.map((c: CampaignSummary) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className="w-full flex items-start gap-3 p-3 hover:bg-muted/30 text-left"
        >
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              {chip(c.trigger.replace(/_/g, " "), STATUS_COLORS[c.status] ?? "bg-muted text-muted-foreground")}
              {chip(c.status, STATUS_COLORS[c.status] ?? "")}
            </div>
            <p className="text-sm font-medium truncate">{c.propertyAddress}</p>
            <p className="text-xs text-muted-foreground">
              Anchor {fmt(c.anchorDate)} · {c.tasksDone}/{c.tasksTotal} tasks done
              {c.nextDueDate ? ` · Next: ${fmt(c.nextDueDate)}` : ""}
            </p>
          </div>
          <ChevronRight size={14} className="shrink-0 mt-1 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail — task timeline
// ---------------------------------------------------------------------------
function CampaignDetail({
  id,
  onBack,
  onSelectTask,
}: {
  id: string;
  onBack: () => void;
  onSelectTask: (taskId: string) => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["campaign", id],
    queryFn:  () => campaignApi.get(id),
  });

  const cancel = useMutation({
    mutationFn: () => campaignApi.patch(id, { status: "cancelled" }),
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: ["campaign", id] }); void qc.invalidateQueries({ queryKey: ["campaigns"] }); },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data) return <p className="text-sm text-destructive">Not found.</p>;

  const { campaign, tasks, assets, property } = data as {
    campaign: Campaign;
    tasks: CampaignTask[];
    assets: CampaignAsset[];
    property: AdminProperty | null;
  };

  const assetMap = new Map(assets.map((a) => [a.taskId, a]));
  const today    = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-2 flex-wrap">
        <button onClick={onBack} className="p-1 hover:bg-muted rounded">
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold truncate">{property?.address ?? "—"}</h2>
            {chip(campaign.trigger.replace(/_/g, " "), "bg-muted text-muted-foreground")}
            {chip(campaign.status, STATUS_COLORS[campaign.status] ?? "")}
          </div>
          <p className="text-xs text-muted-foreground">Anchor {fmt(campaign.anchorDate)} · Created {fmt(campaign.createdAt)}</p>
        </div>
        {campaign.status === "active" && (
          <button
            onClick={() => cancel.mutate()}
            disabled={cancel.isPending}
            className="px-2 py-1 text-xs border border-destructive/40 text-destructive hover:bg-destructive/10 font-sans uppercase tracking-widest"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Task timeline */}
      <div className="border border-border divide-y divide-border">
        {tasks.map((task) => {
          const asset   = assetMap.get(task.id);
          const eff     = task.overrideDate ?? task.computedDate;
          const overdue = task.status === "pending" && eff != null && eff < today;
          return (
            <button
              key={task.id}
              onClick={() => onSelectTask(task.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 text-left"
            >
              <span className="shrink-0 text-muted-foreground">
                {CHANNEL_ICON[task.channel as CampaignChannel] ?? <FileText size={14} />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{task.label}</p>
                <p className="text-[10px] text-muted-foreground">
                  {CHANNEL_LABEL[task.channel] ?? task.channel}
                  {eff ? ` · ${fmt(eff)}` : ""}
                  {overdue ? " · OVERDUE" : ""}
                </p>
              </div>
              {/* Asset thumbnail */}
              {asset?.storageKey && asset.url && (
                <img src={asset.url} alt="" className="w-8 h-8 object-cover shrink-0 rounded-sm border border-border" />
              )}
              {chip(task.status, STATUS_COLORS[task.status] ?? "")}
              <ChevronRight size={12} className="shrink-0 text-muted-foreground" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task detail
// ---------------------------------------------------------------------------
function TaskDetail({
  campaignId,
  taskId,
  onBack,
}: {
  campaignId: string;
  taskId:     string;
  onBack:     () => void;
}) {
  const qc = useQueryClient();
  const [overrideDate, setOverrideDate] = useState("");
  const [savingDate,   setSavingDate]   = useState(false);
  const [genError,     setGenError]     = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn:  () => campaignApi.get(campaignId),
  });

  // Recipient count — only fetched when the task is an email task
  // (resolved after data loads so we know task.channel)
  const taskChannel = (data?.tasks as CampaignTask[] | undefined)?.find((t) => t.id === taskId)?.channel;
  const { data: rcData } = useQuery({
    queryKey: ["campaign-recipient-count"],
    queryFn:  () => campaignApi.recipientCount(),
    enabled:  taskChannel === "email",
    staleTime: 60_000,
  });

  const generate = useMutation({
    mutationFn: () => campaignApi.tasks.generate(
      taskId,
      selectedTemplateId
        ? { templateId: selectedTemplateId, templateVersion: selectedTemplateVersion ?? undefined }
        : undefined,
    ),
    onSuccess:  () => { setGenError(""); void qc.invalidateQueries({ queryKey: ["campaign", campaignId] }); },
    onError:    (e) => setGenError(e instanceof ApiError ? e.message : "Generation failed."),
  });

  const approve = useMutation({
    mutationFn: () => campaignApi.tasks.approve(taskId),
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: ["campaign", campaignId] }); },
  });

  const reject = useMutation({
    mutationFn: () => campaignApi.tasks.reject(taskId),
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: ["campaign", campaignId] }); },
  });

  const patchDate = async () => {
    if (!overrideDate) return;
    setSavingDate(true);
    try {
      await campaignApi.tasks.patch(taskId, { overrideDate });
      void qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
      setOverrideDate("");
    } finally {
      setSavingDate(false); }
  };

  const markDone = useMutation({
    mutationFn: () => campaignApi.tasks.patch(taskId, { status: "done" }),
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: ["campaign", campaignId] }); },
  });

  const markSkipped = useMutation({
    mutationFn: () => campaignApi.tasks.patch(taskId, { status: "skipped" }),
    onSuccess:  () => { void qc.invalidateQueries({ queryKey: ["campaign", campaignId] }); },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data) return <p className="text-sm text-destructive">Not found.</p>;

  const task  = (data.tasks as CampaignTask[]).find((t) => t.id === taskId);
  if (!task) return <p className="text-sm text-destructive">Task not found.</p>;

  const asset = (data.assets as CampaignAsset[]).find((a) => a.taskId === taskId);
  const eff   = task.overrideDate ?? task.computedDate;
  const isVoicemail  = task.channel === "voicemail";
  const isInstagram  = INSTAGRAM_CHANNELS.has(task.channel);

  // Template picker state (instagram channels only)
  const [selectedTemplateId,      setSelectedTemplateId]      = useState<string | null>(null);
  const [selectedTemplateVersion, setSelectedTemplateVersion] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-2">
        <button onClick={onBack} className="p-1 hover:bg-muted rounded">
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground">
              {CHANNEL_ICON[task.channel as CampaignChannel] ?? <FileText size={14} />}
            </span>
            <h3 className="text-sm font-semibold truncate">{task.label}</h3>
            {chip(task.status, STATUS_COLORS[task.status] ?? "")}
          </div>
          <p className="text-xs text-muted-foreground">
            {CHANNEL_LABEL[task.channel] ?? task.channel}
            {eff ? ` · Due ${fmt(eff)}` : ""}
          </p>
        </div>
      </div>

      {/* TCPA compliance notice for voicemail */}
      {isVoicemail && (
        <div className="flex gap-2 p-3 border border-amber-300 bg-amber-50">
          <AlertTriangle size={14} className="shrink-0 text-amber-700 mt-0.5" />
          <p className="text-xs text-amber-800">{TCPA_NOTICE}</p>
        </div>
      )}

      {/* Override date */}
      <div className="border border-border p-3 space-y-2">
        <p className="font-sans text-[10px] uppercase tracking-widest text-muted-foreground">Date</p>
        <p className="text-sm">
          Computed: <span className="font-mono">{fmt(task.computedDate)}</span>
          {task.overrideDate && (
            <span className="ml-2 text-primary">Override: <span className="font-mono">{fmt(task.overrideDate)}</span></span>
          )}
        </p>
        <div className="flex gap-2">
          <input
            type="date"
            value={overrideDate}
            onChange={(e) => setOverrideDate(e.target.value)}
            className="border border-border px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={patchDate}
            disabled={savingDate || !overrideDate}
            className="px-3 py-1 bg-primary text-primary-foreground font-sans text-xs uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50"
          >
            Set
          </button>
          {task.overrideDate && (
            <button
              onClick={() => campaignApi.tasks.patch(taskId, { overrideDate: null }).then(() => qc.invalidateQueries({ queryKey: ["campaign", campaignId] }))}
              className="px-2 py-1 border border-border text-xs hover:bg-muted"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Asset area */}
      <div className="border border-border p-3 space-y-3">
        <p className="font-sans text-[10px] uppercase tracking-widest text-muted-foreground">Asset</p>

        {genError && (
          <div className="flex gap-2 p-2 bg-destructive/10 border border-destructive/30">
            <XCircle size={14} className="shrink-0 text-destructive mt-0.5" />
            <p className="text-xs text-destructive">{genError}</p>
          </div>
        )}

        {!asset && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">No asset generated yet.</p>

            {/* Email: show live recipient count before generating */}
            {task.channel === "email" && (
              <p className="text-xs text-muted-foreground">
                Recipients (subscribed, not unsubscribed):{" "}
                <span className="font-semibold text-foreground">
                  {rcData !== undefined ? rcData.count : "—"}
                </span>
              </p>
            )}

            {/* Template picker for instagram channels */}
            {isInstagram && data.property?.id && (
              <MarketingTemplatePicker
                channel={task.channel}
                propertyId={(data.property as AdminProperty).id}
                selectedId={selectedTemplateId}
                onSelect={(id, ver) => {
                  setSelectedTemplateId(id);
                  setSelectedTemplateVersion(ver);
                }}
              />
            )}

            {task.channel !== "manual" && (
              <button
                onClick={() => generate.mutate()}
                disabled={generate.isPending || (isInstagram && !selectedTemplateId)}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground font-sans text-xs uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50"
                title={isInstagram && !selectedTemplateId ? "Select a template above first" : undefined}
              >
                <RefreshCw size={12} className={generate.isPending ? "animate-spin" : ""} />
                {generate.isPending ? "Generating…" : "Generate Asset"}
              </button>
            )}
          </div>
        )}

        {asset && (
          <div className="space-y-3">
            {/* Status */}
            <div className="flex items-center gap-2">
              {chip(asset.status, STATUS_COLORS[asset.status] ?? "")}
              {asset.status === "approved" && <span className="text-xs text-muted-foreground">by {asset.approvedBy} · {fmt(asset.approvedAt)}</span>}
            </div>

            {/* Image preview */}
            {asset.url && (
              <img
                src={asset.url}
                alt="Generated asset"
                className="max-w-full rounded border border-border"
                style={{ maxHeight: 320, objectFit: "contain" }}
              />
            )}

            {/* Text content */}
            {asset.textContent && (
              <div className="bg-muted/40 p-3 rounded border border-border">
                <pre className="text-xs whitespace-pre-wrap font-sans">{asset.textContent}</pre>
              </div>
            )}

            {/* Actions */}
            {asset.status === "draft" && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => approve.mutate()}
                  disabled={approve.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 text-white font-sans text-xs uppercase tracking-widest hover:bg-green-800 disabled:opacity-50"
                >
                  <CheckCircle2 size={12} />
                  Approve
                </button>
                <button
                  onClick={() => reject.mutate()}
                  disabled={reject.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-destructive/40 text-destructive font-sans text-xs uppercase tracking-widest hover:bg-destructive/10 disabled:opacity-50"
                >
                  <XCircle size={12} />
                  Reject
                </button>
              </div>
            )}

            {/* Download / channel action */}
            <div className="flex flex-wrap gap-2">
              {asset.url && !isVoicemail && (
                <a
                  href={asset.url}
                  download
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border font-sans text-xs uppercase tracking-widest hover:bg-muted"
                >
                  <Download size={12} />
                  Download
                </a>
              )}
              {/* Voicemail: script + CSV download only — no send action */}
              {isVoicemail && asset.textContent && (
                <a
                  href={`data:text/plain;charset=utf-8,${encodeURIComponent(asset.textContent)}`}
                  download={`voicemail-script-${taskId}.txt`}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border font-sans text-xs uppercase tracking-widest hover:bg-muted"
                >
                  <Download size={12} />
                  Script (.txt)
                </a>
              )}
            </div>

            {/* Regenerate */}
            {task.channel !== "manual" && (
              <button
                onClick={() => generate.mutate()}
                disabled={generate.isPending}
                className="flex items-center gap-1.5 text-xs text-muted-foreground underline hover:text-foreground"
              >
                <RefreshCw size={11} className={generate.isPending ? "animate-spin" : ""} />
                Regenerate
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mark done / skip */}
      {(task.status === "pending" || task.status === "ready") && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => markDone.mutate()}
            disabled={markDone.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border font-sans text-xs uppercase tracking-widest hover:bg-muted disabled:opacity-50"
          >
            <CheckCircle2 size={12} />
            Mark Done
          </button>
          <button
            onClick={() => markSkipped.mutate()}
            disabled={markSkipped.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-muted-foreground font-sans text-xs uppercase tracking-widest hover:bg-muted disabled:opacity-50"
          >
            <Clock size={12} />
            Skip
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MarketingTemplatePicker — shown in TaskDetail for instagram channels
// ---------------------------------------------------------------------------
const INSTAGRAM_CHANNELS = new Set(["instagram_story", "instagram_post"]);

function MarketingTemplatePicker({
  channel,
  propertyId,
  selectedId,
  onSelect,
}: {
  channel: string;
  propertyId: string;
  selectedId: string | null;
  onSelect: (id: string, version: number) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["marketing-templates", channel],
    queryFn:  () => marketingTemplateApi.list(channel),
    staleTime: 5 * 60_000,
  });

  const templates: MarketingTemplate[] = data?.templates ?? [];

  // Fetch thumbnails for all templates in parallel
  const previews = useQueries({
    queries: templates.map((t) => ({
      queryKey:  ["mkt-preview", t.id, propertyId],
      queryFn:   () => marketingTemplateApi.preview(t.id, propertyId),
      staleTime: 5 * 60_000,
      retry:     false,
    })),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <RefreshCw size={11} className="animate-spin" /> Loading templates…
      </div>
    );
  }
  if (templates.length === 0) return null;

  const isStory = channel === "instagram_story";

  return (
    <div className="space-y-2">
      <p className="font-sans text-[10px] uppercase tracking-widest text-muted-foreground">
        Template — select one
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {templates.map((t, i) => {
          const preview   = previews[i];
          const active    = t.id === selectedId;
          const aspect    = isStory ? "aspect-[9/16]" : "aspect-square";
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id, t.version)}
              className={`shrink-0 w-24 space-y-1 p-1 border rounded-sm text-left transition-all ${
                active
                  ? "border-primary ring-1 ring-primary/60 bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className={`w-full bg-muted rounded-sm overflow-hidden ${aspect}`}>
                {preview?.data?.image ? (
                  <img
                    src={preview.data.image}
                    alt={t.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {preview?.isLoading ? (
                      <RefreshCw size={10} className="animate-spin text-muted-foreground" />
                    ) : (
                      <Instagram size={14} className="text-muted-foreground/40" />
                    )}
                  </div>
                )}
              </div>
              <p className="text-[10px] leading-tight text-foreground truncate px-0.5">{t.name}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function AdminCampaigns() {
  const [view, setView]         = useState<"list" | "detail" | "task">("list");
  const [campaignId, setCamId]  = useState<string | null>(null);
  const [taskId, setTaskId]     = useState<string | null>(null);

  // DRE warning banner
  const { data: settingsData } = useQuery({
    queryKey: ["admin-settings"],
    queryFn:  () => import("@/lib/admin-api").then((m) => m.settingsApi.list()),
  });
  const settings       = settingsData?.settings ?? {};
  const dreWarning     = !settings["dre_license"] || !settings["brokerage_name"];

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground mb-1">Campaigns</h1>
        <p className="text-sm text-muted-foreground">Listing campaign engine — generate, review, and track marketing assets.</p>
      </div>

      {dreWarning && (
        <div className="flex gap-2 p-3 border border-amber-300 bg-amber-50">
          <AlertTriangle size={14} className="shrink-0 text-amber-700 mt-0.5" />
          <p className="text-xs text-amber-800">
            DRE license and/or brokerage name not configured.{" "}
            <a href="/admin/settings" className="underline font-medium">Go to Settings</a>{" "}
            to set them before generating assets.
          </p>
        </div>
      )}

      {view === "list" && (
        <CampaignList
          onSelect={(id) => { setCamId(id); setView("detail"); }}
        />
      )}

      {view === "detail" && campaignId && (
        <CampaignDetail
          id={campaignId}
          onBack={() => { setView("list"); setCamId(null); }}
          onSelectTask={(tid) => { setTaskId(tid); setView("task"); }}
        />
      )}

      {view === "task" && campaignId && taskId && (
        <TaskDetail
          campaignId={campaignId}
          taskId={taskId}
          onBack={() => setView("detail")}
        />
      )}
    </div>
  );
}
