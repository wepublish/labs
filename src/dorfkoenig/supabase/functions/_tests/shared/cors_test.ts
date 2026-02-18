import {
  assertEquals,
  assertExists,
  assertStringIncludes,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';
import { handleCors, jsonResponse, errorResponse, corsHeaders } from '../../_shared/cors.ts';

// --- handleCors ---

Deno.test('handleCors returns Response with CORS headers for OPTIONS request', () => {
  const req = new Request('http://localhost', { method: 'OPTIONS' });
  const res = handleCors(req);

  assertExists(res);
  assertEquals(res!.headers.get('Access-Control-Allow-Origin'), '*');
  assertEquals(
    res!.headers.get('Access-Control-Allow-Headers'),
    'authorization, x-user-id, content-type, x-client-info, apikey',
  );
  assertEquals(
    res!.headers.get('Access-Control-Allow-Methods'),
    'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  );
});

Deno.test('handleCors returns null for GET request', () => {
  const req = new Request('http://localhost', { method: 'GET' });
  const res = handleCors(req);
  assertEquals(res, null);
});

Deno.test('handleCors returns null for POST request', () => {
  const req = new Request('http://localhost', { method: 'POST' });
  const res = handleCors(req);
  assertEquals(res, null);
});

Deno.test('handleCors returns null for PUT request', () => {
  const req = new Request('http://localhost', { method: 'PUT' });
  const res = handleCors(req);
  assertEquals(res, null);
});

Deno.test('handleCors returns null for DELETE request', () => {
  const req = new Request('http://localhost', { method: 'DELETE' });
  const res = handleCors(req);
  assertEquals(res, null);
});

// --- jsonResponse ---

Deno.test('jsonResponse wraps data with status 200 and CORS headers', async () => {
  const data = { message: 'hello' };
  const res = jsonResponse(data);

  assertEquals(res.status, 200);
  assertEquals(res.headers.get('Content-Type'), 'application/json');
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*');

  const body = await res.json();
  assertEquals(body, { message: 'hello' });
});

Deno.test('jsonResponse supports custom status code 201', async () => {
  const data = { id: 'abc-123' };
  const res = jsonResponse(data, 201);

  assertEquals(res.status, 201);

  const body = await res.json();
  assertEquals(body, { id: 'abc-123' });
});

Deno.test('jsonResponse supports custom status code 202', async () => {
  const data = { status: 'accepted' };
  const res = jsonResponse(data, 202);

  assertEquals(res.status, 202);

  const body = await res.json();
  assertEquals(body, { status: 'accepted' });
});

Deno.test('jsonResponse includes all CORS headers', () => {
  const res = jsonResponse({});

  for (const [key, value] of Object.entries(corsHeaders)) {
    assertEquals(res.headers.get(key), value);
  }
});

// --- errorResponse ---

Deno.test('errorResponse returns error structure with message and code', async () => {
  const res = errorResponse('Something went wrong', 500);

  assertEquals(res.status, 500);
  assertEquals(res.headers.get('Content-Type'), 'application/json');
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*');

  const body = await res.json();
  assertEquals(body.error.message, 'Something went wrong');
  assertEquals(body.error.code, 'INTERNAL_ERROR');
});

Deno.test('errorResponse uses custom error code when provided', async () => {
  const res = errorResponse('Custom problem', 422, 'CUSTOM_CODE');

  const body = await res.json();
  assertEquals(body.error.message, 'Custom problem');
  assertEquals(body.error.code, 'CUSTOM_CODE');
});

Deno.test('errorResponse maps 400 to VALIDATION_ERROR', async () => {
  const res = errorResponse('Bad request', 400);
  const body = await res.json();
  assertEquals(body.error.code, 'VALIDATION_ERROR');
});

Deno.test('errorResponse maps 401 to UNAUTHORIZED', async () => {
  const res = errorResponse('Not authenticated', 401);
  const body = await res.json();
  assertEquals(body.error.code, 'UNAUTHORIZED');
});

Deno.test('errorResponse maps 403 to FORBIDDEN', async () => {
  const res = errorResponse('Not allowed', 403);
  const body = await res.json();
  assertEquals(body.error.code, 'FORBIDDEN');
});

Deno.test('errorResponse maps 404 to NOT_FOUND', async () => {
  const res = errorResponse('Not found', 404);
  const body = await res.json();
  assertEquals(body.error.code, 'NOT_FOUND');
});

Deno.test('errorResponse maps 409 to CONFLICT', async () => {
  const res = errorResponse('Conflict', 409);
  const body = await res.json();
  assertEquals(body.error.code, 'CONFLICT');
});

Deno.test('errorResponse maps unknown status to INTERNAL_ERROR', async () => {
  const res = errorResponse('Unknown error', 502);
  const body = await res.json();
  assertEquals(body.error.code, 'INTERNAL_ERROR');
});

Deno.test('errorResponse defaults to status 500', async () => {
  const res = errorResponse('Server error');
  assertEquals(res.status, 500);

  const body = await res.json();
  assertEquals(body.error.code, 'INTERNAL_ERROR');
});
