/**
 * Cell 8 — Finalize pipeline parity across record-returning verbs.
 *
 * The finalize model variant declares:
 * - `serializationProfile: { exclude: ['age'] }` — `age` must never appear
 *   in a response,
 * - a computed field `nameUpper` — must always appear, and
 * - no tenant column in its schema, while its create verbs stamp one on the
 *   row — a server-only column (bucket key, password hash) that must never
 *   appear in a response, with or without a serializer.
 *
 * All must hold IDENTICALLY on every record-returning verb: the shared
 * finalize chain (create, read, list, batchCreate, batchDelete, import,
 * bulkPatch, version rollback, batchUpsert's shaping), plus the projection on
 * the paths that skip it (export, version snapshots, `?include=` rows).
 */
import { expect, test } from 'vitest';
import {
  type AdapterDescriptor,
  type BatchCreateResult,
  type BatchDeleteResult,
  type ConformanceRecord,
  type CtxGetter,
  createRecord,
  expectError,
  expectList,
  expectSuccess,
  jsonInit,
  readJson,
} from '../contract';

export function registerFinalizePipelineCells(descriptor: AdapterDescriptor, ctx: CtxGetter): void {
  const serverOnlyField = descriptor.tenant.field;

  function expectFinalized(record: ConformanceRecord, expectedName: string): void {
    expect(record.name).toBe(expectedName);
    expect(record.nameUpper).toBe(expectedName.toUpperCase());
    // The serialization profile must strip the field entirely, not null it.
    expect('age' in record).toBe(false);
    // A stored column the schema leaves out never reaches the client.
    expect(serverOnlyField in record).toBe(false);
  }

  test('finalize pipeline: computed field, profile omission and schema projection are identical on create/read/list/batchCreate/batchDelete', async () => {
    const { app } = ctx();

    // create
    const created = await createRecord(app, '/finalize-items', {
      name: 'Widget One',
      email: 'widget1@conformance.test',
      role: 'user',
      age: 21,
    });
    expectFinalized(created, 'Widget One');

    // read
    const read = await expectSuccess<ConformanceRecord>(
      await app.request(`/finalize-items/${created.id}`),
      200,
    );
    expectFinalized(read, 'Widget One');

    // batchCreate
    const batchResponse = await app.request(
      '/finalize-items/batch',
      jsonInit('POST', {
        items: [
          { name: 'Widget Two', email: 'widget2@conformance.test', role: 'user', age: 22 },
          { name: 'Widget Three', email: 'widget3@conformance.test', role: 'user', age: 23 },
        ],
      }),
    );
    expect(batchResponse.status).toBe(201);
    const batchBody = await readJson<{
      success: true;
      result: BatchCreateResult<ConformanceRecord>;
    }>(batchResponse);
    expect(batchBody.success).toBe(true);
    expect(batchBody.result.count).toBe(2);
    expect(batchBody.result.created).toHaveLength(2);
    const byEmail = new Map(batchBody.result.created.map((record) => [record.email, record]));
    expectFinalized(byEmail.get('widget2@conformance.test') as ConformanceRecord, 'Widget Two');
    expectFinalized(byEmail.get('widget3@conformance.test') as ConformanceRecord, 'Widget Three');

    // list
    const list = await expectList(await app.request('/finalize-items'));
    expect(list.result).toHaveLength(3);
    const expectedNames = new Map([
      ['widget1@conformance.test', 'Widget One'],
      ['widget2@conformance.test', 'Widget Two'],
      ['widget3@conformance.test', 'Widget Three'],
    ]);
    for (const record of list.result) {
      expectFinalized(record, expectedNames.get(record.email) as string);
    }

    // batchDelete (finding 44: must run the same finalize chain)
    const idsToDelete = batchBody.result.created.map((record) => record.id);
    const deleteResponse = await app.request(
      '/finalize-items/batch',
      jsonInit('DELETE', { ids: idsToDelete }),
    );
    expect(deleteResponse.status).toBe(200);
    const deleteBody = await readJson<{
      success: true;
      result: BatchDeleteResult<ConformanceRecord>;
    }>(deleteResponse);
    expect(deleteBody.success).toBe(true);
    expect(deleteBody.result.count).toBe(2);
    expect(deleteBody.result.deleted).toHaveLength(2);
    const deletedByEmail = new Map(
      deleteBody.result.deleted.map((record) => [record.email, record]),
    );
    expectFinalized(
      deletedByEmail.get('widget2@conformance.test') as ConformanceRecord,
      'Widget Two',
    );
    expectFinalized(
      deletedByEmail.get('widget3@conformance.test') as ConformanceRecord,
      'Widget Three',
    );
  });

  test('finalize projection: export and batchUpsert never echo a column the schema leaves out', async () => {
    const { app } = ctx();

    const parent = await createRecord(app, '/finalize-items', {
      name: 'Parent',
      email: 'projection-parent@conformance.test',
      role: 'user',
      age: 50,
    });
    expect(serverOnlyField in parent).toBe(false);

    // export (buffered JSON and CSV) reads through the adapter `list`, not the
    // finalize chain — its columns come from the stored row.
    const exported = await expectSuccess<{ data: ConformanceRecord[]; count: number }>(
      await app.request('/finalize-items/export?format=json'),
      200,
    );
    expect(exported.count).toBe(1);
    expect(serverOnlyField in exported.data[0]!).toBe(false);
    expect(exported.data[0]!.email).toBe('projection-parent@conformance.test');

    const csv = await app.request('/finalize-items/export?format=csv');
    expect(csv.status).toBe(200);
    const header = (await csv.text()).split('\n')[0]!.split(',');
    expect(header).toContain('email');
    expect(header).not.toContain(serverOnlyField);

    // batchUpsert adds computed fields early (its events carry them), then
    // shapes its items through the rest of the chain.
    const upsert = await app.request(
      '/finalize-items/batch/upsert',
      jsonInit('POST', [
        { name: 'Parent Renamed', email: 'projection-parent@conformance.test', role: 'user' },
      ]),
    );
    expect(upsert.status).toBe(200);
    const upserted = await readJson<{
      success: true;
      result: { items: Array<{ data: ConformanceRecord }> };
    }>(upsert);
    expect(upserted.result.items[0]!.data.name).toBe('Parent Renamed');
    expect(serverOnlyField in upserted.result.items[0]!.data).toBe(false);
  });

  if (descriptor.capabilities.relationScoping) {
    test('finalize projection: ?include= rows on read and export never echo a column the schema leaves out', async () => {
      const { app } = ctx();
      const parent = await createRecord(app, '/finalize-items', {
        name: 'Parent',
        email: 'include-parent@conformance.test',
        role: 'user',
      });
      const child = await createRecord(app, '/finalize-items', {
        name: 'Child',
        email: 'include-child@conformance.test',
        role: 'user',
        parentId: parent.id,
      });

      // ?include= attaches related rows as stored; the relation's `schema` is
      // what OpenAPI documents for them.
      const read = await expectSuccess<ConformanceRecord & { parent: ConformanceRecord | null }>(
        await app.request(`/finalize-items/${child.id}?include=parent`),
        200,
      );
      expect(read.parent?.name).toBe('Parent');
      expect(serverOnlyField in (read.parent as ConformanceRecord)).toBe(false);

      // Export skips the finalize chain, so it projects included rows itself.
      const exported = await expectSuccess<{
        data: Array<ConformanceRecord & { parent?: ConformanceRecord | null }>;
      }>(await app.request('/finalize-items/export?format=json&include=parent'), 200);
      const exportedChild = exported.data.find((record) => record.id === child.id);
      expect(exportedChild?.parent?.name).toBe('Parent');
      expect(serverOnlyField in (exportedChild?.parent as ConformanceRecord)).toBe(false);
    });
  } else {
    test.skip(`finalize projection: ?include= rows [skipped: ${descriptor.name} has no self-relation on its finalize model]`, () => {});
  }

  test('finalize pipeline: import and bulkPatch responses run the same chain', async () => {
    const { app } = ctx();
    const email = 'projection-import@conformance.test';
    await createRecord(app, '/finalize-items', { name: 'Seed', email, role: 'user', age: 41 });

    // import (upsert mode) updates the stamped row and echoes it per result row.
    const imported = await app.request(
      '/finalize-items/import?mode=upsert',
      jsonInit('POST', { items: [{ name: 'Imported', email, role: 'user' }] }),
    );
    expect(imported.status).toBe(200);
    const importBody = await readJson<{
      success: true;
      result: { results: Array<{ status: string; data?: ConformanceRecord }> };
    }>(imported);
    expect(importBody.result.results[0]!.status).toBe('updated');
    expectFinalized(importBody.result.results[0]!.data!, 'Imported');

    // bulkPatch returns the patched rows where the adapter surfaces them;
    // prisma's count-only updateMany returns none (`bulkPatchReturnsRecords`).
    const patched = await app.request(
      `/finalize-items/bulk?email=${encodeURIComponent(email)}`,
      jsonInit('PATCH', { name: 'Patched' }),
    );
    expect(patched.status).toBe(200);
    const patchBody = await readJson<{ updated: number; records?: ConformanceRecord[] }>(patched);
    expect(patchBody.updated).toBe(1);
    if (descriptor.capabilities.bulkPatchReturnsRecords) {
      expect(patchBody.records).toHaveLength(1);
      expectFinalized(patchBody.records![0]!, 'Patched');
    } else {
      expect(patchBody.records).toBeUndefined();
    }
  });

  test('finalize pipeline: the ETag a read returns satisfies If-Match on update', async () => {
    const { app } = ctx();
    // The response differs from the stored row (computed field added, profiled
    // field and server-only column dropped), so the If-Match check has to hash
    // the finalized representation the client saw, not the row.
    const created = await createRecord(app, '/finalize-items', {
      name: 'Tagged',
      email: 'projection-etag@conformance.test',
      role: 'user',
      age: 22,
    });
    const read = await app.request(`/finalize-items/${created.id}`);
    expect(read.status).toBe(200);
    const etag = read.headers.get('ETag');
    expect(etag).toBeTruthy();

    const current = await app.request(
      `/finalize-items/${created.id}`,
      jsonInit('PATCH', { name: 'Tagged Two' }, { 'If-Match': etag! }),
    );
    expect(current.status).toBe(200);

    await expectError(
      await app.request(
        `/finalize-items/${created.id}`,
        jsonInit('PATCH', { name: 'Tagged Three' }, { 'If-Match': etag! }),
      ),
      409,
      'CONFLICT',
    );
  });

  if (!descriptor.capabilities.versionHistory) {
    test.skip(`finalize projection: version verbs [skipped: ${descriptor.name} mounts no version verbs on its finalize model]`, () => {});
    return;
  }

  test('finalize projection: version history, read, compare and rollback never echo a column the schema leaves out', async () => {
    const { app } = ctx();
    const created = await createRecord(app, '/finalize-items', {
      name: 'Versioned',
      email: 'projection-version@conformance.test',
      role: 'user',
      age: 30,
    });
    // Each update snapshots the row as it was: version 1 carries the create's
    // server-only value, version 2 the value the first update stamped, so the
    // two snapshots differ in that column as well as in `name`.
    for (const name of ['Versioned Two', 'Versioned Three']) {
      const updated = await app.request(
        `/finalize-items/${created.id}`,
        jsonInit('PATCH', { name }),
      );
      expect(updated.status).toBe(200);
    }

    type Entry = { data: ConformanceRecord; changes?: Array<{ field: string }> };
    const history = await expectSuccess<{ versions: Entry[] }>(
      await app.request(`/finalize-items/${created.id}/versions`),
      200,
    );
    expect(history.versions.length).toBeGreaterThan(0);
    for (const entry of history.versions) {
      expect(serverOnlyField in entry.data).toBe(false);
      for (const change of entry.changes ?? []) expect(change.field).not.toBe(serverOnlyField);
    }

    const version = await expectSuccess<Entry>(
      await app.request(`/finalize-items/${created.id}/versions/1`),
      200,
    );
    expect(version.data.name).toBe('Versioned');
    expect(serverOnlyField in version.data).toBe(false);

    const compare = await expectSuccess<{ changes: Array<{ field: string }> }>(
      await app.request(`/finalize-items/${created.id}/versions/compare?from=1&to=2`),
      200,
    );
    const compared = compare.changes.map((c) => c.field);
    expect(compared).toContain('name');
    expect(compared).not.toContain(serverOnlyField);

    // Rollback runs the full finalize chain: computed field in, profiled field out.
    const rollback = await expectSuccess<ConformanceRecord>(
      await app.request(`/finalize-items/${created.id}/versions/1/rollback`, { method: 'POST' }),
      200,
    );
    expectFinalized(rollback, 'Versioned');
  });
}
