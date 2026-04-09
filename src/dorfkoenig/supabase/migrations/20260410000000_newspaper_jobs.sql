-- Newspaper PDF processing job tracker
-- Tracks async processing status for PDF uploads parsed via process-newspaper edge function.
-- Frontend subscribes via Supabase Realtime for live progress updates.

CREATE TABLE newspaper_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  publication_date DATE,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  chunks_total INTEGER NOT NULL DEFAULT 0,
  chunks_processed INTEGER NOT NULL DEFAULT 0,
  units_created INTEGER NOT NULL DEFAULT 0,
  skipped_items TEXT[] NOT NULL DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_newspaper_jobs_user_id ON newspaper_jobs(user_id);
CREATE INDEX idx_newspaper_jobs_status ON newspaper_jobs(status);

-- RLS
ALTER TABLE newspaper_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own jobs" ON newspaper_jobs
  FOR SELECT USING (
    user_id = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'sub',
      current_setting('request.headers', true)::json->>'x-user-id'
    )
    OR current_setting('role', true) = 'service_role'
  );

CREATE POLICY "Service role can manage jobs" ON newspaper_jobs
  FOR ALL USING (current_setting('role', true) = 'service_role');

-- Enable Realtime for live progress updates
ALTER PUBLICATION supabase_realtime ADD TABLE newspaper_jobs;
