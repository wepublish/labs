// coJournalist-Lite TypeScript types

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
  url: string;
  criteria: string;
  location: Location | null;
  frequency: 'daily' | 'weekly' | 'monthly';
  is_active: boolean;
  last_run_at: string | null;
  consecutive_failures: number;
  notification_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScoutCreateInput {
  name: string;
  url: string;
  criteria: string;
  location?: Location | null;
  frequency: 'daily' | 'weekly' | 'monthly';
  notification_email?: string | null;
  is_active?: boolean;
}

export interface ScoutUpdateInput {
  name?: string;
  url?: string;
  criteria?: string;
  location?: Location | null;
  frequency?: 'daily' | 'weekly' | 'monthly';
  notification_email?: string | null;
  is_active?: boolean;
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
  created_at: string;
  used_in_article: boolean;
  similarity?: number;
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
