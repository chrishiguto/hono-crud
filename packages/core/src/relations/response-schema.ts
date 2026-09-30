import { type ZodObject, type ZodRawShape, z } from 'zod';

import type { MetaInput, RelationConfig } from '../core/types';

/**
 * Extend a List/Read/Search/Export response **item** schema with the model's
 * includable relations, so the OpenAPI response documents what
 * `?include=<relation>` returns — and generated typed clients auto-type the
 * embedded related data instead of consumers having to hand-type it.
 *
 * A relation is added only when it is listed in `allowedIncludes` AND declares a
 * `schema` (the related model's shape). The field is always OPTIONAL, since the
 * relation is present only when explicitly requested via `?include=`:
 *   - `hasMany`            → `z.array(relationSchema).optional()`
 *   - `belongsTo` / `hasOne` → `z.union([relationSchema, z.null()]).optional()`
 *
 * Two emission constraints shape this (zod-to-openapi 8.x):
 *   - A named item schema (`.meta({ id })`) keeps its component `$ref`: it is
 *     re-named via `.openapi(id)` before `.extend()`, the one path zod-to-openapi
 *     emits as `allOf: [{ $ref }, { relations }]`. A plain `.extend()` drops the
 *     id and inlines the row. Not `z.intersection`: Zod's JSON Schema output
 *     (MCP `outputSchema`) closes both allOf branches, rejecting every row.
 *   - A to-one relation is a union with null, not `.nullable()`: nullable over a
 *     named schema can mark the shared component itself nullable when it is the
 *     schema's first use (asteasolutions/zod-to-openapi#258).
 *
 * No-op (returns `itemSchema` unchanged) when there are no allowed includes or no
 * included relation declares a `schema`.
 */
export function withIncludableRelations(
  itemSchema: ZodObject<ZodRawShape>,
  meta: MetaInput,
  allowedIncludes: readonly string[],
): ZodObject<ZodRawShape> {
  const relations = meta.model.relations;
  if (!relations || allowedIncludes.length === 0) return itemSchema;

  // Use Record for mutable shape building (ZodRawShape is readonly in Zod v4).
  const extension: Record<string, z.ZodTypeAny> = {};
  for (const name of allowedIncludes) {
    const relation = relations[name] as RelationConfig | undefined;
    const relationSchema = relation?.schema;
    if (!relationSchema) continue;
    extension[name] =
      relation.type === 'hasMany'
        ? z.array(relationSchema).optional()
        : z.union([relationSchema, z.null()]).optional();
  }
  if (Object.keys(extension).length === 0) return itemSchema;

  const id = itemSchema.meta()?.id;
  const base = typeof id === 'string' ? itemSchema.openapi(id) : itemSchema;
  return base.extend(extension);
}
