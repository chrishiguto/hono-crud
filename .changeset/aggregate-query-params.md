---
'hono-crud': patch
'@hono-crud/memory': patch
'@hono-crud/drizzle': patch
'@hono-crud/prisma': patch
---

Fix aggregate `limit`, `offset`, and `withDeleted` query params. The aggregate query schema coerced them (`z.coerce.number()` / `z.coerce.boolean()`), so the parser never saw them: `?limit=` and `?offset=` were ignored (including the `maxLimit` check), `?withDeleted=false` read as `true`, and `withDeleted` also fell through as a filter on a column that doesn't exist (memory counted 0 rows, drizzle threw). `limit` and `offset` are now strings parsed as non-negative integers (400 on anything else), and the soft-delete param uses the model's `softDelete.queryParam`, is parsed once into `AggregateOptions.withDeleted`, and is ignored when `allowQueryDeleted` is `false`. The prisma adapter's native `groupBy` also applies `orderBy`, `limit`, and `offset` and reports `totalGroups`, like the other adapters. `parseAggregateQuery` takes an optional second argument with the soft-delete settings. MCP aggregate tools now take `limit` and `offset` as strings, like the list tool's `page` and `per_page`.
