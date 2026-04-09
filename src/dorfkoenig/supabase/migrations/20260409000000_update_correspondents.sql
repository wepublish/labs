-- Update correspondents: new village list with dummy numbers for testing.
-- Ernst Field and Samuel Hufschmid assigned to all 10 villages.

DELETE FROM bajour_correspondents;

INSERT INTO bajour_correspondents (village_id, name, phone) VALUES
  ('aesch', 'Ernst Field', '41786651827'),
  ('aesch', 'Samuel Hufschmid', '41796169078'),
  ('allschwil', 'Ernst Field', '41786651827'),
  ('allschwil', 'Samuel Hufschmid', '41796169078'),
  ('arlesheim', 'Ernst Field', '41786651827'),
  ('arlesheim', 'Samuel Hufschmid', '41796169078'),
  ('binningen', 'Ernst Field', '41786651827'),
  ('binningen', 'Samuel Hufschmid', '41796169078'),
  ('bottmingen', 'Ernst Field', '41786651827'),
  ('bottmingen', 'Samuel Hufschmid', '41796169078'),
  ('muenchenstein', 'Ernst Field', '41786651827'),
  ('muenchenstein', 'Samuel Hufschmid', '41796169078'),
  ('muttenz', 'Ernst Field', '41786651827'),
  ('muttenz', 'Samuel Hufschmid', '41796169078'),
  ('pratteln', 'Ernst Field', '41786651827'),
  ('pratteln', 'Samuel Hufschmid', '41796169078'),
  ('reinach', 'Ernst Field', '41786651827'),
  ('reinach', 'Samuel Hufschmid', '41796169078'),
  ('riehen', 'Ernst Field', '41786651827'),
  ('riehen', 'Samuel Hufschmid', '41796169078');
