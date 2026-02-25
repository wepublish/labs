-- Add event_date to information_units for recency-biased queries
ALTER TABLE information_units
ADD COLUMN event_date DATE;

COMMENT ON COLUMN information_units.event_date IS
  'Date when the event/fact occurred (extracted by LLM). NULL for legacy units.';

-- Index for recency-based ordering
CREATE INDEX idx_information_units_event_date ON information_units(event_date DESC NULLS LAST);
