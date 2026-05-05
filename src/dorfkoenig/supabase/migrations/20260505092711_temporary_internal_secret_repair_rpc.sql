-- Production recovery marker for 2026-05-05.
--
-- A temporary RPC was created directly in production to repair the
-- internal_function_secret Vault entry after the Edge Function JWT drift. The
-- RPC was immediately removed by the following migration and is intentionally
-- not recreated for local or future environments.

