-- Scout alerts now go to ADMIN_EMAILS (env var, read by execute-scout /
-- execute-civic-scout / civic-notify-promises). Per-scout recipient field
-- is obsolete.

ALTER TABLE scouts DROP COLUMN IF EXISTS notification_email;
