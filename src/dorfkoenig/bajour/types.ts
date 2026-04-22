// Bajour-specific types

export interface Village {
  id: string;
  name: string;
  canton: string;
  latitude: number;
  longitude: number;
  scout_id: string;
}

export type VerificationStatus = 'ausstehend' | 'bestätigt' | 'abgelehnt';

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
  created_at: string;
  updated_at: string;
  /** DRAFT_QUALITY.md §3.1 — 1 = legacy markdown, 2 = bullets_json. */
  schema_version?: number;
  bullets_json?: DraftBulletsJson | null;
}

