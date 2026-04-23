-- Explicitly keep Münchenstein in the Bajour pilot allow-list for the
-- next rollout wave. This is idempotent, so it is safe even if an earlier
-- migration or manual insert already enabled it.

INSERT INTO bajour_pilot_villages_list (village_id)
VALUES ('muenchenstein')
ON CONFLICT (village_id) DO NOTHING;
