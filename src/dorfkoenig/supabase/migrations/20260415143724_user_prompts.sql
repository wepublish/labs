-- Per-user overrides of hardcoded LLM system prompts.
-- Hardcoded defaults live in supabase/functions/_shared/prompts.ts.
-- Row absence = use default. Delete to reset.

CREATE TABLE user_prompts (
  user_id    TEXT NOT NULL,
  prompt_key TEXT NOT NULL,
  content    TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, prompt_key),
  CONSTRAINT user_prompts_valid_key
    CHECK (prompt_key IN ('information_select', 'draft_compose_layer2')),
  CONSTRAINT user_prompts_content_length
    CHECK (char_length(content) BETWEEN 20 AND 8000)
);

ALTER TABLE user_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own prompts"
  ON user_prompts FOR ALL
  USING (
    user_id = COALESCE(
      current_setting('request.jwt.claims', true)::json->>'sub',
      current_setting('request.headers', true)::json->>'x-user-id'
    )
    OR current_setting('role', true) = 'service_role'
  );

CREATE TRIGGER user_prompts_updated_at
  BEFORE UPDATE ON user_prompts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE user_prompts IS
  'Per-user overrides of hardcoded LLM system prompts in _shared/prompts.ts. Row absence = default. Delete to reset.';
