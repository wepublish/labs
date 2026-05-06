import { assertEquals } from 'https://deno.land/std@0.220.0/assert/mod.ts';
import {
  AUTO_DRAFT_BLOCKING_STATUSES,
  blocksAutoDraftRerun,
} from '../../_shared/auto-draft-idempotency.ts';

Deno.test('auto-draft idempotency — blocks active and released drafts', () => {
  assertEquals(AUTO_DRAFT_BLOCKING_STATUSES, ['ausstehend', 'bestätigt']);
  assertEquals(blocksAutoDraftRerun('ausstehend'), true);
  assertEquals(blocksAutoDraftRerun('bestätigt'), true);
});

Deno.test('auto-draft idempotency — lets withheld and rejected drafts rerun', () => {
  assertEquals(blocksAutoDraftRerun('withheld'), false);
  assertEquals(blocksAutoDraftRerun('abgelehnt'), false);
  assertEquals(blocksAutoDraftRerun(null), false);
});
