import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi, ApiError } from "@/lib/admin-api";

export default function AdminSettings() {
  const qc = useQueryClient();
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const { data: countData, isLoading } = useQuery({
    queryKey: ["recovery-codes-count"],
    queryFn: () => authApi.recoveryCodes.count(),
  });

  const regenerate = useMutation({
    mutationFn: () => authApi.recoveryCodes.regenerate(),
    onSuccess: (res) => {
      setNewCodes(res.recoveryCodes);
      setConfirmRegen(false);
      void qc.invalidateQueries({ queryKey: ["recovery-codes-count"] });
    },
  });

  function copyAll() {
    if (!newCodes) return;
    navigator.clipboard.writeText(newCodes.join("\n")).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    });
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground mb-1">Settings</h1>
        <p className="text-sm text-muted-foreground">Account security configuration.</p>
      </div>

      {/* Recovery codes */}
      <div className="border border-border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-foreground uppercase tracking-wider">
              Recovery Codes
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Use a recovery code to sign in if you lose your authenticator app. Each code is
              single-use.
            </p>
          </div>
          <div className="shrink-0 text-right">
            {isLoading ? (
              <span className="text-xs text-muted-foreground">Loading…</span>
            ) : (
              <>
                <p className="text-2xl font-mono font-semibold text-foreground leading-none">
                  {countData?.remaining ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">remaining</p>
              </>
            )}
          </div>
        </div>

        {/* Show newly generated codes */}
        {newCodes && (
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs text-amber-800 font-medium mb-2">
                Save these codes — they won't be shown again.
              </p>
              <div className="space-y-1">
                {newCodes.map((c) => (
                  <p key={c} className="font-mono text-sm tracking-widest text-foreground">
                    {c}
                  </p>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={copyAll}
              className="w-full border border-border bg-background py-2 text-xs uppercase tracking-wider hover:bg-muted transition-colors"
            >
              {copiedAll ? "Copied ✓" : "Copy all codes"}
            </button>
            <button
              type="button"
              onClick={() => setNewCodes(null)}
              className="w-full text-xs text-muted-foreground underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {!newCodes && (
          <div className="pt-2 border-t border-border">
            {!confirmRegen ? (
              <button
                type="button"
                onClick={() => setConfirmRegen(true)}
                className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
              >
                Generate new recovery codes
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-destructive">
                  This will invalidate all existing recovery codes. Continue?
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => regenerate.mutate()}
                    disabled={regenerate.isPending}
                    className="bg-primary text-primary-foreground px-4 py-1.5 text-xs uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {regenerate.isPending ? "Generating…" : "Yes, regenerate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRegen(false)}
                    className="border border-border px-4 py-1.5 text-xs uppercase tracking-wider hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                {regenerate.isError && (
                  <p className="text-xs text-destructive">
                    {regenerate.error instanceof ApiError
                      ? regenerate.error.message
                      : "Something went wrong"}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground/60">
        Two-factor authentication is required for all admin sessions.
      </p>
    </div>
  );
}
