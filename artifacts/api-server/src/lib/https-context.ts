import { type Request } from "express";

/**
 * Returns true when the request is being served over HTTPS — either in
 * production, inside a Replit container (always HTTPS via the Replit proxy,
 * but REPL_ID is the only reliable indicator because x-forwarded-proto is not
 * forwarded), or behind an explicit HTTPS reverse proxy that sets the header.
 *
 * Auth cookies must use SameSite=None; Secure in an HTTPS context so they
 * survive Replit's cross-origin preview iframe. The set and clear calls MUST
 * use identical options or the browser silently ignores the clear.
 */
export function isHttpsContext(req: Request): boolean {
  if (process.env.NODE_ENV === "production") return true;
  if (process.env.REPL_ID) return true; // Replit dev is always HTTPS
  const proto = req.headers["x-forwarded-proto"];
  return proto === "https" || (Array.isArray(proto) && proto.includes("https"));
}
