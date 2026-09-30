---
'hono-crud': patch
---

Update's `If-Match` check now hashes the same representation a read's `ETag` is computed from: the decrypted row, masked by `policies.fields`, run through the finalize chain. It used to hash the stored row, so any model whose response differs from its row (a projected-away column, a computed field, a serialization profile, a serializer, an encrypted field, a policy field mask) answered every conditional update with 409, even with a fresh ETag. The response projection made that true for every model whose row is wider than its schema. The check sees only model-level shaping: a read made with `?fields=` or `?include=`, or through a Read endpoint whose own `after` or `transform` reshapes the record, returns an ETag that won't match.
