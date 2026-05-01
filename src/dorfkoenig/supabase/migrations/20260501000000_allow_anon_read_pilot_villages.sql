-- The browser UI uses the anon Supabase key, so the pilot allow-list must be
-- readable by anon as well as authenticated users. The list contains only
-- village IDs and is already used to gate public UI controls.

DROP POLICY IF EXISTS "read_all" ON bajour_pilot_villages_list;
CREATE POLICY "read_all" ON bajour_pilot_villages_list
  FOR SELECT TO anon, authenticated, service_role USING (true);

GRANT SELECT ON bajour_pilot_villages_list TO anon, authenticated, service_role;
