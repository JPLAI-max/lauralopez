---
name: Express params cast
description: req.params destructuring types id as string|string[] in this monorepo, breaking drizzle eq() overloads
---

## Rule
Always use `const id = req.params['id'] as string;` instead of `const { id } = req.params;` in admin route handlers.

**Why:** In this monorepo's TypeScript config, destructuring `req.params` produces `string | string[]` for each key. Drizzle's `eq()` overloads only accept `string | SQLWrapper` on the right side, so passing the uncast value fails with TS2769. Already-existing routes were typed before this became apparent; new routes added in Brick 6 triggered the error.

**How to apply:** Any new Express route handler that uses a path param should apply the `as string` cast immediately. No other change needed — `string | SQLWrapper` accepts a plain `string`.
