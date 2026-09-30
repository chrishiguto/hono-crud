---
'hono-crud': patch
---

Keep a named model's OpenAPI component `$ref` when `?include=` relations are documented (#150).

A model schema named with `.meta({ id })` now emits `allOf: [{ $ref }, { <relations> }]` on List/Read responses instead of an anonymous inlined row, so generated clients get the same named type on every verb. A `z.strictObject` or `.catchall()` model keeps the inlined row: its component's `additionalProperties` would reject the relation fields. The includable relations are also now documented on Search and Export responses, which already loaded them at runtime.

To-one (`belongsTo`/`hasOne`) relations are documented as `anyOf: [{ $ref }, null]` rather than a nullable wrapper, which could otherwise mark the related model's shared component itself as nullable depending on route registration order.
