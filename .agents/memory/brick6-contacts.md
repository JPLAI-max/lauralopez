---
name: Brick 6 contacts
description: Schema, API, and UI for the Contacts module — what was built, key constraints
---

## What's live
- Migration 0005 applied: `contacts`, `contact_interactions`, `contact_id` FK on `transactions`
- Partial unique index: `(ownerId, lower(email)) WHERE email IS NOT NULL AND archived = false`
- API routes at `artifacts/api-server/src/routes/admin/contacts.ts`, mounted at `/admin/contacts`
- `POST /admin/inquiries/:id/to-contact` — creates or dedupes contact from inquiry
- Frontend: `Contacts.tsx` (list + detail + timeline + subscribe toggle + CSV import + create modal)
- Frontend: `Inquiries.tsx` rewritten with true lg-breakpoint split, search, "Save to Contacts" button

## Key constraints (enforced at API layer)
- **Never auto-subscribe**: importing contacts, saving from inquiry, or creating manually MUST NOT set `subscribedIntelligence = true`. Subscribe is always an explicit user action via `POST /:id/subscribe`.
- **Intelligence list is a query**: `WHERE subscribedIntelligence = true AND unsubscribedAt IS NULL AND archived = false`. Not a separate table.
- **Unsubscribe is one-way by default**: stamps `unsubscribedAt`, sets `subscribedIntelligence = false`. Re-subscribe requires explicit POST to `/:id/subscribe`.
- **Dedup rule**: partial unique index at DB + application-level check in POST / and POST /inquiries/:id/to-contact before inserting.

## How to apply
When adding any flow that creates a contact (e.g. new intake forms), copy the `subscribedIntelligence: false` pattern and the email dedup check from `contacts.ts`.
