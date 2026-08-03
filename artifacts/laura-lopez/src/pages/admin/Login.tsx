import { useState } from "react";
import { useLocation } from "wouter";
import { authApi, ApiError } from "@/lib/admin-api";
import { useQueryClient } from "@tanstack/react-query";

type Step = "credentials" | "totp";

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>("credentials");
  const [requiresTotpSetup, setRequiresTotpSetup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      if (res.requiresTotpSetup) {
        setRequiresTotpSetup(true);
        navigate("/admin/totp-setup");
      } else if (res.requiresTotp) {
        setStep("totp");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleTotp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authApi.verifyTotp(totpCode.replace(/\s/g, ""));
      await qc.invalidateQueries({ queryKey: ["admin-me"] });
      navigate("/admin");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid code");
      setTotpCode("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{
        backgroundImage: "url('/images/admin-bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* dark overlay so the card stays readable */}
      <div className="absolute inset-0 bg-black/60" />

      <div className="w-full max-w-sm relative z-10">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-2xl text-white">Laura Lopez</h1>
          <p className="text-xs text-white/60 uppercase tracking-widest mt-1">Admin Access</p>
        </div>

        <div className="bg-black/40 backdrop-blur-sm border border-white/20 p-6">
          {step === "credentials" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-foreground/60 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-foreground/60 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-primary-foreground py-2 text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleTotp} className="space-y-4">
              <p className="text-sm text-foreground/70">
                Enter the 6-digit code from your authenticator app.
              </p>
              <div>
                <label className="block text-xs uppercase tracking-wider text-foreground/60 mb-1">
                  Authenticator Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  required
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  className="w-full border border-border bg-background px-3 py-2 text-sm text-center tracking-[0.5em] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="000000"
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <button
                type="submit"
                disabled={loading || totpCode.length < 6}
                className="w-full bg-primary text-primary-foreground py-2 text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading ? "Verifying…" : "Verify"}
              </button>
              <button
                type="button"
                onClick={() => { setStep("credentials"); setError(""); setTotpCode(""); }}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                ← Back
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
