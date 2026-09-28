import { MemoryExportEndpoint, MemoryListEndpoint } from '@hono-crud/memory';
import { Hono } from 'hono';
import { fromHono, registerCrud } from 'hono-crud';
import type { MetaInput, Model } from 'hono-crud';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

// The list query params a generated client reads from the OpenAPI document:
// paging carries its type, bounds and defaults, so no client restates them.

const ItemSchema = z.object({ id: z.uuid(), name: z.string() });
type ItemMeta = MetaInput<typeof ItemSchema>;
const itemMeta: ItemMeta = {
  model: {
    tableName: 'paging_items',
    schema: ItemSchema,
    primaryKeys: ['id'],
  } satisfies Model<typeof ItemSchema>,
};

class ItemList extends MemoryListEndpoint<Record<string, never>, ItemMeta> {
  _meta = itemMeta;
  protected override defaultPerPage = 25;
  protected override maxPerPage = 50;
}
class ItemExport extends MemoryExportEndpoint<Record<string, never>, ItemMeta> {
  _meta = itemMeta;
}

interface Parameter {
  name: string;
  in: string;
  schema: Record<string, unknown>;
}
interface OpenApiDocument {
  paths: Record<string, { get?: { parameters?: Parameter[] } }>;
}

let document: OpenApiDocument;

const queryParam = (path: string, name: string) =>
  document.paths[path]?.get?.parameters?.find((p) => p.in === 'query' && p.name === name)?.schema;

beforeAll(async () => {
  const app = fromHono(new Hono());
  registerCrud(app, '/items', {
    list: ItemList as never,
    export: ItemExport as never,
  });
  app.doc('/openapi.json', { openapi: '3.1.0', info: { title: 'paging', version: '1.0.0' } });
  document = (await (await app.request('/openapi.json')).json()) as OpenApiDocument;
});

describe('list query schema', () => {
  it('declares page as an integer from 1, defaulting to 1', () => {
    expect(queryParam('/items', 'page')).toEqual({ type: 'integer', minimum: 1, default: 1 });
  });

  it('declares per_page with the endpoint default page size and ceiling', () => {
    expect(queryParam('/items', 'per_page')).toEqual({
      type: 'integer',
      minimum: 1,
      maximum: 50,
      default: 25,
    });
  });

  it('leaves page and per_page out of the export query', () => {
    expect(queryParam('/items/export', 'page')).toBeUndefined();
    expect(queryParam('/items/export', 'per_page')).toBeUndefined();
  });
});
