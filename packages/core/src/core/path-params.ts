/**
 * Path params of a `registerCrud` base path (`/notes/:noteId/comments`).
 *
 * Nested registrations put params in the base path that no endpoint declares:
 * endpoints only know their own sub-route params (`:id`, `:version`). These
 * helpers declare the base-path params in the emitted doc.
 */

import { z } from 'zod';
import type { OpenAPIRouteSchema } from './types';

/**
 * Param names in a Hono (`:noteId`, `:noteId{[0-9]+}`, `:noteId?`) or OpenAPI
 * (`{noteId}`) path, in order.
 */
export function pathParamNames(path: string): string[] {
  const names: string[] = [];
  for (const segment of path.split('/')) {
    const name = segment.startsWith(':')
      ? segment
          .slice(1)
          .replace(/\{.*\}$/, '')
          .replace(/\?$/, '')
      : /^\{(.+)\}$/.exec(segment)?.[1];
    if (name) names.push(name);
  }
  return names;
}

type ParamsObject = z.ZodObject<z.ZodRawShape>;

function isParamsObject(schema: unknown): schema is ParamsObject {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    'shape' in schema &&
    typeof (schema as { extend?: unknown }).extend === 'function'
  );
}

/**
 * Declare each base-path param as a string path param. The OpenAPI spec
 * requires every `{param}` in a path to be declared; without this a nested
 * list (`GET /notes/{noteId}/comments`) documents none. Params the endpoint
 * (or a user `request.params` override) already declares keep their schema;
 * a params schema that isn't an object is left alone.
 */
export function declareBasePathParams(
  schema: OpenAPIRouteSchema,
  basePath: string,
): OpenAPIRouteSchema {
  const params = schema.request?.params;
  if (params !== undefined && !isParamsObject(params)) return schema;
  const declared = params?.shape ?? {};
  const missing = pathParamNames(basePath).filter((name) => !(name in declared));
  if (missing.length === 0) return schema;
  const shape = Object.fromEntries(missing.map((name) => [name, z.string()]));
  const merged = params ? params.extend(shape) : z.object(shape);
  return {
    ...schema,
    request: {
      ...schema.request,
      params: merged as unknown as NonNullable<OpenAPIRouteSchema['request']>['params'],
    },
  };
}
