-- Bajour village correspondents — replaces BAJOUR_CORRESPONDENTS env secret.
-- Phones stored WITHOUT '+' prefix to match Meta webhook format (e.g. '41783124547').

CREATE TABLE bajour_correspondents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  village_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT correspondents_phone_format CHECK (phone ~ '^[1-9][0-9]{6,14}$'),
  CONSTRAINT correspondents_unique_village_phone UNIQUE (village_id, phone)
);

-- RLS (same pattern as bajour_drafts)
ALTER TABLE bajour_correspondents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to correspondents"
  ON bajour_correspondents FOR ALL
  USING (current_setting('role', true) = 'service_role');

CREATE POLICY "Authenticated users can read active correspondents"
  ON bajour_correspondents FOR SELECT
  USING (
    is_active = true
    AND current_setting('request.headers', true)::json->>'x-user-id' IS NOT NULL
  );

-- Indexes
CREATE INDEX idx_bajour_correspondents_village_id ON bajour_correspondents(village_id);
CREATE INDEX idx_bajour_correspondents_phone ON bajour_correspondents(phone);

-- Auto-update updated_at (reuse existing trigger function)
CREATE TRIGGER bajour_correspondents_updated_at
  BEFORE UPDATE ON bajour_correspondents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Seed data (phone numbers without '+' prefix)
INSERT INTO bajour_correspondents (village_id, name, phone) VALUES
  ('riehen', 'Dev Tester 1', '41783124547'),
  ('bettingen', 'Dev Tester 2', '41764999298');

COMMENT ON TABLE bajour_correspondents IS
  'Bajour village correspondents for WhatsApp verification. Phones stored without + prefix to match Meta webhook format.';
