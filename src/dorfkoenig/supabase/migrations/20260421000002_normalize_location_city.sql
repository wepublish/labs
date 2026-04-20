-- One-time backfill: normalize existing information_units.location->>'city'
-- values to the gemeinden.json `id` form (lowercase, umlauts → ae/oe/ue/ss).
-- Before this migration some rows stored display-form "Münchenstein" while
-- others stored "muenchenstein"; the .ilike() query path in bajour-auto-draft
-- only matched the umlaut form (the cron was silently under-selecting 6 of 9
-- Münchenstein units). Post-migration the canonical form is stored and every
-- write path uses `normalizeCity()` to stay consistent.

UPDATE information_units
   SET location = jsonb_set(
         location,
         '{city}',
         to_jsonb(
           lower(
             replace(replace(replace(replace(
               location->>'city',
               'ä', 'ae'), 'Ä', 'ae'),
               'ö', 'oe'), 'Ö', 'oe')
           )
         )
       )
 WHERE location->>'city' IS NOT NULL
   AND (
     location->>'city' ~ '[A-ZÄÖÜäöüß]'
     OR location->>'city' <> lower(location->>'city')
   );

-- Second pass: ü→ue and ß→ss on the now-lowercased values.
UPDATE information_units
   SET location = jsonb_set(
         location,
         '{city}',
         to_jsonb(
           replace(replace(location->>'city', 'ü', 'ue'), 'ß', 'ss')
         )
       )
 WHERE location->>'city' ~ '[üß]';
