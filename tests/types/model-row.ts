/**
 * Compile-time assertions for the stored-row type.
 *
 * Checked by `pnpm run typecheck:types` (tsc only — never executed). A model's
 * `schema` is its public shape; the row the adapter reads can be wider (a
 * column that must not leave the server, a JSON text column the schema
 * declares as an array). `serializer` receives that row.
 */
import { type DrizzleDatabaseConstraint, createDrizzleCrud } from '@hono-crud/drizzle';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { InferModel, InferModelRow } from 'hono-crud';
import { defineMeta, defineModel } from 'hono-crud';
import { z } from 'zod';

const attachmentsTable = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  filename: text('filename').notNull(),
  r2Key: text('r2_key').notNull(),
  tags: text('tags').notNull(),
});

const AttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  tags: z.array(z.string()),
});

// ============================================================================
// Drizzle table: the row is `$inferSelect`, contextually typed in defineModel
// ============================================================================

const AttachmentModel = defineModel({
  tableName: 'attachments',
  schema: AttachmentSchema,
  primaryKeys: ['id'],
  table: attachmentsTable,
  serializer: (row) => ({
    id: row.id,
    filename: row.filename,
    // `tags` is the JSON text column, not the schema's array.
    tags: JSON.parse(row.tags) as string[],
    keyLength: row.r2Key.length,
  }),
});

const row: InferModelRow<typeof AttachmentModel> = {
  id: 'a1',
  filename: 'cv.pdf',
  r2Key: 'bucket/key',
  tags: '[]',
};
const publicShape: InferModel<typeof AttachmentModel> = { id: 'a1', filename: 'cv.pdf', tags: [] };
void row;
void publicShape;

defineModel({
  tableName: 'attachments',
  schema: AttachmentSchema,
  primaryKeys: ['id'],
  table: attachmentsTable,
  // @ts-expect-error the row's `tags` is the text column, not string[]
  serializer: (row: z.infer<typeof AttachmentSchema>) => row.tags.join(','),
});

// ============================================================================
// No `$inferSelect` (schema-only, Prisma delegate name): falls back to schema
// ============================================================================

defineModel({
  tableName: 'attachments',
  schema: AttachmentSchema,
  primaryKeys: ['id'],
  serializer: (row) => row.tags.join(','),
});

defineModel({
  tableName: 'attachments',
  schema: AttachmentSchema,
  primaryKeys: ['id'],
  table: 'attachment',
  serializer: (row) => {
    // @ts-expect-error no table row type to derive: the schema has no r2Key
    return row.r2Key;
  },
});

// ============================================================================
// Read-side hooks receive the row too (Drizzle adapter)
// ============================================================================

declare const db: DrizzleDatabaseConstraint;
const crud = createDrizzleCrud(db, defineMeta({ model: AttachmentModel }));

export class AttachmentDelete extends crud.Delete {
  async after(prior: InferModelRow<typeof AttachmentModel>): Promise<void> {
    void prior.r2Key.length;
  }
}

export class AttachmentList extends crud.List {
  async after(items: InferModelRow<typeof AttachmentModel>[]) {
    return items.filter((item) => item.tags !== '[]');
  }
}

defineModel({
  tableName: 'attachments',
  schema: AttachmentSchema,
  primaryKeys: ['id'],
  table: attachmentsTable,
  computedFields: {
    hasKey: { schema: z.boolean(), compute: (row) => row.r2Key.length > 0 },
  },
  policies: { read: (_ctx, row) => row.r2Key.startsWith('bucket/') },
});
