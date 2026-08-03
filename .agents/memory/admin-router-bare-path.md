---
name: Admin router bare path bug
description: wouter :rest* wildcard does not match zero path segments, so /admin (bare) needs an explicit Route entry separate from /admin/:rest*.
---

## Rule
In wouter, `<Route path="/admin/:rest*">` does **not** match the bare path `/admin`
(no trailing segment). Always register the bare path as its own route.

## How it's implemented
`AdminRouter` in `App.tsx` uses a shared `AdminProtectedShell` component registered
for BOTH paths:
```tsx
<Route path="/admin" component={AdminProtectedShell} />
<Route path="/admin/:rest*" component={AdminProtectedShell} />
```
A catch-all `<Route component={NotFound} />` follows so unmatched `/admin/...` paths
render NotFound instead of a blank page.

**Why:** Before this fix, navigating to `/admin` after TOTP enrollment mounted
`AdminRouter` (via the outer App.tsx Switch's `<Route path="/admin">`), but the inner
Switch had no route that matched the bare path, so `ProtectedRoute` never mounted,
no `GET /api/auth/me` request fired, and the page was blank with zero errors.

**How to apply:** Whenever adding a new router component with a Switch inside, always
check that bare paths have explicit entries alongside wildcard entries.
