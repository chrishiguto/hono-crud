---
'hono-crud': minor
---

List `page` and `per_page` are declared as integers with their bounds and defaults. The OpenAPI document used to state both as optional strings, so a generated client typed them as `string` and could not learn the endpoint's `defaultPerPage` or `maxPerPage`. They are now `integer`, `minimum: 1`, with `page` defaulting to 1 and `per_page` defaulting to `defaultPerPage` and capped at `maxPerPage`. The same schema validates the request, so a value outside the documented range answers 400 `VALIDATION_ERROR` instead of being clamped: `?per_page=500` against a ceiling of 100, `?page=0`, `?per_page=abc`, `?per_page=2.5`. Migration: a client that relied on the clamp must send a page size within `maxPerPage`. Export no longer advertises `page` / `per_page`, which it never honored.
