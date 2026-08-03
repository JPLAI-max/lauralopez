---
name: Port layout & dev proxy
description: Which ports the artifacts bind to, and how the Vite dev proxy is configured to forward /api/* to the API server.
---

# Port layout

From `.replit` `[[ports]]` entries:

| Service | localPort | externalPort |
|---------|-----------|--------------|
| API server (`artifacts/api-server`) | 8080 | 80 |
| Mockup sandbox | 8081 | 8081 |
| Frontend (`artifacts/laura-lopez`) | 19969 | 3000 |

Both services read `process.env.PORT` at startup — do not hardcode ports.

# Dev proxy

`artifacts/laura-lopez/vite.config.ts` proxies `/api/*` to `API_PROXY_TARGET` (set to `http://localhost:8080` as a shared env var). It throws a clear startup error if `API_PROXY_TARGET` is not set — no silent fallback.

**Why:** The frontend and API run on different ports in dev. Without the proxy, `/api/*` fetch calls hit Vite and get the HTML index back instead of JSON — auth silently does nothing.

**How to apply:** If the API port ever changes, update `API_PROXY_TARGET` in Replit's shared environment variables. Do not change the vite.config.ts fallback.
