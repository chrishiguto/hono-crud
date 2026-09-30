---
'hono-crud': patch
---

List, search, and export document `?field=` and `?field[ne]=` filters on a string `z.enum` or `z.literal` field as that enum instead of `type: string`, so a client generated from the OpenAPI document (and the MCP list tool) sees the allowed values, and the request validator rejects a typo with `400 VALIDATION_ERROR`. Comma-list (`in`, `nin`, `between`) and substring (`like`, `ilike`) filters stay strings. The param is rebuilt from the enum members, so the field's `.default()`, description, and component id stay off it.
