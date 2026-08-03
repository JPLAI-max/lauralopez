---
name: Admin auth cookie fallbacks
description: Chrome blocks SameSite=None cookies in cross-origin iframes (Replit preview); both the pending-session and the auth session need a header-based fallback path.
---

## Rule
Any cookie set during the admin auth flow — `totp_pending` or `sid` — will be silently
dropped by Chrome 120+ in the Replit preview pane (cross-origin iframe). Every endpoint
that relies on one of these cookies needs a header-based fallback.

## How it's implemented
- **Pending token** (`totp_pending` cookie): `/auth/login` returns a signed HMAC
  `pendingToken` in the JSON body. Frontend stores in `sessionStorage` under
  `admin_pending_token` and sends as `X-Pending-Token`. `getPendingUserId(req)` checks
  the signed cookie first, then the header.
- **Session token** (`sid` cookie): `verify-totp`, `verify-recovery`, and `totp/confirm`
  all return `sessionToken` (plain session UUID) in the JSON body. Frontend stores in
  `sessionStorage` under `admin_session_token` and sends as `X-Session-Token`.
  `requireAuth` checks `req.signedCookies?.sid` first, then falls back to the header.
- **CORS**: `X-Pending-Token` and `X-Session-Token` are listed in `allowedHeaders` in
  `app.ts`.
- **Logout**: `clearSessionToken()` and `clearPendingToken()` are both called from
  `useAdminAuth`'s logout mutation `onSuccess`.

**Why:** Without this, every authenticated API call after login returns 401, the dashboard
never loads, and the user sees either a blank page or an infinite redirect to /admin/login.

**How to apply:** Any new endpoint that creates a session or pending session must include
the token in the response body and store/forward it on the frontend.
