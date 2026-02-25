// Bajour-specific types

export interface Village {
  id: string;
  name: string;
  canton: string;
  latitude: number;
  longitude: number;
}

export type VerificationStatus = 'ausstehend' | 'bestätigt' | 'abgelehnt';

export interface VerificationResponse {
  name: string;
  phone: string;
  response: 'bestätigt' | 'abgelehnt';
  responded_at: string;
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
  verification_status: VerificationStatus;
  verification_responses: VerificationResponse[];
  verification_sent_at: string | null;
  verification_resolved_at: string | null;
  verification_timeout_at: string | null;
  whatsapp_message_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface BajourDraftGenerated {
  title: string;
  greeting: string;
  sections: { heading: string; body: string }[];
  outlook: string;
  sign_off: string;
}
