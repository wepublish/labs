-- Pilot-village allow-list, canonical replacement for the
-- `bajour_pilot_villages` Vault secret. Readable by both the 18:00 cron
-- (dispatch_auto_drafts) and the UI (for KI Entwurf gating), so the two
-- surfaces stay in sync via a single INSERT/DELETE.

CREATE TABLE IF NOT EXISTS bajour_pilot_villages_list (
  village_id TEXT PRIMARY KEY,
  added_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE bajour_pilot_villages_list ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_all" ON bajour_pilot_villages_list;
CREATE POLICY "read_all" ON bajour_pilot_villages_list
  FOR SELECT TO authenticated, service_role USING (true);

DROP POLICY IF EXISTS "service_role_write" ON bajour_pilot_villages_list;
CREATE POLICY "service_role_write" ON bajour_pilot_villages_list
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON bajour_pilot_villages_list TO authenticated, service_role;
GRANT ALL    ON bajour_pilot_villages_list TO service_role;

-- Seed with the current Vault list so the cutover is zero-downtime.
INSERT INTO bajour_pilot_villages_list (village_id) VALUES
  ('arlesheim'),
  ('muenchenstein')
ON CONFLICT (village_id) DO NOTHING;
