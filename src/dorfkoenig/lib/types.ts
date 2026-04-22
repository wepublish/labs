// coJournalist-Lite TypeScript types

export type ScoutType = 'web' | 'civic';
export type LocationMode = 'manual' | 'auto';
export type VillageConfidence = 'high' | 'medium' | 'low';

export interface Location {
  city: string;
  state?: string;
  country: string;
  latitude?: number;
  longitude?: number;
  count?: number;
}

export interface Scout {
  id: string;
  user_id: string;
  name: string;
  url: string | null;
  criteria: string;
  location: Location | null;
  location_mode: LocationMode;
  topic?: string | null;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  is_active: boolean;
  last_run_at: string | null;
  consecutive_failures: number;
  provider?: string | null;
  content_hash?: string | null;
  scout_type: ScoutType;
  root_domain?: string | null;
  tracked_urls?: string[] | null;
  created_at: string;
  updated_at: string;
  // Last execution data (joined from scout_executions)
  last_execution_status?: 'running' | 'completed' | 'failed' | null;
  last_criteria_matched?: boolean | null;
  last_change_status?: 'changed' | 'same' | 'error' | 'first_run' | null;
  last_summary_text?: string | null;
}

export interface ScoutCreateInput {
  name: string;
  url?: string;
  criteria: string;
  location?: Location | null;
  location_mode?: LocationMode;
  topic?: string | null;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  is_active?: boolean;
  scout_type?: ScoutType;
  root_domain?: string;
  tracked_urls?: string[];
}

export interface ScoutUpdateInput {
  name?: string;
  url?: string;
  criteria?: string;
  location?: Location | null;
  location_mode?: LocationMode;
  topic?: string | null;
  frequency?: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  is_active?: boolean;
  provider?: string | null;
  content_hash?: string | null;
  root_domain?: string;
  tracked_urls?: string[];
}

// Civic scout types
export interface CandidateUrl {
  url: string;
  description: string;
  confidence: number;
}

export interface ExtractedPromise {
  promise_text: string;
  context: string;
  source_url: string;
  source_title: string | null;
  source_date: string;
  due_date: string | null;
  date_confidence: 'high' | 'medium' | 'low';
  criteria_match: boolean;
}

export interface CivicTestResult {
  valid: boolean;
  documents_found: number;
  sample_promises: ExtractedPromise[];
  error?: string;
}

export interface Promise {
  id: string;
  scout_id: string;
  promise_text: string;
  context: string | null;
  source_url: string | null;
  source_title: string | null;
  meeting_date: string | null;
  due_date: string | null;
  date_confidence: 'high' | 'medium' | 'low';
  status: 'new' | 'in_progress' | 'fulfilled' | 'broken' | 'notified';
  created_at: string;
  updated_at: string;
}

export interface Execution {
  id: string;
  scout_id: string;
  scout_name?: string;
  scout?: {
    name: string;
    url: string;
  };
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  change_status: 'changed' | 'same' | 'error' | 'first_run' | null;
  criteria_matched: boolean | null;
  is_duplicate: boolean;
  duplicate_similarity: number | null;
  notification_sent: boolean;
  notification_error: string | null;
  units_extracted: number;
  scrape_duration_ms?: number | null;
  summary_text: string | null;
  error_message: string | null;
  units?: InformationUnit[];
}

export interface InformationUnit {
  id: string;
  statement: string;
  unit_type: 'fact' | 'event' | 'entity_update';
  entities: string[];
  source_url: string;
  source_domain: string;
  source_title: string | null;
  location: Location | null;
  topic?: string | null;
  scout_id?: string;
  source_type?: 'scout' | 'manual_text' | 'manual_photo' | 'manual_pdf';
  file_path?: string | null;
  file_url?: string | null;
  created_at: string;
  used_in_article: boolean;
  event_date?: string | null;
  similarity?: number;
  /** Auto-mode metadata (null for manual-mode and legacy rows). */
  village_confidence?: VillageConfidence | null;
  review_required?: boolean;
  assignment_path?: string | null;
}

export interface ManualUploadResult {
  units_created: number;
  unit_ids: string[];
}

export interface PresignedUploadResult {
  upload_url: string;
  storage_path: string;
  token: string;
}

export type NewspaperJobStage = 'parsing_pdf' | 'chunking' | 'extracting' | 'storing';

export type NewspaperJobStatus =
  | 'processing'
  | 'review_pending'
  | 'storing'
  | 'completed'
  | 'cancelled'
  | 'failed';

/**
 * Mirror of the ResolvedUnit staged in newspaper_jobs.extracted_units.
 * The UI submits selection by `uid` rather than array index.
 */
export interface NewspaperExtractedUnit {
  uid: string;
  statement: string;
  unit_type: 'fact' | 'event' | 'entity_update';
  entities: string[];
  event_date: string | null;
  /** 'exact' = full date in source; 'inferred' = day+month in source, year
   *  filled in from publication; 'unanchored' = LLM wrote a date the text
   *  doesn't support (review required). `null` when the unit has no date. */
  date_confidence: 'exact' | 'inferred' | 'unanchored' | null;
  location: { city: string; country?: string } | null;
  village_confidence: VillageConfidence | null;
  assignment_path: string | null;
  review_required: boolean;
  evidence?: string;
}

export interface NewspaperJob {
  id: string;
  user_id: string;
  storage_path: string | null;
  publication_date: string | null;
  label: string | null;
  status: NewspaperJobStatus;
  stage: NewspaperJobStage | null;
  source_type: 'manual_pdf' | 'manual_text';
  chunks_total: number;
  chunks_processed: number;
  units_created: number;
  skipped_items: string[];
  error_message: string | null;
  extracted_units: NewspaperExtractedUnit[] | null;
  created_at: string;
  completed_at: string | null;
}

export interface NewspaperProcessingResult {
  status: 'processing' | 'review_pending' | 'completed';
  job_id: string;
  storage_path?: string;
  units_created?: number;
}

/** Condensed `newspaper_jobs` row shown on the PDF upload tab so a journalist
 *  can spot a re-upload of the same file before triggering another full parse. */
export interface RecentPdfUpload {
  id: string;
  label: string | null;
  created_at: string;
  status: 'processing' | 'review_pending' | 'completed' | 'failed' | 'storing';
  units_created: number;
}

export interface Draft {
  title: string;
  headline: string;
  sections: DraftSection[];
  gaps: string[];
  sources: DraftSource[];
  word_count: number;
  units_used: number;
}

export interface DraftSection {
  heading: string;
  content: string;
}

export interface DraftSource {
  title: string | null;
  url: string;
  domain: string;
}

export interface TestResult {
  scrape_result: {
    success: boolean;
    title?: string;
    content_preview?: string;
    word_count?: number;
    error?: string;
  };
  criteria_analysis: {
    matches: boolean;
    summary: string;
    key_findings: string[];
  } | null;
  would_notify: boolean;
  would_extract_units: boolean;
  provider?: string | null;
  content_hash?: string | null;
}

export interface RunResult {
  execution_id: string;
  status: string;
  message: string;
}

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total: number;
    limit: number;
    offset: number;
  };
}

export interface ApiError {
  error: {
    message: string;
    code: string;
  };
}

