-- Add topic column to scouts (comma-separated string, e.g. "Stadtentwicklung, Verkehr")
ALTER TABLE scouts ADD COLUMN IF NOT EXISTS topic TEXT;

-- Add topic column to information_units (inherited from scout at extraction time)
ALTER TABLE information_units ADD COLUMN IF NOT EXISTS topic TEXT;
