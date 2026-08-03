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

        <div className="bg-black/50 backdrop-blur-sm border border-white/20 p-6">
          {step === "credentials" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-white/70 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-white/30 bg-white/10 text-white placeholder-white/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/60"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-white/70 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-white/30 bg-white/10 text-white placeholder-white/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/60"
                />
              </div>
              {error && <p className="text-xs text-red-300">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 text-sm uppercase tracking-wider transition-colors disabled:opacity-50"
                style={{ backgroundColor: "#F4C3CC", color: "#2a0a10" }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f0adb9")}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#F4C3CC")}
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleTotp} className="space-y-4">
              <p className="text-sm text-white/70">
                Enter the 6-digit code from your authenticator app.
              </p>
              <div>
                <label className="block text-xs uppercase tracking-wider text-white/70 mb-1">
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
                  className="w-full border border-white/30 bg-white/10 text-white px-3 py-2 text-sm text-center tracking-[0.5em] font-mono focus:outline-none focus:ring-1 focus:ring-white/60"
                  placeholder="000000"
                />
              </div>
              {error && <p className="text-xs text-red-300">{error}</p>}
              <button
                type="submit"
                disabled={loading || totpCode.length < 6}
                className="w-full py-2 text-sm uppercase tracking-wider transition-colors disabled:opacity-50"
                style={{ backgroundColor: "#F4C3CC", color: "#2a0a10" }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f0adb9")}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#F4C3CC")}
              >
                {loading ? "Verifying…" : "Verify"}
              </button>
              <button
                type="button"
                onClick={() => { setStep("credentials"); setError(""); setTotpCode(""); }}
                className="w-full text-xs text-white/50 hover:text-white/80 transition-colors py-1"
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
