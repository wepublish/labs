import {
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';
import { handleScoutsRequest } from '../../scouts/index.ts';
import type { Scout } from '../../_shared/supabase-client.ts';
import type { ScoutBaselineFields } from '../../_shared/scout-baseline.ts';

type Row = Record<string, unknown>;

class FakeSupabase {
  scouts = new Map<string, Row>();
  deletedScoutIds: string[] = [];
  insertedRows: Row[] = [];
  nextId = 1;

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

class FakeQuery {
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private filters: Array<[string, unknown]> = [];
  private payload: Row | null = null;

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: string,
  ) {}

  select() {
    return this;
  }

  insert(payload: Row) {
    this.action = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload: Row) {
    this.action = 'update';
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  range() {
    return this;
  }

  single() {
    return Promise.resolve(this.executeSingle());
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private executeSingle() {
    if (this.table !== 'scouts') return { data: null, error: null };

    if (this.action === 'insert') {
      const row = {
        id: `scout-${this.db.nextId++}`,
        created_at: '2026-04-27T00:00:00Z',
        updated_at: '2026-04-27T00:00:00Z',
        ...this.payload,
      };
      this.db.scouts.set(String(row.id), row);
      this.db.insertedRows.push({ ...row });
      return { data: row, error: null };
    }

    const row = this.matchingRows()[0] ?? null;
    if (this.action === 'update' && row) {
      Object.assign(row, this.payload);
      return { data: row, error: null };
    }

    return { data: row, error: row ? null : { code: 'PGRST116', message: 'not found' } };
  }

  private execute() {
    if (this.table !== 'scouts') return { data: null, error: null };

    if (this.action === 'delete') {
      for (const row of this.matchingRows()) {
        const id = String(row.id);
        this.db.deletedScoutIds.push(id);
        this.db.scouts.delete(id);
      }
      return { data: null, error: null };
    }

    return this.executeSingle();
  }

  private matchingRows() {
    return [...this.db.scouts.values()].filter((row) =>
      this.filters.every(([column, value]) => row[column] === value)
    );
  }
}

function makeDeps(db: FakeSupabase, initializeScoutBaseline: (scout: Scout) => Promise<ScoutBaselineFields>) {
  return {
    createServiceClient: () => db as never,
    requireUserId: () => 'user-1',
    initializeScoutBaseline,
  };
}

function request(method: string, path: string, body?: Row) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-user-id': 'user-1',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

Deno.test('scouts create initializes baseline before activating active web scouts', async () => {
  const db = new FakeSupabase();
  const baselineInputs: Scout[] = [];

  const res = await handleScoutsRequest(
    request('POST', '/scouts', {
      name: 'Active Scout',
      url: 'https://example.ch/news',
      criteria: '',
      frequency: 'daily',
      location: { city: 'aesch', country: 'Schweiz' },
      is_active: true,
    }),
    makeDeps(db, (scout) => {
      baselineInputs.push(scout);
      return Promise.resolve({ provider: 'firecrawl', content_hash: null });
    }),
  );

  const body = await res.json();
  const created = body.data as Row;

  assertEquals(res.status, 201);
  assertEquals(db.insertedRows[0].is_active, false);
  assertEquals(baselineInputs.length, 1);
  assertEquals(baselineInputs[0].is_active, true);
  assertEquals(created.is_active, true);
  assertEquals(created.provider, 'firecrawl');
  assertEquals(created.content_hash, null);
});

Deno.test('scouts create deletes draft scout when active baseline initialization fails', async () => {
  const db = new FakeSupabase();
  const originalError = console.error;
  console.error = () => {};

  try {
    const res = await handleScoutsRequest(
      request('POST', '/scouts', {
        name: 'Broken Scout',
        url: 'https://example.ch/news',
        criteria: '',
        frequency: 'daily',
        location: { city: 'aesch', country: 'Schweiz' },
        is_active: true,
      }),
      makeDeps(db, () => Promise.reject(new Error('baseline boom'))),
    );

    const text = await res.text();
    assertEquals(res.status, 500);
    assertEquals(db.deletedScoutIds, ['scout-1']);
    assertEquals(db.scouts.size, 0);
    assertStringIncludes(text, 'baseline boom');
  } finally {
    console.error = originalError;
  }
});

Deno.test('scouts update initializes baseline when activating an inactive scout', async () => {
  const db = new FakeSupabase();
  db.scouts.set('scout-1', {
    id: 'scout-1',
    user_id: 'user-1',
    name: 'Inactive Scout',
    url: 'https://example.ch/news',
    criteria: '',
    frequency: 'daily',
    location: { city: 'aesch', country: 'Schweiz' },
    scout_type: 'web',
    is_active: false,
    provider: null,
    content_hash: null,
    topic: null,
    location_mode: 'manual',
  });

  const baselineInputs: Scout[] = [];
  const res = await handleScoutsRequest(
    request('PUT', '/scouts/scout-1', { is_active: true }),
    makeDeps(db, (scout) => {
      baselineInputs.push(scout);
      return Promise.resolve({ provider: 'firecrawl_plain', content_hash: 'hash-1' });
    }),
  );

  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(baselineInputs[0].is_active, true);
  assertEquals(body.data.provider, 'firecrawl_plain');
  assertEquals(body.data.content_hash, 'hash-1');
});

Deno.test('scouts update reinitializes baseline when active web scout URL changes', async () => {
  const db = new FakeSupabase();
  db.scouts.set('scout-1', {
    id: 'scout-1',
    user_id: 'user-1',
    name: 'Active Scout',
    url: 'https://example.ch/old',
    criteria: '',
    frequency: 'daily',
    location: { city: 'aesch', country: 'Schweiz' },
    scout_type: 'web',
    is_active: true,
    provider: 'firecrawl',
    content_hash: null,
    topic: null,
    location_mode: 'manual',
  });

  const baselineInputs: Scout[] = [];
  const res = await handleScoutsRequest(
    request('PUT', '/scouts/scout-1', { url: 'https://example.ch/new' }),
    makeDeps(db, (scout) => {
      baselineInputs.push(scout);
      return Promise.resolve({ provider: 'firecrawl_plain', content_hash: 'hash-new' });
    }),
  );

  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(baselineInputs[0].url, 'https://example.ch/new');
  assertEquals(body.data.provider, 'firecrawl_plain');
  assertEquals(body.data.content_hash, 'hash-new');
});
