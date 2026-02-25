-- Bajour-specific: AI-generated village newsletter drafts with WhatsApp verification.
-- Client-specific table — not part of core schema. See docs/plans/2026-02-25-bajour-village-draft-design.md

CREATE TABLE bajour_drafts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  village_id TEXT NOT NULL,
  village_name TEXT NOT NULL,

  -- Draft content
  title TEXT,
  body TEXT NOT NULL,
  selected_unit_ids UUID[] NOT NULL DEFAULT '{}',
  custom_system_prompt TEXT,

  -- Verification
  verification_status TEXT NOT NULL DEFAULT 'ausstehend'
    CHECK (verification_status IN ('ausstehend', 'bestätigt', 'abgelehnt')),
  verification_responses JSONB NOT NULL DEFAULT '[]',
  verification_sent_at TIMESTAMPTZ,
  verification_resolved_at TIMESTAMPTZ,
  verification_timeout_at TIMESTAMPTZ,

  -- WhatsApp tracking
  whatsapp_message_ids JSONB NOT NULL DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE bajour_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own drafts"
  ON bajour_drafts FOR ALL
  USING (
    user_id = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'sub',
      current_setting('request.headers', true)::json->>'x-user-id'
    )
    OR current_setting('role', true) = 'service_role'
  );

CREATE INDEX idx_bajour_drafts_user_id ON bajour_drafts(user_id);
CREATE INDEX idx_bajour_drafts_village_id ON bajour_drafts(village_id);

-- Auto-update updated_at
CREATE TRIGGER bajour_drafts_updated_at
  BEFORE UPDATE ON bajour_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE bajour_drafts IS
  'Bajour-specific: AI-generated village newsletter drafts with WhatsApp verification. Client-specific table — not part of core schema.';
