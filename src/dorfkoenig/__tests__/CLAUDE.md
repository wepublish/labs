# Tests - Agent Guide

Unit tests for the Dorfkoenig frontend. Framework: **Vitest 4.0.18** (Node environment, globals enabled).

## Commands

Run from repo root:

```bash
npm test            # single run
npm run test:watch  # watch mode
```

## Config

- `vitest.config.ts` — includes `src/dorfkoenig/__tests__/**/*.test.ts`
- `setup.ts` — mocks `localStorage` for Node environment

## Test Map

| Source Module | Test File | What's Covered |
|---------------|-----------|----------------|
| `lib/api.ts` | `lib/api.test.ts` | `api.get/post/delete` (headers, auth, envelope unwrap, errors), `scoutsApi` (list, get, create, update, delete, run, test — incl. is_active, location, frequency, extract_units), `unitsApi` (list with filters, search), `composeApi` (generate), `executionsApi` (list with filters, get) |
| `lib/constants.ts` | `lib/constants.test.ts` | `FREQUENCY_OPTIONS`, `FREQUENCY_OPTIONS_EXTENDED`, `DAY_OF_WEEK_OPTIONS`, `UNIT_TYPE_LABELS`, `EXECUTION_STATUS_LABELS`, `CHANGE_STATUS_LABELS`, `PRESET_USERS`, `formatDate`, `formatRelativeTime` |
| `stores/auth.ts` | `stores/auth.test.ts` | `login` (localStorage, trim, empty validation), `logout`, `getUserId`, `initAuth` (session restore) |
| `stores/scouts.ts` | `stores/scouts.test.ts` | `load` (success + error), `create` (with topic, without topic), `get` (success + null on failure), `update` (name, topic, clear topic), `delete`, `run` (with/without options, error propagation), `test` (success, failure, error propagation), `clearError`, enrichment fields, derived stores (`scoutsCount`) |
| `stores/units.ts` | `stores/units.test.ts` | `load` (with city, topic, topic derivation, errors), `search` (with/without location), `setLocation`, `setTopic`, `markUsed`, `clearError` |
| Scout wizard flow | `stores/scout-wizard.test.ts` | Step 1: create inactive draft (with location / topic / criteria), test scrape (success / failure / criteria analysis). Step 2: update + activate, biweekly frequency, first run with/without baseline import. Abort: draft cleanup on cancel, already-deleted draft. Full sequence: create -> test -> configure -> activate -> run, retry with re-created draft. |

## Conventions

- All API calls are mocked via `vi.mock('../../lib/api')` — tests verify store behavior, not network.
- `makeScout()` / `makeUnit()` helpers create typed fixtures with sensible defaults and per-test overrides.
- Store state is reset in `beforeEach` by loading an empty list then clearing mocks.
- Tests use `get()` from `svelte/store` to read store state synchronously after async operations.

## Adding Tests

1. Create `__tests__/{layer}/{module}.test.ts` matching the source path.
2. Mock external dependencies at the top of the file with `vi.mock()` before importing the module under test.
3. Use `await import()` (dynamic import) after mocks are registered so Vitest applies them.
4. Add a `makeXxx()` factory for any new fixture type.
5. Update this CLAUDE.md's Test Map table with the new entry.
