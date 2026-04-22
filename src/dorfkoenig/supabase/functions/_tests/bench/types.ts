/**
 * Shared types for the Dorfkönig draft-quality benchmark harness.
 * See specs/DRAFT_QUALITY.md §4 for the format contract.
 */

export interface FixtureUnit {
  id: string;
  statement: string;
  unit_type: 'fact' | 'event' | 'entity_update';
  entities: string[];
  event_date: string | null;
  publication_date: string | null;
  created_at: string;
  location: { city: string; country?: string } | null;
  source_url: string;
  source_domain: string;
  article_url: string | null;
  is_listing_page: boolean;
  sensitivity: 'none' | 'death' | 'accident' | 'crime' | 'minor_safety';
  village_confidence: 'high' | 'medium' | 'low';
  quality_score: number;
}

export interface GoldBullet {
  emoji: string;
  kind: 'lead' | 'secondary' | 'event' | 'good_news';
  text: string;
  article_url: string | null;
  source_domain: string;
  source_unit_ids: string[];
}

export interface GoldRejection {
  unit_id: string;
  reason: string;
}

export interface Fixture {
  fixture_id: string;
  village_id: string;
  village_name: string;
  edition_date: string;
  notes?: string;
  units: FixtureUnit[];
  gold: {
    bullets: GoldBullet[];
    rejected_units: GoldRejection[];
  };
}

/**
 * What the compose pipeline produced for this fixture. Phase 0 accepts v1 markdown
 * (draft.body_md) and adapts by parsing bullet-like structures; Phase 1 plugs the
 * bullet-only schema in directly.
 */
export interface BenchOutput {
  /** Parsed bullet-shaped representation of what the pipeline produced. */
  bullets: Array<{
    emoji: string | null;
    kind: GoldBullet['kind'] | null;
    text: string;
    /** URLs extracted from Markdown links inside text. */
    link_urls: string[];
    /** Unit IDs provenance if known; may be empty in v1 adaptation. */
    source_unit_ids: string[];
  }>;
  /** Editor-facing notes (e.g. empty-draft reason). */
  notes_for_editor: string[];
  /** Full body text used for filler/banlist checks. */
  body_text: string;
}

export interface MetricResult {
  name: string;
  pass: boolean;
  /** 0–100 per-metric score. */
  score: number;
  weight: number;
  detail: string;
}

export interface FixtureReport {
  fixture_id: string;
  village_id: string;
  edition_date: string;
  aggregate_score: number;
  metrics: MetricResult[];
  pass: boolean;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: string;
}

export interface BenchReport {
  runs: FixtureReport[];
  aggregate_score: number;
  pass: boolean;
  config: {
    model?: string;
    temperature: number;
    prompt_override?: string;
  };
}
