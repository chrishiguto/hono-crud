/**
 * Default OpenAPI `operationId`s for `registerCrud` routes.
 *
 * Without an `operationId`, client generators name each operation from its
 * method and path (`GET /api/notes/{id}/comments` → `getApiNotesByIdComments`).
 * The default here is `<verb><Resource>` — `listComments`, `getComment`,
 * `listNoteComments` — derived from the endpoint slot and the path passed to
 * `registerCrud`, so every consumer gets readable client functions without
 * setting `schema.operationId` on each class.
 *
 * The derivation is a public contract: the id becomes a function name in
 * generated clients, so any change to it renames those functions. The rules
 * below are therefore frozen; irregular names are fixed per endpoint with
 * `schema.operationId`, never by changing the rules.
 *
 * Resource phrase — the static segments of the base path, camelCased:
 * - a segment followed by a path param is singular (`/notes/:noteId/comments`
 *   → `NoteComments`), the last segment is plural for collection verbs and
 *   singular for item verbs, other segments are kept verbatim;
 * - a base path with no static segment falls back to the model `tableName`.
 *
 * Because the phrase comes from the path, ids are unique by construction
 * within one app (two resources cannot share a base path). They are NOT
 * unique across apps mounted under different prefixes (`app.route('/v1', a)`
 * and `app.route('/v2', b)`): the mount prefix is invisible at registration.
 */

import type { CrudEndpointName } from './crud-routes';
import type { OpenAPIRouteSchema } from './types';

/**
 * Controls default `operationId` generation. `false` turns it off, so routes
 * without an explicit `schema.operationId` emit none (the pre-default doc).
 */
export type OperationIdsOption = false;

/** The `registerCrud` slot a route was registered for, and its base path. */
export interface CrudRouteHint {
  operation: CrudEndpointName;
  basePath: string;
}

type Form = 'one' | 'many';

/**
 * `read` is `get` (the generator-idiomatic spelling); every other slot keeps
 * its own name as the verb. `form` picks the singular or plural resource
 * phrase; version routes name the version sub-resource after the record.
 */
const VERBS = {
  create: { verb: 'create', form: 'one' },
  list: { verb: 'list', form: 'many' },
  batchCreate: { verb: 'batchCreate', form: 'many' },
  batchUpdate: { verb: 'batchUpdate', form: 'many' },
  batchDelete: { verb: 'batchDelete', form: 'many' },
  batchRestore: { verb: 'batchRestore', form: 'many' },
  batchUpsert: { verb: 'batchUpsert', form: 'many' },
  search: { verb: 'search', form: 'many' },
  aggregate: { verb: 'aggregate', form: 'many' },
  export: { verb: 'export', form: 'many' },
  import: { verb: 'import', form: 'many' },
  upsert: { verb: 'upsert', form: 'one' },
  bulkPatch: { verb: 'bulkPatch', form: 'many' },
  read: { verb: 'get', form: 'one' },
  update: { verb: 'update', form: 'one' },
  delete: { verb: 'delete', form: 'one' },
  restore: { verb: 'restore', form: 'one' },
  clone: { verb: 'clone', form: 'one' },
  versionHistory: { verb: 'list', form: 'one', suffix: 'Versions' },
  versionCompare: { verb: 'compare', form: 'one', suffix: 'Versions' },
  versionRead: { verb: 'get', form: 'one', suffix: 'Version' },
  versionRollback: { verb: 'rollback', form: 'one', suffix: 'Version' },
} as const satisfies Record<CrudEndpointName, { verb: string; form: Form; suffix?: string }>;

/** Words that are the same in both forms. */
const INVARIANT = new Set(['news', 'series', 'species']);

/**
 * Frozen English singularizer — deliberately small, see the module note.
 * `categories` → `category`, `addresses` → `address`, `boxes` → `box`,
 * `status` → `status`, `comments` → `comment`; `people` stays `people`.
 */
export function singularize(word: string): string {
  const lower = word.toLowerCase();
  if (INVARIANT.has(lower)) return word;
  if (lower.endsWith('ies') && lower.length > 3) return `${word.slice(0, -3)}y`;
  if (/(sses|xes|ches|shes)$/.test(lower)) return word.slice(0, -2);
  if (/(ss|us|is)$/.test(lower)) return word;
  if (lower.endsWith('s')) return word.slice(0, -1);
  return word;
}

/** `user-profiles` / `user_profiles` → `UserProfiles`; `''` when no letters or digits. */
function pascal(segment: string): string {
  return segment
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join('');
}

/** A Hono (`:id`) or OpenAPI (`{id}`) path param. */
const isParam = (segment: string): boolean => segment.startsWith(':') || /^\{.+\}$/.test(segment);

/**
 * The default `operationId` for a `registerCrud` slot, or `undefined` when
 * neither the base path nor the table name yields a resource phrase.
 */
export function defaultOperationId(
  operation: CrudEndpointName,
  basePath: string,
  tableName?: string,
): string | undefined {
  const { verb, form, ...rest } = VERBS[operation];
  const suffix = 'suffix' in rest ? rest.suffix : '';
  const segments = basePath.split('/').filter((segment) => segment && segment !== '*');
  let lastStatic = -1;
  for (let i = segments.length - 1; i >= 0; i--) {
    if (!isParam(segments[i])) {
      lastStatic = i;
      break;
    }
  }

  const words: string[] = [];
  if (lastStatic === -1) {
    if (tableName) words.push(form === 'one' ? singularize(pascal(tableName)) : pascal(tableName));
  } else {
    segments.forEach((segment, i) => {
      if (isParam(segment)) return;
      const word = pascal(segment);
      const followedByParam = i + 1 < segments.length && isParam(segments[i + 1]);
      const singular = i === lastStatic ? form === 'one' : followedByParam;
      words.push(singular ? singularize(word) : word);
    });
  }

  const resource = words.join('');
  return resource ? `${verb}${resource}${suffix}` : undefined;
}

/**
 * Apply the default `operationId` to an endpoint's resolved schema. An
 * explicit `schema.operationId` always wins; `operationIds: false` leaves the
 * schema untouched.
 */
export function applyDefaultOperationId(
  schema: OpenAPIRouteSchema,
  hint: CrudRouteHint,
  model: { tableName: string } | undefined,
  option: OperationIdsOption | undefined,
): OpenAPIRouteSchema {
  if (schema.operationId !== undefined || option === false) return schema;
  const operationId = defaultOperationId(hint.operation, hint.basePath, model?.tableName);
  return operationId === undefined ? schema : { ...schema, operationId };
}
