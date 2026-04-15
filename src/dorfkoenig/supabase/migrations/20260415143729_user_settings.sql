-- Per-user numeric/boolean settings. Companion to user_prompts (which stores prompt text).
-- Defaults for valid keys live in the edge functions (_shared/constants.ts).
-- Row absence = use default. Delete to reset.

CREATE TABLE user_settings (
  user_id    TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key),
  CONSTRAINT user_settings_valid_key
    CHECK (key IN ('max_units_per_compose'))
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own settings"
  ON user_settings FOR ALL
  USING (
    user_id = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'sub',
      current_setting('request.headers', true)::json->>'x-user-id'
    )
    OR current_setting('role', true) = 'service_role'
  );

CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE user_settings IS
  'Per-user numeric/boolean settings. Defaults live in edge functions. Row absence = default.';
