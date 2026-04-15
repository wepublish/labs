/**
 * Integration tests for per-user LLM prompt overrides.
 *
 * CRUD lives on the two existing edge functions that already own these prompts:
 *   - GET/PUT/DELETE /bajour-select-units        → information_select override
 *   - GET/PUT/DELETE /compose/prompt             → draft_compose_layer2 override
 *
 * Covers round-trip (PUT → GET), validation (length + placeholder), and reset-to-default
 * (DELETE → GET returns hardcoded default). Written against a local `supabase start`
 * instance with the 20260417000001_user_prompts migration applied.
 */

import {
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';
import {
  DRAFT_COMPOSE_PROMPT,
  INFORMATION_SELECT_PROMPT,
} from '../../_shared/prompts.ts';
import { MAX_UNITS_PER_COMPOSE } from '../../_shared/constants.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const TEST_USER_ID = 'test-runner-user-prompts';
const SELECT_URL = `${SUPABASE_URL}/functions/v1/bajour-select-units`;
const COMPOSE_PROMPT_URL = `${SUPABASE_URL}/functions/v1/compose/prompt`;
const COMPOSE_MAX_UNITS_URL = `${SUPABASE_URL}/functions/v1/compose/max-units`;

function headers(): HeadersInit {
  return {
    'Authorization': `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
    'x-user-id': TEST_USER_ID,
  };
}

// Valid override for information_select — must contain both placeholders.
const VALID_SELECT_OVERRIDE = `Eigene Auswahlregeln für Integrationstest:
- AKTUALITÄT: {{recencyInstruction}}
- Wähle 5-15 Einheiten.
Heute: {{currentDate}}
Gib JSON zurück: { "selected_unit_ids": [...] }`;

const VALID_COMPOSE_OVERRIDE = `SCHREIBRICHTLINIEN (Integrationstest):
- Kurz und prägnant.
- Eine Idee pro Absatz.
- Zitiere Quellen inline.`;

async function resetSelect(): Promise<void> {
  await fetch(SELECT_URL, { method: 'DELETE', headers: headers() });
}

async function resetCompose(): Promise<void> {
  await fetch(COMPOSE_PROMPT_URL, { method: 'DELETE', headers: headers() });
}

// ---------------------------------------------------------------------------
// information_select (bajour-select-units)
// ---------------------------------------------------------------------------

Deno.test({
  name: 'information_select: PUT round-trip — GET reflects saved content',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await resetSelect();

    const putRes = await fetch(SELECT_URL, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ content: VALID_SELECT_OVERRIDE }),
    });
    assertEquals(putRes.status, 200, `PUT expected 200 got ${putRes.status}`);
    const putBody = await putRes.json();
    assertEquals(putBody.data.prompt, VALID_SELECT_OVERRIDE);

    const getRes = await fetch(SELECT_URL, { method: 'GET', headers: headers() });
    assertEquals(getRes.status, 200);
    const getBody = await getRes.json();
    assertEquals(getBody.data.prompt, VALID_SELECT_OVERRIDE);

    await resetSelect();
  },
});

Deno.test({
  name: 'information_select: PUT with missing {{currentDate}} placeholder returns 400',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const bad = 'Eigene Regeln. {{recencyInstruction}}. Keine Platzhalter für Datum.';
    const res = await fetch(SELECT_URL, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ content: bad }),
    });
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error.code, 'VALIDATION_ERROR');
    assertStringIncludes(body.error.message, '{{currentDate}}');
  },
});

Deno.test({
  name: 'information_select: PUT with missing {{recencyInstruction}} placeholder returns 400',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const bad = 'Eigene Regeln. Heute: {{currentDate}}. Keine Platzhalter für Aktualität.';
    const res = await fetch(SELECT_URL, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ content: bad }),
    });
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error.code, 'VALIDATION_ERROR');
    assertStringIncludes(body.error.message, '{{recencyInstruction}}');
  },
});

Deno.test({
  name: 'information_select: PUT with 10-char content returns 400',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(SELECT_URL, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ content: 'kurz kurz' }),
    });
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error.code, 'VALIDATION_ERROR');
    assertStringIncludes(body.error.message, 'zu kurz');
  },
});

Deno.test({
  name: 'information_select: DELETE reverts to hardcoded default',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await fetch(SELECT_URL, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ content: VALID_SELECT_OVERRIDE }),
    });

    const delRes = await fetch(SELECT_URL, { method: 'DELETE', headers: headers() });
    assertEquals(delRes.status, 200);

    const getRes = await fetch(SELECT_URL, { method: 'GET', headers: headers() });
    const body = await getRes.json();
    assertEquals(body.data.prompt, INFORMATION_SELECT_PROMPT);
  },
});

Deno.test({
  name: 'information_select: GET without prior PUT returns hardcoded default',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await resetSelect();
    const res = await fetch(SELECT_URL, { method: 'GET', headers: headers() });
    const body = await res.json();
    assertEquals(body.data.prompt, INFORMATION_SELECT_PROMPT);
  },
});

// ---------------------------------------------------------------------------
// draft_compose_layer2 (compose/prompt)
// ---------------------------------------------------------------------------

Deno.test({
  name: 'draft_compose_layer2: PUT round-trip — GET reflects saved content',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await resetCompose();

    const putRes = await fetch(COMPOSE_PROMPT_URL, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ content: VALID_COMPOSE_OVERRIDE }),
    });
    assertEquals(putRes.status, 200);
    const putBody = await putRes.json();
    assertEquals(putBody.data.prompt, VALID_COMPOSE_OVERRIDE);

    const getRes = await fetch(COMPOSE_PROMPT_URL, { method: 'GET', headers: headers() });
    const getBody = await getRes.json();
    assertEquals(getBody.data.prompt, VALID_COMPOSE_OVERRIDE);

    await resetCompose();
  },
});

Deno.test({
  name: 'draft_compose_layer2: PUT with 10-char content returns 400',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(COMPOSE_PROMPT_URL, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ content: 'kurz kurz' }),
    });
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error.code, 'VALIDATION_ERROR');
    assertStringIncludes(body.error.message, 'zu kurz');
  },
});

Deno.test({
  name: 'draft_compose_layer2: DELETE reverts to hardcoded default',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await fetch(COMPOSE_PROMPT_URL, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ content: VALID_COMPOSE_OVERRIDE }),
    });

    const delRes = await fetch(COMPOSE_PROMPT_URL, { method: 'DELETE', headers: headers() });
    assertEquals(delRes.status, 200);

    const getRes = await fetch(COMPOSE_PROMPT_URL, { method: 'GET', headers: headers() });
    const body = await getRes.json();
    assertEquals(body.data.prompt, DRAFT_COMPOSE_PROMPT);
  },
});

Deno.test({
  name: 'draft_compose_layer2: GET without prior PUT returns hardcoded default',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await resetCompose();
    const res = await fetch(COMPOSE_PROMPT_URL, { method: 'GET', headers: headers() });
    const body = await res.json();
    assertEquals(body.data.prompt, DRAFT_COMPOSE_PROMPT);
  },
});

// ---------------------------------------------------------------------------
// max_units_per_compose (compose/max-units)
// ---------------------------------------------------------------------------

async function resetMaxUnits(): Promise<void> {
  await fetch(COMPOSE_MAX_UNITS_URL, { method: 'DELETE', headers: headers() });
}

Deno.test({
  name: 'max_units: PUT round-trip — GET reflects saved value',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await resetMaxUnits();

    const putRes = await fetch(COMPOSE_MAX_UNITS_URL, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ value: 15 }),
    });
    assertEquals(putRes.status, 200);
    const putBody = await putRes.json();
    assertEquals(putBody.data.value, 15);

    const getRes = await fetch(COMPOSE_MAX_UNITS_URL, { method: 'GET', headers: headers() });
    const getBody = await getRes.json();
    assertEquals(getBody.data.value, 15);

    await resetMaxUnits();
  },
});

Deno.test({
  name: 'max_units: PUT below range (2) returns 400',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(COMPOSE_MAX_UNITS_URL, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ value: 2 }),
    });
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error.code, 'VALIDATION_ERROR');
    assertStringIncludes(body.error.message, 'zwischen');
  },
});

Deno.test({
  name: 'max_units: PUT above range (51) returns 400',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(COMPOSE_MAX_UNITS_URL, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ value: 51 }),
    });
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error.code, 'VALIDATION_ERROR');
  },
});

Deno.test({
  name: 'max_units: PUT non-integer (12.5) returns 400',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const res = await fetch(COMPOSE_MAX_UNITS_URL, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ value: 12.5 }),
    });
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error.code, 'VALIDATION_ERROR');
    assertStringIncludes(body.error.message, 'ganze Zahl');
  },
});

Deno.test({
  name: 'max_units: DELETE reverts to hardcoded default',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await fetch(COMPOSE_MAX_UNITS_URL, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ value: 15 }),
    });

    const delRes = await fetch(COMPOSE_MAX_UNITS_URL, { method: 'DELETE', headers: headers() });
    assertEquals(delRes.status, 200);

    const getRes = await fetch(COMPOSE_MAX_UNITS_URL, { method: 'GET', headers: headers() });
    const body = await getRes.json();
    assertEquals(body.data.value, MAX_UNITS_PER_COMPOSE);
  },
});

Deno.test({
  name: 'max_units: GET without prior PUT returns hardcoded default',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await resetMaxUnits();
    const res = await fetch(COMPOSE_MAX_UNITS_URL, { method: 'GET', headers: headers() });
    const body = await res.json();
    assertEquals(body.data.value, MAX_UNITS_PER_COMPOSE);
  },
});
