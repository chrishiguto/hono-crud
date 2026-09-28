/**
 * Response projection: the one rule that keeps a stored row's extra columns
 * off the wire. A model's row can be wider than its schema (a bucket key, a
 * password hash, the text behind a JSON column); the schema is what OpenAPI
 * documents, so every record a verb returns is cut down to the keys below.
 *
 * `CrudEndpoint.getResponseProjection()` builds the key sets from the model;
 * these functions only apply them, so export, version history and the
 * finalize chain share one implementation.
 */

/**
 * The keys a response record may carry, and for each included relation that
 * declares a `schema`, the keys its related rows may carry.
 */
export interface ResponseProjection {
  fields: ReadonlySet<string>;
  relations: ReadonlyMap<string, ReadonlySet<string>>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Copy of `record` holding only the keys in `fields`. */
export function pickFields(
  record: Record<string, unknown>,
  fields: ReadonlySet<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (fields.has(key)) out[key] = value;
  }
  return out;
}

function pickRow(row: unknown, fields: ReadonlySet<string>): unknown {
  return isPlainRecord(row) ? pickFields(row, fields) : row;
}

/** A to-one include is a row (or null), a to-many include an array of rows. */
function pickRelated(value: unknown, fields: ReadonlySet<string>): unknown {
  return Array.isArray(value) ? value.map((row) => pickRow(row, fields)) : pickRow(value, fields);
}

/**
 * Keep only the projection's keys on a plain-object record, and project each
 * included relation's rows onto its schema. Anything that is not a plain
 * object (a serializer that returns a string, an array) passes through.
 */
export function projectRecord(value: unknown, projection: ResponseProjection): unknown {
  if (!isPlainRecord(value)) return value;
  const out = pickFields(value, projection.fields);
  for (const [name, fields] of projection.relations) {
    if (name in out) out[name] = pickRelated(out[name], fields);
  }
  return out;
}
