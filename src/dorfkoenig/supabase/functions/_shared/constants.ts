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
/** Default timeout for Firecrawl double-probe (ms) */
export const DOUBLE_PROBE_TIMEOUT_MS = 30_000;

/** Lookback window for execution deduplication (days) */
export const DEDUP_LOOKBACK_DAYS = 30;
