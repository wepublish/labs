-- Persist Meta WhatsApp delivery status events (sent/delivered/read/failed).
-- Spec: src/dorfkoenig/specs/WHATSAPP.md §3.3.
-- Writer: bajour-whatsapp-webhook (service role). Readers: SQL editor, future dashboard.
-- No unique constraint on wamid — Meta sends multiple events per wamid and may
-- replay on non-2xx responses; dedup happens at query time if ever needed.

CREATE TABLE IF NOT EXISTS bajour_whatsapp_status_events (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wamid        TEXT NOT NULL,
  status       TEXT NOT NULL,
  recipient    TEXT NOT NULL,
  error_code   INTEGER,
  error_title  TEXT,
  error_detail TEXT,
  raw          JSONB NOT NULL,
  received_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_status_events_wamid
  ON bajour_whatsapp_status_events (wamid);

CREATE INDEX IF NOT EXISTS idx_whatsapp_status_events_status_time
  ON bajour_whatsapp_status_events (status, received_at DESC);

ALTER TABLE bajour_whatsapp_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON bajour_whatsapp_status_events;
CREATE POLICY "service_role_all" ON bajour_whatsapp_status_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON TABLE bajour_whatsapp_status_events TO service_role;
