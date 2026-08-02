# Laura Lopez — Beverly Hills Estates

A luxury real estate advisory site for Laura Lopez of The Beverly Hills Estates, featuring property listings, market intelligence, and a real consultation inquiry capture form.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/laura-lopez run dev` — run the frontend (assigned port)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (wouter, Tailwind v4, shadcn/ui, Framer Motion)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Email: Resend (optional — app runs without it)

## Where things live

- **DB schema**: `lib/db/src/schema/inquiries.ts` — inquiries table (and schema index at `lib/db/src/schema/index.ts`)
- **OpenAPI contract**: `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- **Generated client hooks**: `lib/api-client-react/src/generated/api.ts`
- **Generated Zod validators**: `lib/api-zod/src/generated/api.ts`
- **API routes**: `artifacts/api-server/src/routes/` — `health.ts`, `inquiries.ts`
- **Mailer**: `artifacts/api-server/src/lib/mailer.ts`
- **Frontend pages**: `artifacts/laura-lopez/src/pages/`
- **Contact form**: `artifacts/laura-lopez/src/components/ContactForm.tsx`

## Architecture decisions

- Inquiry capture is the only backend feature. The frontend is otherwise static (no auth, no user accounts).
- Email notification via Resend is fire-and-forget after a successful DB insert — email failure never drops a lead.
- IP addresses are never stored raw; only a sha256(ip + INQUIRY_IP_SALT) hash is persisted.
- Honeypot field `website` on the contact form silently discards bot submissions with a fake 201.
- Rate limiting is in-memory (5 submissions/IP/hour). Move to DB-backed counter before scaling to multi-instance.

## Product

- **Homepage** — hero, advisory philosophy, market intelligence preview, Top Picks, and contact form
- **About** — Laura's biography and portrait
- **Market Intelligence** — articles by category
- **Top Picks** — 6 curated properties with commentary
- **Listings / Sold** — placeholder pages ready for IDX data
- **Contact** — full consultation inquiry form wired to the real API

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- **Always run codegen after editing `openapi.yaml`**: `pnpm --filter @workspace/api-spec run codegen`
- `resend` is an optional runtime dependency. If `RESEND_API_KEY` or `INQUIRY_NOTIFY_EMAIL` is unset, the server logs a skip and continues — no crash.
- The in-memory rate limiter resets on server restart. This is intentional for dev; upgrade before production scale.
- DB push is dev-only (`pnpm --filter @workspace/db run push`). Production DB gets its own push at deploy time.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
