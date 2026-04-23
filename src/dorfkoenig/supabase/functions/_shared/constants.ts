// Shared constants for Dorfkoenig edge functions

// --- Deduplication thresholds ---
/** Cosine similarity threshold for execution-level deduplication (30-day lookback) */
export const DEDUP_THRESHOLD = 0.85;

/** Cosine similarity threshold for unit deduplication within a single batch */
export const UNIT_DEDUP_THRESHOLD = 0.75;

/** Minimum cosine similarity for semantic search results */
export const SEARCH_MIN_SIMILARITY = 0.3;

// --- Pagination ---
export const DEFAULT_PAGE_SIZE = 20;
export const DEFAULT_UNITS_PAGE_SIZE = 50;
export const DEFAULT_SEARCH_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_SEARCH_PAGE_SIZE = 50;

// --- Content limits ---
/** Max characters for source content in compose prompt */
export const MAX_SOURCE_CONTENT_CHARS = 30_000;

/** Max units allowed per compose/generate request */
export const MAX_UNITS_PER_COMPOSE = 20;

// --- Timeouts ---
/** Default timeout per Firecrawl call within double-probe (ms) */
export const DOUBLE_PROBE_TIMEOUT_MS = 30_000;

/** Explicit runtime budgets for web scout execution. */
export const PRIMARY_PAGE_SCRAPE_TIMEOUT_MS = 60_000;
export const PRIMARY_ANALYSIS_TIMEOUT_MS = 30_000;
export const PRIMARY_EXTRACTION_TIMEOUT_MS = 45_000;
export const SUBPAGE_SCRAPE_TIMEOUT_MS = 30_000;
export const SUBPAGE_EXTRACTION_TIMEOUT_MS = 30_000;
export const PHASE_B_TOTAL_BUDGET_MS = 90_000;

/** Shared OpenRouter request budgets for scout-critical calls. */
export const OPENROUTER_CHAT_TIMEOUT_MS = 30_000;
export const OPENROUTER_EMBEDDING_TIMEOUT_MS = 20_000;

/** Lookback window for execution deduplication (days) */
export const DEDUP_LOOKBACK_DAYS = 30;

// --- LLM model routing (DRAFT_QUALITY.md §3.8) ---
// Compose is a style + negative-constraint task; Sonnet follows it more reliably
// than mini. Selection, extraction, embeddings keep mini — cheap and adequate.
/** Model for the draft-compose step (bajour-auto-draft, compose edge function). */
export const COMPOSE_MODEL = 'anthropic/claude-sonnet-4-5';
/** Model for unit selection — kept on the cheaper default. */
export const SELECTION_MODEL = 'openai/gpt-4o-mini';
/** Model for information-unit extraction — kept on the cheaper default. */
export const EXTRACTION_MODEL = 'openai/gpt-4o-mini';
