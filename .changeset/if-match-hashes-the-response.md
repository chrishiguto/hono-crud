---
'hono-crud': patch
---

Update's `If-Match` check now hashes the same representation a read's `ETag` is computed from: the decrypted row run through the finalize chain. It used to hash the stored row, so any model whose response differs from its row (a projected-away column, a computed field, a serialization profile, a serializer, an encrypted field) answered every conditional update with 409, even with a fresh ETag. The response projection made that true for every model whose row is wider than its schema. A read made with `?fields=` still returns a partial-representation ETag that won't match; send `If-Match` from a full read.
