import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { authApi, ApiError } from "@/lib/admin-api";
import { useQueryClient } from "@tanstack/react-query";

type Step = "enroll" | "confirm" | "recovery";

export default function TotpSetup() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>("enroll");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copiedAll, setCopiedAll] = useState(false);

  useEffect(() => {
    authApi
      .totpEnroll()
      .then((r) => {
        setOtpauthUrl(r.otpauthUrl);
        setSecret(r.secret);
        setStep("confirm");
      })
      .catch((err: unknown) => {
        // Show the actual error so the user knows what happened, then return
        // them to login after a brief pause so they can read the message.
        const msg = err instanceof Error ? err.message : "Session expired — please sign in again";
        setError(msg);
        setTimeout(() => navigate("/admin/login"), 3000);
      });
  }, [navigate]);

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authApi.totpConfirm(code.replace(/\s/g, ""));
      setRecoveryCodes(res.recoveryCodes);
      await qc.invalidateQueries({ queryKey: ["admin-me"] });
      setStep("recovery");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid code — try again");
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  function copyAll() {
    navigator.clipboard.writeText(recoveryCodes.join("\n")).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    });
  }

  if (step === "enroll") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Setting up TOTP…</p>
      </div>
    );
  }

  if (step === "recovery") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="font-serif text-2xl text-primary">Recovery Codes</h1>
            <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
              Save these now — shown once only
            </p>
          </div>
          <div className="bg-card border border-border p-6 space-y-4">
            <p className="text-sm text-foreground/70">
              If you ever lose access to your authenticator app, use one of these codes to sign in.
              Each code works once. Store them somewhere safe.
            </p>
            <div className="bg-muted border border-border p-3 space-y-1">
              {recoveryCodes.map((c) => (
                <p key={c} className="font-mono text-sm tracking-widest text-foreground">
                  {c}
                </p>
              ))}
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
              onClick={() => navigate("/admin")}
              className="w-full bg-primary text-primary-foreground py-2 text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors"
            >
              I've saved my codes — continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-2xl text-primary">Two-Factor Setup</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
            Required before continuing
          </p>
        </div>

        <div className="bg-card border border-border p-6 space-y-5">
          <p className="text-sm text-foreground/70">
            Scan the link below with any authenticator app (Google Authenticator, Authy,
            1Password, etc.), or enter the secret key manually.
          </p>

          <div>
            <p className="text-xs uppercase tracking-wider text-foreground/50 mb-1">
              Tap to open in authenticator
            </p>
            <a
              href={otpauthUrl}
              className="block break-all text-xs font-mono bg-muted px-3 py-2 border border-border text-primary underline"
            >
              {otpauthUrl}
            </a>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-foreground/50 mb-1">
              Manual entry key
            </p>
            <p className="font-mono text-sm tracking-widest bg-muted px-3 py-2 border border-border break-all">
              {secret}
            </p>
          </div>

          <form onSubmit={handleConfirm} className="space-y-3 pt-2 border-t border-border">
            <p className="text-xs text-foreground/60">
              Enter the 6-digit code from your app to confirm enrollment.
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="w-full border border-border bg-background px-3 py-2 text-sm text-center tracking-[0.5em] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="000000"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="w-full bg-primary text-primary-foreground py-2 text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Confirming…" : "Confirm & Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
