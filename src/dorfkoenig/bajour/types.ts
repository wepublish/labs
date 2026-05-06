// Bajour-specific types

export interface Village {
  id: string;
  name: string;
  canton: string;
  latitude: number;
  longitude: number;
  scout_id: string;
}

export type VerificationStatus = 'ausstehend' | 'bestätigt' | 'abgelehnt' | 'withheld';

export interface VerificationResponse {
  name: string;
  phone: string;
  response: 'bestätigt' | 'abgelehnt';
  responded_at: string;
}

/** DRAFT_QUALITY.md §3.1 bullet-only schema (v2). */
export type BulletKind = 'lead' | 'secondary' | 'event' | 'good_news';

export interface DraftBullet {
  emoji: string;
  kind: BulletKind;
  text: string;
  article_url: string | null;
  source_domain: string | null;
  source_unit_ids: string[];
}

export interface DraftBulletsJson {
  title: string;
  bullets: DraftBullet[];
  notes_for_editor: string[];
}

export interface QualityWarning {
  reason: string;
  severity: 'blocker' | 'warning';
  message: string;
  unit_ids?: string[];
}

export type SelectionRankingReasonKey =
  | 'fresh_sensitive'
  | 'stale_sensitive'
  | 'future_publication'
  | 'static_directory_fact'
  | 'supporting_fragment'
  | 'cross_village_drift'
  | 'public_safety'
  | 'civic_utility'
  | 'soft_filler'
  | 'today_event'
  | 'past_event'
  | 'far_future_event'
  | 'too_early_event'
  | 'fresh'
  | 'stale'
  | 'article_url'
  | 'weak_url'
  | 'low_village_confidence'
  | 'high_village_confidence'
  | 'below_quality_threshold';

export interface SelectionRankingConfig {
  weights: Record<SelectionRankingReasonKey, number>;
  mandatoryScore: number;
  composeStrictMinScore: number;
  composeThinMinScore: number;
  weakUrlStrictMinScore: number;
  weakUrlThinMinScore: number;
}

export interface SelectionDiagnosticUnit {
  id: string;
  statement: string;
  score: number | null;
  mandatory?: boolean;
  quality_score?: number | null;
  sensitivity?: string | null;
  publication_date?: string | null;
  event_date?: string | null;
  article_url?: string | null;
  source_domain?: string | null;
  reasons?: string[];
  rejection_reason?: 'not_selected' | 'near_duplicate' | string;
  matched_id?: string;
  matched_statement?: string;
}

export interface SelectionDiagnostics {
  candidate_snapshot?: SelectionDiagnosticUnit[];
  selected_unit_ids?: string[];
  selected_units?: SelectionDiagnosticUnit[];
  mandatory_kept_ids?: string[];
  rejected_top_units?: SelectionDiagnosticUnit[];
  selection_response_preview?: string | null;
  ranking_config?: SelectionRankingConfig;
}

export interface BajourDraft {
  id: string;
  user_id: string;
  village_id: string;
  village_name: string;
  title: string | null;
  body: string;
  selected_unit_ids: string[];
  custom_system_prompt: string | null;
  publication_date: string;
  verification_status: VerificationStatus;
  verification_responses: VerificationResponse[];
  verification_sent_at: string | null;
  verification_resolved_at: string | null;
  verification_timeout_at: string | null;
  whatsapp_message_ids: string[];
  quality_warnings?: QualityWarning[];
  selection_diagnostics?: SelectionDiagnostics | null;
  created_at: string;
  updated_at: string;
  /** DRAFT_QUALITY.md §3.1 — 1 = legacy markdown, 2 = bullets_json. */
  schema_version?: number;
  bullets_json?: DraftBulletsJson | null;
}
