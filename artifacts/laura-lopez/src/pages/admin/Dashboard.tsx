import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/admin-api";

interface SlotStaleness {
  id: string;
  slotKey: string;
  label: string;
  assignedAt: string | null;
  daysSince: number | null;
}

interface DashboardData {
  slots: SlotStaleness[];
  latestArticleDaysAgo: number | null;
  inquiryUnread: number;
  activeTransactions: number;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [slotsRes, articlesRes, inquiriesRes, txRes] = await Promise.allSettled([
          apiFetch<{ slots: Array<{ slotKey: string; label: string; assignedAt: string | null }> }>("/admin/slots"),
          apiFetch<{ articles: Array<{ publishedAt: string | null }> }>("/admin/articles?status=published"),
          apiFetch<{ unreadCount: number }>("/admin/inquiries?page=1&pageSize=1"),
          apiFetch<{ transactions: unknown[] }>("/admin/transactions?status=active"),
        ]);

        const slotsRaw =
          slotsRes.status === "fulfilled" ? slotsRes.value.slots : [];
        const articlesRaw =
          articlesRes.status === "fulfilled" ? articlesRes.value.articles : [];
        const unreadCount =
          inquiriesRes.status === "fulfilled" ? inquiriesRes.value.unreadCount : 0;
        const activeTxCount =
          txRes.status === "fulfilled" ? txRes.value.transactions.length : 0;

        const slots: SlotStaleness[] = slotsRaw
          .map((s) => ({
            id: s.slotKey,
            slotKey: s.slotKey,
            label: s.label,
            assignedAt: s.assignedAt,
            daysSince: daysSince(s.assignedAt),
          }))
          .sort((a, b) => {
            // oldest first — null (never assigned) sorts last
            if (a.daysSince === null && b.daysSince === null) return 0;
            if (a.daysSince === null) return 1;
            if (b.daysSince === null) return -1;
            return b.daysSince - a.daysSince;
          });

        // Most recent published article
        const latestPublishedAt = articlesRaw
          .map((a) => a.publishedAt)
          .filter(Boolean)
          .sort()
          .reverse()[0] ?? null;

        setData({
          slots,
          latestArticleDaysAgo: daysSince(latestPublishedAt ?? null),
          inquiryUnread: unreadCount,
          activeTransactions: activeTxCount,
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-foreground mb-1">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of site freshness and activity.</p>
      </div>

      {loading && (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 bg-muted/40 rounded animate-pulse" />
          ))}
        </div>
      )}

      {!loading && data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Slot Freshness */}
          <div className="border border-border p-5 sm:col-span-2">
            <h2 className="font-sans text-xs uppercase tracking-widest text-muted-foreground mb-4">
              Image Slot Freshness
            </h2>
            {data.slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No slots defined. Run seed-content.</p>
            ) : (
              <div className="divide-y divide-border">
                {data.slots.map((slot) => (
                  <div key={slot.slotKey} className="flex items-center justify-between py-2.5">
                    <span className="text-sm text-foreground">{slot.label}</span>
                    <span className="font-mono text-sm text-muted-foreground tabular-nums">
                      {slot.daysSince !== null ? (
                        <>{slot.daysSince} {slot.daysSince === 1 ? "day" : "days"}</>
                      ) : (
                        <span className="text-foreground/40">never assigned</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {data.latestArticleDaysAgo !== null && (
              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                <span className="text-sm text-foreground">Most recent article</span>
                <span className="font-mono text-sm text-muted-foreground tabular-nums">
                  {data.latestArticleDaysAgo} {data.latestArticleDaysAgo === 1 ? "day" : "days"}
                </span>
              </div>
            )}
            {data.latestArticleDaysAgo === null && (
              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                <span className="text-sm text-foreground">Most recent article</span>
                <span className="font-mono text-sm text-foreground/40">none published</span>
              </div>
            )}
          </div>

          {/* Unread Inquiries */}
          <div className="border border-border p-5">
            <h2 className="font-sans text-xs uppercase tracking-widest text-muted-foreground mb-3">
              Unread Inquiries
            </h2>
            <p className="font-serif text-4xl text-primary">{data.inquiryUnread}</p>
          </div>

          {/* Active Transactions */}
          <div className="border border-border p-5">
            <h2 className="font-sans text-xs uppercase tracking-widest text-muted-foreground mb-3">
              Active Transactions
            </h2>
            <p className="font-serif text-4xl text-primary">{data.activeTransactions}</p>
          </div>
        </div>
      )}
    </div>
  );
}
