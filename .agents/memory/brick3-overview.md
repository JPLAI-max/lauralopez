---
name: Brick 3 Transaction Timeline Engine
description: What was built in Brick 3 — schema, API, ICS, recovery codes, frontend
---

## Completed

**Schema** (`lib/db/src/schema/transactions.ts`, `users.ts`):
- `transactionsTable` — icsToken (random 64-char hex), closedAt, purchasePrice (decimal)
- `milestoneTemplatesTable` + `milestoneTemplateItemsTable` — seeded with 2 default templates
- `transactionMilestonesTable` — snapshots offsetDays/anchor/direction/dayType for recompute
- `transactionEventsTable` — append-only audit log (jsonb payload)
- `recoveryCodesTable` — codeHash argon2id, usedAt nullable

**Date engine** (`artifacts/api-server/src/lib/dates.ts`):
- `computeMilestoneDate({ anchorDate, offsetDays, direction, dayType })` — calendar and business day modes
- US federal holidays 2025-2028 in a module-level `Set<string>`
- `recomputeMilestoneDates()` — batch recompute for anchor date changes
- 20/20 unit tests in `dates.test.ts` (run via `scripts/node_modules/.bin/tsx`)

**Auth additions** (`artifacts/api-server/src/routes/auth.ts`):
- `POST /auth/totp/confirm` now returns `{ ok, recoveryCodes: string[] }` (10 Crockford base32 8-char codes, argon2id-hashed and stored)
- `POST /auth/verify-recovery` — accepts recovery code in place of TOTP, marks usedAt, logs `recovery_used`+`login`
- `GET /auth/recovery-codes/count` — returns `{ remaining: number }` (requireAuth)
- `POST /auth/recovery-codes/regenerate` — invalidates all, generates 10 new (requireAuth)
- Recovery code generator: `CROCKFORD[byte & 31]` — uniform selection from 32-char alphabet

**Transactions API** (`artifacts/api-server/src/routes/admin/transactions.ts`):
- CRUD: GET list, POST create, GET detail, PATCH, DELETE (soft → cancelled)
- `POST /transactions/preview` — compute milestones without saving
- `GET /transactions/templates` — list seeded templates
- PATCH milestone, POST ad-hoc milestone, DELETE milestone
- GET events (audit trail)
- Anchor date recompute: only updates milestones without overrideDate set

**Calendar** (`artifacts/api-server/src/routes/calendar.ts`):
- `GET /calendar/:icsToken.ics` — RFC 5545, all-day VEVENT per milestone
- VALARM 1 day prior for pending milestones
- Rate limit: 60/hr per token; unknown token → 404

**Frontend**:
- `Transactions.tsx` — list view (table + mobile cards), create flow (form→preview→confirm), detail view (milestone timeline with inline date edit, mark complete/waive, ad-hoc add)
- `TotpSetup.tsx` — now shows recovery codes step after enrollment
- `Settings.tsx` — recovery code count + regenerate UI
- `admin-api.ts` — full transaction API client + types

**Scripts**:
- `seed-templates.ts` — seeds 2 default templates; falls back to first DB user if ADMIN_SEED_EMAIL not set
- `test-brick3.ts` — 55/55 acceptance checks

**Why:** Brick 3 spec required full transaction timeline engine with date computation, ICS export, and TOTP recovery codes.
