-- ============================================================================
-- coJournalist-Lite (Dorfkoenig) Seed Data
-- User: tester-1
-- Run via: Supabase Dashboard SQL Editor or MCP execute_sql
-- ============================================================================

-- 1. CLEANUP — delete existing tester-1 data (CASCADE deletes executions + units)
DELETE FROM scouts WHERE user_id = 'tester-1';

-- 2. HELPER — deterministic topic-clustered 1536-dim embedding generator
-- 8 topic "zones" of 192 dims each. High values in topic zone (~0.05),
-- low elsewhere (~0.001). Cosine similarity ~0.99 within topic, ~0.04 cross-topic.
CREATE OR REPLACE FUNCTION _seed_embedding(p_topic INT, p_unit INT)
RETURNS vector(1536) AS $$
  SELECT array_agg(
    CASE
      WHEN i >= p_topic * 192 AND i < (p_topic + 1) * 192
      THEN (0.05 + (p_unit::float8 * 0.002) + (((i * 7 + p_unit * 13) % 97)::float8 * 0.00005))
      ELSE (0.001 + (((i * 11 + p_unit * 17) % 89)::float8 * 0.00001))
    END
    ORDER BY i
  )::vector(1536)
  FROM generate_series(0, 1535) AS i;
$$ LANGUAGE sql IMMUTABLE;

-- ============================================================================
-- 3. SCOUTS (8 rows)
-- 6 active, 2 inactive. Real Swiss institutional URLs.
-- ============================================================================

INSERT INTO scouts (id, user_id, name, url, criteria, location, topic, frequency, is_active, last_run_at, consecutive_failures, notification_email, created_at, updated_at) VALUES

-- s1: Zürich / Stadtentwicklung / daily / active
('aa000000-0001-4000-a000-000000000001', 'tester-1',
 'Zürcher Medienmitteilungen',
 'https://www.stadt-zuerich.ch/de/aktuell/medienmitteilungen.html',
 'Neuigkeiten zu Stadtentwicklung, Verkehrsplanung und Wohnbauprojekten in Zürich',
 '{"city":"Zürich","state":"Zürich","country":"Schweiz","latitude":47.3769,"longitude":8.5417}'::jsonb,
 'Stadtentwicklung', 'daily', true,
 NOW() - INTERVAL '1 day', 0, 'tom@republish.ch',
 NOW() - INTERVAL '21 days', NOW() - INTERVAL '1 day'),

-- s2: Bern / Politik / weekly / active
('aa000000-0002-4000-a000-000000000002', 'tester-1',
 'Berner Mediencenter',
 'https://www.bern.ch/mediencenter',
 'Politische Entscheide des Bundesrats und Parlamentsdebatten in Bern',
 '{"city":"Bern","state":"Bern","country":"Schweiz","latitude":46.9480,"longitude":7.4474}'::jsonb,
 'Politik', 'weekly', true,
 NOW() - INTERVAL '3 days', 0, NULL,
 NOW() - INTERVAL '21 days', NOW() - INTERVAL '3 days'),

-- s3: Basel / Gesundheit / daily / active
('aa000000-0003-4000-a000-000000000003', 'tester-1',
 'Basler Medienmitteilungen',
 'https://www.bs.ch/medien/medienmitteilungen',
 'Entwicklungen im Gesundheitswesen, Pharmaforschung und Spitalwesen in Basel',
 '{"city":"Basel","state":"Basel-Stadt","country":"Schweiz","latitude":47.5596,"longitude":7.5886}'::jsonb,
 'Gesundheit', 'daily', true,
 NOW() - INTERVAL '2 days', 0, 'tom@republish.ch',
 NOW() - INTERVAL '21 days', NOW() - INTERVAL '2 days'),

-- s4: Genf / Politik / monthly / active
('aa000000-0004-4000-a000-000000000004', 'tester-1',
 'Genève Communiqués',
 'https://www.geneve.ch/actualites/communiques-presse',
 'Internationale Diplomatie, UNO-Aktivitäten und multilaterale Verhandlungen in Genf',
 '{"city":"Genf","state":"Genève","country":"Schweiz","latitude":46.2044,"longitude":6.1432}'::jsonb,
 'Politik', 'monthly', true,
 NOW() - INTERVAL '10 days', 0, NULL,
 NOW() - INTERVAL '21 days', NOW() - INTERVAL '10 days'),

-- s5: Luzern / Stadtentwicklung / weekly / active
('aa000000-0005-4000-a000-000000000005', 'tester-1',
 'Luzerner Stadtnachrichten',
 'https://www.stadtluzern.ch/aktuelles/newslist',
 'Tourismuszahlen, Hotellerie und Freizeitangebote in der Region Luzern',
 '{"city":"Luzern","state":"Luzern","country":"Schweiz","latitude":47.0502,"longitude":8.3093}'::jsonb,
 'Stadtentwicklung', 'weekly', true,
 NOW() - INTERVAL '5 minutes', 0, NULL,
 NOW() - INTERVAL '21 days', NOW() - INTERVAL '5 minutes'),

-- s6: Lausanne / Technologie / daily / active / 2 consecutive failures
('aa000000-0006-4000-a000-000000000006', 'tester-1',
 'EPFL Research News',
 'https://www.epfl.ch/research/domains/m2c/news',
 'Technologische Innovationen, Forschungsergebnisse und Startup-Nachrichten der EPFL',
 '{"city":"Lausanne","state":"Vaud","country":"Schweiz","latitude":46.5197,"longitude":6.6323}'::jsonb,
 'Technologie', 'daily', true,
 NOW() - INTERVAL '1 day', 2, 'tom@republish.ch',
 NOW() - INTERVAL '21 days', NOW() - INTERVAL '1 day'),

-- s7: St. Gallen / Bildung / monthly / INACTIVE
('aa000000-0007-4000-a000-000000000007', 'tester-1',
 'St. Galler Newsroom',
 'https://www.stadt.sg.ch/home/verwaltung-politik/newsroom-medienmitteilungen.html',
 'Bildungspolitik, Hochschulentwicklung und Schulreformen im Kanton St. Gallen',
 '{"city":"St. Gallen","state":"St. Gallen","country":"Schweiz","latitude":47.4245,"longitude":9.3767}'::jsonb,
 'Bildung', 'monthly', false,
 NOW() - INTERVAL '7 days', 0, NULL,
 NOW() - INTERVAL '21 days', NOW() - INTERVAL '7 days'),

-- s8: Winterthur / Kultur / weekly / INACTIVE
('aa000000-0008-4000-a000-000000000008', 'tester-1',
 'Winterthurer Medienmitteilungen',
 'https://www.stadt.winterthur.ch/themen/die-stadt/medien-und-kommunikation/medienmitteilungen-stadt-winterthur',
 'Kulturveranstaltungen, Museen und Theaterprogramme in Winterthur',
 '{"city":"Winterthur","state":"Zürich","country":"Schweiz","latitude":47.5001,"longitude":8.7240}'::jsonb,
 'Kultur', 'weekly', false,
 NOW() - INTERVAL '12 days', 0, NULL,
 NOW() - INTERVAL '21 days', NOW() - INTERVAL '12 days');

-- ============================================================================
-- 4. EXECUTIONS (20 rows)
-- Mix of completed, failed, running. Various change statuses.
-- ============================================================================

INSERT INTO scout_executions (id, scout_id, user_id, status, started_at, completed_at, change_status, criteria_matched, summary_text, summary_embedding, is_duplicate, duplicate_similarity, notification_sent, notification_error, error_message, units_extracted, scrape_duration_ms, created_at) VALUES

-- e1: Scout 1 (Zürich), 12 days ago, completed, first_run, matched
('bb000000-0001-4000-a000-000000000001',
 'aa000000-0001-4000-a000-000000000001', 'tester-1', 'completed',
 NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days' + INTERVAL '45 seconds',
 'first_run', true,
 'Zürich beschliesst Tram-Ausbau und Wohnbauprojekte im Quartier Altstetten. VBZ bestellt neue Fahrzeuge.',
 _seed_embedding(0, 101), false, NULL, true, NULL, NULL, 5, 3200,
 NOW() - INTERVAL '12 days'),

-- e2: Scout 1 (Zürich), 5 days ago, completed, changed, matched
('bb000000-0002-4000-a000-000000000002',
 'aa000000-0001-4000-a000-000000000001', 'tester-1', 'completed',
 NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days' + INTERVAL '38 seconds',
 'changed', true,
 'Baustart Tram Zürich West, Anwohnerprotest und SBB-Verzögerung bei Altstetten. Architekturpreis für Turbinenplatz.',
 _seed_embedding(0, 102), false, NULL, true, NULL, NULL, 4, 2800,
 NOW() - INTERVAL '5 days'),

-- e3: Scout 1 (Zürich), 1 day ago, completed, changed, matched
('bb000000-0003-4000-a000-000000000003',
 'aa000000-0001-4000-a000-000000000001', 'tester-1', 'completed',
 NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '42 seconds',
 'changed', true,
 'VBZ-Fahrgastrekord, Langstrasse wird Begegnungszone. ETH eröffnet Forschungszentrum in Europaallee.',
 _seed_embedding(0, 103), false, NULL, true, NULL, NULL, 4, 3100,
 NOW() - INTERVAL '1 day'),

-- e4: Scout 2 (Bern), 14 days ago, completed, first_run, matched
('bb000000-0004-4000-a000-000000000004',
 'aa000000-0002-4000-a000-000000000002', 'tester-1', 'completed',
 NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days' + INTERVAL '52 seconds',
 'first_run', true,
 'Nationalrat startet Budgetdebatte 2027. Keller-Sutter fordert Milliarden-Einsparungen, SP wehrt sich.',
 _seed_embedding(1, 101), false, NULL, false, NULL, NULL, 4, 4500,
 NOW() - INTERVAL '14 days'),

-- e5: Scout 2 (Bern), 7 days ago, completed, changed, matched
('bb000000-0005-4000-a000-000000000005',
 'aa000000-0002-4000-a000-000000000002', 'tester-1', 'completed',
 NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days' + INTERVAL '41 seconds',
 'changed', true,
 'Ständerat genehmigt Armee-Budget-Erhöhung. Grüne gegen Rüstungsausgaben, FDP-SVP-Allianz für Schuldenbremse.',
 _seed_embedding(1, 102), false, NULL, false, NULL, NULL, 4, 3800,
 NOW() - INTERVAL '7 days'),

-- e6: Scout 2 (Bern), 3 days ago, completed, same (early exit, no analysis)
('bb000000-0006-4000-a000-000000000006',
 'aa000000-0002-4000-a000-000000000002', 'tester-1', 'completed',
 NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days' + INTERVAL '15 seconds',
 'same', NULL, NULL, NULL, false, NULL, false, NULL, NULL, 0, 1200,
 NOW() - INTERVAL '3 days'),

-- e7: Scout 3 (Basel), 10 days ago, completed, first_run, matched
('bb000000-0007-4000-a000-000000000007',
 'aa000000-0003-4000-a000-000000000003', 'tester-1', 'completed',
 NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days' + INTERVAL '48 seconds',
 'first_run', true,
 'Novartis eröffnet Gentherapie-Zentrum. Unispital Basel meldet mehr ambulante Behandlungen. Biotech-Förderung.',
 _seed_embedding(2, 101), false, NULL, true, NULL, NULL, 4, 3600,
 NOW() - INTERVAL '10 days'),

-- e8: Scout 3 (Basel), 2 days ago, completed, changed, matched
('bb000000-0008-4000-a000-000000000008',
 'aa000000-0003-4000-a000-000000000003', 'tester-1', 'completed',
 NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '55 seconds',
 'changed', true,
 'Personalmangel Intensivpflege, Uni-Novartis-Partnerschaft, E-Patientenakte, mRNA-Durchbruch, Pandemie-Zentrum.',
 _seed_embedding(2, 102), false, NULL, true, NULL, NULL, 4, 4100,
 NOW() - INTERVAL '2 days'),

-- e9: Scout 4 (Genf), 11 days ago, completed, first_run, matched
('bb000000-0009-4000-a000-000000000009',
 'aa000000-0004-4000-a000-000000000004', 'tester-1', 'completed',
 NOW() - INTERVAL '11 days', NOW() - INTERVAL '11 days' + INTERVAL '61 seconds',
 'first_run', true,
 'UNO-Sondersitzung Sudan, Schweiz übernimmt Abrüstungsvorsitz. IKRK eröffnet Technologiezentrum.',
 _seed_embedding(3, 101), false, NULL, false, NULL, NULL, 4, 5200,
 NOW() - INTERVAL '11 days'),

-- e10: Scout 4 (Genf), 10 days ago, failed
('bb000000-000a-4000-a000-00000000000a',
 'aa000000-0004-4000-a000-000000000004', 'tester-1', 'failed',
 NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days' + INTERVAL '5 seconds',
 'error', NULL, NULL, NULL, false, NULL, false, NULL,
 'Firecrawl scrape failed: HTTP 503 Service Unavailable', 0, 800,
 NOW() - INTERVAL '10 days'),

-- e11: Scout 5 (Luzern), 13 days ago, completed, first_run, matched
('bb000000-000b-4000-a000-00000000000b',
 'aa000000-0005-4000-a000-000000000005', 'tester-1', 'completed',
 NOW() - INTERVAL '13 days', NOW() - INTERVAL '13 days' + INTERVAL '39 seconds',
 'first_run', true,
 'Luzern verzeichnet Übernachtungsrekord. Rigi investiert in Zahnradbahn. Neue Tourismusabgabe beschlossen.',
 _seed_embedding(4, 101), false, NULL, false, NULL, NULL, 3, 2900,
 NOW() - INTERVAL '13 days'),

-- e12: Scout 5 (Luzern), 5 days ago, completed, changed, matched, DUPLICATE
('bb000000-000c-4000-a000-00000000000c',
 'aa000000-0005-4000-a000-000000000005', 'tester-1', 'completed',
 NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days' + INTERVAL '44 seconds',
 'changed', true,
 'KKL-Konzerte nahezu ausverkauft, SGV erweitert Abendfahrten. Altstadt-Fussgängerzone geplant.',
 _seed_embedding(4, 102), true, 0.91, false, NULL, NULL, 3, 3300,
 NOW() - INTERVAL '5 days'),

-- e13: Scout 5 (Luzern), 5 min ago, completed, changed, matched
('bb000000-000d-4000-a000-00000000000d',
 'aa000000-0005-4000-a000-000000000005', 'tester-1', 'completed',
 NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '4 minutes',
 'changed', true, 'Neue Bauvorhaben im Luzerner Stadtzentrum geplant.', NULL, false, NULL, false, NULL, NULL, 0, NULL,
 NOW() - INTERVAL '5 minutes'),

-- e14: Scout 6 (Lausanne), 8 days ago, completed, first_run, matched
('bb000000-000e-4000-a000-00000000000e',
 'aa000000-0006-4000-a000-000000000006', 'tester-1', 'completed',
 NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days' + INTERVAL '57 seconds',
 'first_run', true,
 'EPFL: Solarzellen-Algorithmus, 25-Mio-Startup-Finanzierung, KI-Medizin-Institut, Fusionsforschungs-Durchbruch.',
 _seed_embedding(5, 101), false, NULL, true, NULL, NULL, 5, 4800,
 NOW() - INTERVAL '8 days'),

-- e15: Scout 6 (Lausanne), 3 days ago, FAILED (1st failure)
('bb000000-000f-4000-a000-00000000000f',
 'aa000000-0006-4000-a000-000000000006', 'tester-1', 'failed',
 NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days' + INTERVAL '8 seconds',
 'error', NULL, NULL, NULL, false, NULL, false, NULL,
 'OpenRouter API timeout after 30s', 0, 600,
 NOW() - INTERVAL '3 days'),

-- e16: Scout 6 (Lausanne), 1 day ago, FAILED (2nd failure)
('bb000000-0010-4000-a000-000000000010',
 'aa000000-0006-4000-a000-000000000006', 'tester-1', 'failed',
 NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '6 seconds',
 'error', NULL, NULL, NULL, false, NULL, false, NULL,
 'OpenRouter API error: model overloaded, please retry', 0, 500,
 NOW() - INTERVAL '1 day'),

-- e17: Scout 7 (St. Gallen), 14 days ago, completed, first_run, matched
('bb000000-0011-4000-a000-000000000011',
 'aa000000-0007-4000-a000-000000000007', 'tester-1', 'completed',
 NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days' + INTERVAL '35 seconds',
 'first_run', true,
 'HSG lanciert Datenwissenschafts-Master. Kanton investiert in Berufsschulen. PHSG testet KI-Unterricht.',
 _seed_embedding(6, 101), false, NULL, false, NULL, NULL, 3, 2600,
 NOW() - INTERVAL '14 days'),

-- e18: Scout 7 (St. Gallen), 7 days ago, completed, same (no change)
('bb000000-0012-4000-a000-000000000012',
 'aa000000-0007-4000-a000-000000000007', 'tester-1', 'completed',
 NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days' + INTERVAL '18 seconds',
 'same', NULL, NULL, NULL, false, NULL, false, NULL, NULL, 0, 1500,
 NOW() - INTERVAL '7 days'),

-- e19: Scout 8 (Winterthur), 12 days ago, completed, first_run, matched
('bb000000-0013-4000-a000-000000000013',
 'aa000000-0008-4000-a000-000000000008', 'tester-1', 'completed',
 NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days' + INTERVAL '43 seconds',
 'first_run', true,
 'Museum Oskar Reinhart erhält Impressionisten-Schenkung. Musikfestwochen auf drei Wochen erweitert.',
 _seed_embedding(7, 101), false, NULL, false, NULL, NULL, 3, 3400,
 NOW() - INTERVAL '12 days'),

-- e20: Scout 3 (Basel), 6 days ago, completed, same (no change)
('bb000000-0014-4000-a000-000000000014',
 'aa000000-0003-4000-a000-000000000003', 'tester-1', 'completed',
 NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days' + INTERVAL '16 seconds',
 'same', NULL, NULL, NULL, false, NULL, false, NULL, NULL, 0, 1300,
 NOW() - INTERVAL '6 days');

-- ============================================================================
-- 5. INFORMATION UNITS (50 rows)
-- German-language statements grouped by topic/location.
-- ~10% marked used_in_article.
-- ============================================================================

INSERT INTO information_units (user_id, scout_id, execution_id, statement, unit_type, entities, source_url, source_domain, source_title, location, topic, embedding, used_in_article, used_at, created_at) VALUES

-- ========== ZÜRICH / Stadtentwicklung (topic 0) ==========

-- E1: 5 units (u1-u5)
('tester-1', 'aa000000-0001-4000-a000-000000000001', 'bb000000-0001-4000-a000-000000000001',
 'Die Stadt Zürich hat den Ausbau der Tramlinien 2 und 4 bis 2028 beschlossen.',
 'fact', ARRAY['Stadt Zürich', 'VBZ'],
 'https://www.stadt-zuerich.ch/de/aktuell/medienmitteilungen.html', 'stadt-zuerich.ch', 'Medienmitteilungen der Stadt Zürich',
 '{"city":"Zürich","state":"Zürich","country":"Schweiz","latitude":47.3769,"longitude":8.5417}'::jsonb,
 'Stadtentwicklung', _seed_embedding(0, 1), false, NULL, NOW() - INTERVAL '12 days'),

('tester-1', 'aa000000-0001-4000-a000-000000000001', 'bb000000-0001-4000-a000-000000000001',
 'Der Gemeinderat hat 380 Millionen Franken für den Tram-Ausbau bewilligt.',
 'fact', ARRAY['Gemeinderat Zürich'],
 'https://www.stadt-zuerich.ch/de/aktuell/medienmitteilungen.html', 'stadt-zuerich.ch', 'Medienmitteilungen der Stadt Zürich',
 '{"city":"Zürich","state":"Zürich","country":"Schweiz","latitude":47.3769,"longitude":8.5417}'::jsonb,
 'Stadtentwicklung', _seed_embedding(0, 2), false, NULL, NOW() - INTERVAL '12 days'),

('tester-1', 'aa000000-0001-4000-a000-000000000001', 'bb000000-0001-4000-a000-000000000001',
 'Im Quartier Altstetten entstehen 1200 neue Wohnungen im Rahmen des Entwicklungsgebiets Letzi.',
 'fact', ARRAY['Altstetten', 'Letzi'],
 'https://www.stadt-zuerich.ch/de/aktuell/medienmitteilungen.html', 'stadt-zuerich.ch', 'Medienmitteilungen der Stadt Zürich',
 '{"city":"Zürich","state":"Zürich","country":"Schweiz","latitude":47.3769,"longitude":8.5417}'::jsonb,
 'Stadtentwicklung', _seed_embedding(0, 3), false, NULL, NOW() - INTERVAL '12 days'),

('tester-1', 'aa000000-0001-4000-a000-000000000001', 'bb000000-0001-4000-a000-000000000001',
 'Die Verkehrsbetriebe Zürich (VBZ) planen den Einsatz von 40 neuen Flexity-Tramfahrzeugen ab 2027.',
 'fact', ARRAY['VBZ', 'Flexity'],
 'https://www.stadt-zuerich.ch/de/aktuell/medienmitteilungen.html', 'stadt-zuerich.ch', 'Medienmitteilungen der Stadt Zürich',
 '{"city":"Zürich","state":"Zürich","country":"Schweiz","latitude":47.3769,"longitude":8.5417}'::jsonb,
 'Stadtentwicklung', _seed_embedding(0, 4), false, NULL, NOW() - INTERVAL '12 days'),

('tester-1', 'aa000000-0001-4000-a000-000000000001', 'bb000000-0001-4000-a000-000000000001',
 'Der Kanton Zürich hat das Gestaltungsplanverfahren für das Areal Koch am Hauptbahnhof gestartet.',
 'event', ARRAY['Kanton Zürich', 'Areal Koch'],
 'https://www.stadt-zuerich.ch/de/aktuell/medienmitteilungen.html', 'stadt-zuerich.ch', 'Medienmitteilungen der Stadt Zürich',
 '{"city":"Zürich","state":"Zürich","country":"Schweiz","latitude":47.3769,"longitude":8.5417}'::jsonb,
 'Stadtentwicklung', _seed_embedding(0, 5), false, NULL, NOW() - INTERVAL '12 days'),

-- E2: 4 units (u6-u9)
('tester-1', 'aa000000-0001-4000-a000-000000000001', 'bb000000-0002-4000-a000-000000000002',
 'Die Bauarbeiten am Tram Zürich West wurden offiziell aufgenommen, erste Gleise werden im Hardturm verlegt.',
 'event', ARRAY['VBZ', 'Hardturm'],
 'https://www.stadt-zuerich.ch/de/aktuell/medienmitteilungen.html', 'stadt-zuerich.ch', 'Medienmitteilungen der Stadt Zürich',
 '{"city":"Zürich","state":"Zürich","country":"Schweiz","latitude":47.3769,"longitude":8.5417}'::jsonb,
 'Stadtentwicklung', _seed_embedding(0, 6), false, NULL, NOW() - INTERVAL '5 days'),

('tester-1', 'aa000000-0001-4000-a000-000000000001', 'bb000000-0002-4000-a000-000000000002',
 'Anwohner im Kreis 5 haben eine Petition gegen den Nachtbaubetrieb der Tramverlängerung eingereicht.',
 'event', ARRAY['Kreis 5'],
 'https://www.stadt-zuerich.ch/de/aktuell/medienmitteilungen.html', 'stadt-zuerich.ch', 'Medienmitteilungen der Stadt Zürich',
 '{"city":"Zürich","state":"Zürich","country":"Schweiz","latitude":47.3769,"longitude":8.5417}'::jsonb,
 'Stadtentwicklung', _seed_embedding(0, 7), false, NULL, NOW() - INTERVAL '5 days'),

('tester-1', 'aa000000-0001-4000-a000-000000000001', 'bb000000-0002-4000-a000-000000000002',
 'Die SBB hat die Fertigstellung der neuen Unterführung am Bahnhof Altstetten um sechs Monate verschoben.',
 'entity_update', ARRAY['SBB', 'Altstetten'],
 'https://www.stadt-zuerich.ch/de/aktuell/medienmitteilungen.html', 'stadt-zuerich.ch', 'Medienmitteilungen der Stadt Zürich',
 '{"city":"Zürich","state":"Zürich","country":"Schweiz","latitude":47.3769,"longitude":8.5417}'::jsonb,
 'Stadtentwicklung', _seed_embedding(0, 8), false, NULL, NOW() - INTERVAL '5 days'),

('tester-1', 'aa000000-0001-4000-a000-000000000001', 'bb000000-0002-4000-a000-000000000002',
 'Das Projekt Stadtraum Turbinenplatz erhielt den Schweizer Architekturpreis 2026.',
 'event', ARRAY['Turbinenplatz'],
 'https://www.stadt-zuerich.ch/de/aktuell/medienmitteilungen.html', 'stadt-zuerich.ch', 'Medienmitteilungen der Stadt Zürich',
 '{"city":"Zürich","state":"Zürich","country":"Schweiz","latitude":47.3769,"longitude":8.5417}'::jsonb,
 'Stadtentwicklung', _seed_embedding(0, 9), true, NOW() - INTERVAL '4 days', NOW() - INTERVAL '5 days'),

-- E3: 4 units (u10-u13)
('tester-1', 'aa000000-0001-4000-a000-000000000001', 'bb000000-0003-4000-a000-000000000003',
 'Die VBZ verzeichnen eine Rekordzahl von 350 Millionen Fahrgästen im Jahr 2025.',
 'fact', ARRAY['VBZ'],
 'https://www.stadt-zuerich.ch/de/aktuell/medienmitteilungen.html', 'stadt-zuerich.ch', 'Medienmitteilungen der Stadt Zürich',
 '{"city":"Zürich","state":"Zürich","country":"Schweiz","latitude":47.3769,"longitude":8.5417}'::jsonb,
 'Stadtentwicklung', _seed_embedding(0, 10), false, NULL, NOW() - INTERVAL '1 day'),

('tester-1', 'aa000000-0001-4000-a000-000000000001', 'bb000000-0003-4000-a000-000000000003',
 'Der Stadtrat hat die Umgestaltung der Langstrasse zur Begegnungszone mit Tempo 20 genehmigt.',
 'event', ARRAY['Langstrasse'],
 'https://www.stadt-zuerich.ch/de/aktuell/medienmitteilungen.html', 'stadt-zuerich.ch', 'Medienmitteilungen der Stadt Zürich',
 '{"city":"Zürich","state":"Zürich","country":"Schweiz","latitude":47.3769,"longitude":8.5417}'::jsonb,
 'Stadtentwicklung', _seed_embedding(0, 11), false, NULL, NOW() - INTERVAL '1 day'),

('tester-1', 'aa000000-0001-4000-a000-000000000001', 'bb000000-0003-4000-a000-000000000003',
 'Im Europaallee-Quartier eröffnet die ETH Zürich ein neues Forschungszentrum für nachhaltige Stadtentwicklung.',
 'event', ARRAY['ETH Zürich', 'Europaallee'],
 'https://www.stadt-zuerich.ch/de/aktuell/medienmitteilungen.html', 'stadt-zuerich.ch', 'Medienmitteilungen der Stadt Zürich',
 '{"city":"Zürich","state":"Zürich","country":"Schweiz","latitude":47.3769,"longitude":8.5417}'::jsonb,
 'Stadtentwicklung', _seed_embedding(0, 12), false, NULL, NOW() - INTERVAL '1 day'),

('tester-1', 'aa000000-0001-4000-a000-000000000001', 'bb000000-0003-4000-a000-000000000003',
 'Die Stadtzürcher Stimmbevölkerung hat dem Rahmenkredit von 500 Millionen für das Schulbauprogramm zugestimmt.',
 'fact', ARRAY['Stadt Zürich'],
 'https://www.stadt-zuerich.ch/de/aktuell/medienmitteilungen.html', 'stadt-zuerich.ch', 'Medienmitteilungen der Stadt Zürich',
 '{"city":"Zürich","state":"Zürich","country":"Schweiz","latitude":47.3769,"longitude":8.5417}'::jsonb,
 'Stadtentwicklung', _seed_embedding(0, 13), false, NULL, NOW() - INTERVAL '1 day'),

-- ========== BERN / Politik (topic 1) ==========

-- E4: 4 units (u14-u17)
('tester-1', 'aa000000-0002-4000-a000-000000000002', 'bb000000-0004-4000-a000-000000000004',
 'Der Nationalrat hat die Budgetdebatte für das Bundesbudget 2027 eröffnet.',
 'event', ARRAY['Nationalrat'],
 'https://www.bern.ch/mediencenter', 'bern.ch', 'Mediencenter der Stadt Bern',
 '{"city":"Bern","state":"Bern","country":"Schweiz","latitude":46.9480,"longitude":7.4474}'::jsonb,
 'Politik', _seed_embedding(1, 1), false, NULL, NOW() - INTERVAL '14 days'),

('tester-1', 'aa000000-0002-4000-a000-000000000002', 'bb000000-0004-4000-a000-000000000004',
 'Finanzministerin Karin Keller-Sutter fordert Einsparungen von 2 Milliarden Franken im Bundeshaushalt.',
 'fact', ARRAY['Karin Keller-Sutter'],
 'https://www.bern.ch/mediencenter', 'bern.ch', 'Mediencenter der Stadt Bern',
 '{"city":"Bern","state":"Bern","country":"Schweiz","latitude":46.9480,"longitude":7.4474}'::jsonb,
 'Politik', _seed_embedding(1, 2), false, NULL, NOW() - INTERVAL '14 days'),

('tester-1', 'aa000000-0002-4000-a000-000000000002', 'bb000000-0004-4000-a000-000000000004',
 'Die SP-Fraktion lehnt die geplanten Kürzungen bei den Sozialversicherungen ab.',
 'event', ARRAY['SP'],
 'https://www.bern.ch/mediencenter', 'bern.ch', 'Mediencenter der Stadt Bern',
 '{"city":"Bern","state":"Bern","country":"Schweiz","latitude":46.9480,"longitude":7.4474}'::jsonb,
 'Politik', _seed_embedding(1, 3), false, NULL, NOW() - INTERVAL '14 days'),

('tester-1', 'aa000000-0002-4000-a000-000000000002', 'bb000000-0004-4000-a000-000000000004',
 'Der Bundesrat hat eine Sondersession zur Armeefinanzierung angesetzt.',
 'event', ARRAY['Bundesrat'],
 'https://www.bern.ch/mediencenter', 'bern.ch', 'Mediencenter der Stadt Bern',
 '{"city":"Bern","state":"Bern","country":"Schweiz","latitude":46.9480,"longitude":7.4474}'::jsonb,
 'Politik', _seed_embedding(1, 4), false, NULL, NOW() - INTERVAL '14 days'),

-- E5: 4 units (u18-u21)
('tester-1', 'aa000000-0002-4000-a000-000000000002', 'bb000000-0005-4000-a000-000000000005',
 'Der Ständerat hat die Erhöhung des Armeebudgets um 300 Millionen Franken gutgeheissen.',
 'fact', ARRAY['Ständerat'],
 'https://www.bern.ch/mediencenter', 'bern.ch', 'Mediencenter der Stadt Bern',
 '{"city":"Bern","state":"Bern","country":"Schweiz","latitude":46.9480,"longitude":7.4474}'::jsonb,
 'Politik', _seed_embedding(1, 5), true, NOW() - INTERVAL '6 days', NOW() - INTERVAL '7 days'),

('tester-1', 'aa000000-0002-4000-a000-000000000002', 'bb000000-0005-4000-a000-000000000005',
 'Die Grünen fordern die Umwidmung von Rüstungsgeldern zugunsten des Klimafonds.',
 'event', ARRAY['Grüne'],
 'https://www.bern.ch/mediencenter', 'bern.ch', 'Mediencenter der Stadt Bern',
 '{"city":"Bern","state":"Bern","country":"Schweiz","latitude":46.9480,"longitude":7.4474}'::jsonb,
 'Politik', _seed_embedding(1, 6), false, NULL, NOW() - INTERVAL '7 days'),

('tester-1', 'aa000000-0002-4000-a000-000000000002', 'bb000000-0005-4000-a000-000000000005',
 'Die FDP und SVP bilden eine Allianz für die Schuldenbremse bei den Bundesfinanzen.',
 'event', ARRAY['FDP', 'SVP'],
 'https://www.bern.ch/mediencenter', 'bern.ch', 'Mediencenter der Stadt Bern',
 '{"city":"Bern","state":"Bern","country":"Schweiz","latitude":46.9480,"longitude":7.4474}'::jsonb,
 'Politik', _seed_embedding(1, 7), false, NULL, NOW() - INTERVAL '7 days'),

('tester-1', 'aa000000-0002-4000-a000-000000000002', 'bb000000-0005-4000-a000-000000000005',
 'Bundespräsident Guy Parmelin hat ein Treffen mit den Kantonsregierungen zum Finanzausgleich einberufen.',
 'event', ARRAY['Guy Parmelin'],
 'https://www.bern.ch/mediencenter', 'bern.ch', 'Mediencenter der Stadt Bern',
 '{"city":"Bern","state":"Bern","country":"Schweiz","latitude":46.9480,"longitude":7.4474}'::jsonb,
 'Politik', _seed_embedding(1, 8), false, NULL, NOW() - INTERVAL '7 days'),

-- ========== BASEL / Gesundheit (topic 2) ==========

-- E7: 4 units (u22-u25)
('tester-1', 'aa000000-0003-4000-a000-000000000003', 'bb000000-0007-4000-a000-000000000007',
 'Novartis hat am Standort Basel ein neues Forschungszentrum für Gen- und Zelltherapien eröffnet.',
 'event', ARRAY['Novartis', 'Basel'],
 'https://www.bs.ch/medien/medienmitteilungen', 'bs.ch', 'Medienmitteilungen Kanton Basel-Stadt',
 '{"city":"Basel","state":"Basel-Stadt","country":"Schweiz","latitude":47.5596,"longitude":7.5886}'::jsonb,
 'Gesundheit', _seed_embedding(2, 1), false, NULL, NOW() - INTERVAL '10 days'),

('tester-1', 'aa000000-0003-4000-a000-000000000003', 'bb000000-0007-4000-a000-000000000007',
 'Das Universitätsspital Basel verzeichnet einen Anstieg der ambulanten Behandlungen um 12 Prozent.',
 'fact', ARRAY['Universitätsspital Basel'],
 'https://www.bs.ch/medien/medienmitteilungen', 'bs.ch', 'Medienmitteilungen Kanton Basel-Stadt',
 '{"city":"Basel","state":"Basel-Stadt","country":"Schweiz","latitude":47.5596,"longitude":7.5886}'::jsonb,
 'Gesundheit', _seed_embedding(2, 2), false, NULL, NOW() - INTERVAL '10 days'),

('tester-1', 'aa000000-0003-4000-a000-000000000003', 'bb000000-0007-4000-a000-000000000007',
 'Die Basler Regierung hat ein Förderprogramm für die Ansiedlung von Biotech-Startups lanciert.',
 'event', ARRAY['Basel'],
 'https://www.bs.ch/medien/medienmitteilungen', 'bs.ch', 'Medienmitteilungen Kanton Basel-Stadt',
 '{"city":"Basel","state":"Basel-Stadt","country":"Schweiz","latitude":47.5596,"longitude":7.5886}'::jsonb,
 'Gesundheit', _seed_embedding(2, 3), false, NULL, NOW() - INTERVAL '10 days'),

('tester-1', 'aa000000-0003-4000-a000-000000000003', 'bb000000-0007-4000-a000-000000000007',
 'Roche investiert 1,2 Milliarden Franken in den Ausbau des Diagnostik-Campus am Rhein.',
 'fact', ARRAY['Roche'],
 'https://www.bs.ch/medien/medienmitteilungen', 'bs.ch', 'Medienmitteilungen Kanton Basel-Stadt',
 '{"city":"Basel","state":"Basel-Stadt","country":"Schweiz","latitude":47.5596,"longitude":7.5886}'::jsonb,
 'Gesundheit', _seed_embedding(2, 4), false, NULL, NOW() - INTERVAL '10 days'),

-- E8: 4 units (u26-u29)
('tester-1', 'aa000000-0003-4000-a000-000000000003', 'bb000000-0008-4000-a000-000000000008',
 'Das Kantonsspital Baselland meldet einen Engpass bei der Intensivpflege wegen Personalmangel.',
 'entity_update', ARRAY['Kantonsspital Baselland'],
 'https://www.bs.ch/medien/medienmitteilungen', 'bs.ch', 'Medienmitteilungen Kanton Basel-Stadt',
 '{"city":"Basel","state":"Basel-Stadt","country":"Schweiz","latitude":47.5596,"longitude":7.5886}'::jsonb,
 'Gesundheit', _seed_embedding(2, 5), false, NULL, NOW() - INTERVAL '2 days'),

('tester-1', 'aa000000-0003-4000-a000-000000000003', 'bb000000-0008-4000-a000-000000000008',
 'Die Universität Basel und Novartis haben eine Forschungspartnerschaft für neurodegenerative Erkrankungen unterzeichnet.',
 'event', ARRAY['Universität Basel', 'Novartis'],
 'https://www.bs.ch/medien/medienmitteilungen', 'bs.ch', 'Medienmitteilungen Kanton Basel-Stadt',
 '{"city":"Basel","state":"Basel-Stadt","country":"Schweiz","latitude":47.5596,"longitude":7.5886}'::jsonb,
 'Gesundheit', _seed_embedding(2, 6), true, NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 days'),

('tester-1', 'aa000000-0003-4000-a000-000000000003', 'bb000000-0008-4000-a000-000000000008',
 'Der Kanton Basel-Stadt hat die elektronische Patientenakte für alle öffentlichen Spitäler eingeführt.',
 'event', ARRAY['Basel-Stadt'],
 'https://www.bs.ch/medien/medienmitteilungen', 'bs.ch', 'Medienmitteilungen Kanton Basel-Stadt',
 '{"city":"Basel","state":"Basel-Stadt","country":"Schweiz","latitude":47.5596,"longitude":7.5886}'::jsonb,
 'Gesundheit', _seed_embedding(2, 7), false, NULL, NOW() - INTERVAL '2 days'),

('tester-1', 'aa000000-0003-4000-a000-000000000003', 'bb000000-0008-4000-a000-000000000008',
 'Ein neuer mRNA-Impfstoff gegen seltene Autoimmunerkrankungen wurde am Universitätsspital Basel entwickelt.',
 'event', ARRAY['Universitätsspital Basel'],
 'https://www.bs.ch/medien/medienmitteilungen', 'bs.ch', 'Medienmitteilungen Kanton Basel-Stadt',
 '{"city":"Basel","state":"Basel-Stadt","country":"Schweiz","latitude":47.5596,"longitude":7.5886}'::jsonb,
 'Gesundheit', _seed_embedding(2, 8), false, NULL, NOW() - INTERVAL '2 days'),

-- ========== GENF / Politik (topic 3) ==========

-- E9: 4 units (u30-u33)
('tester-1', 'aa000000-0004-4000-a000-000000000004', 'bb000000-0009-4000-a000-000000000009',
 'Der UNO-Menschenrechtsrat hat in Genf eine Sondersitzung zur Lage im Sudan einberufen.',
 'event', ARRAY['UNO', 'Sudan'],
 'https://www.geneve.ch/actualites/communiques-presse', 'geneve.ch', 'Communiqués de presse - Genève',
 '{"city":"Genf","state":"Genève","country":"Schweiz","latitude":46.2044,"longitude":6.1432}'::jsonb,
 'Politik', _seed_embedding(3, 1), false, NULL, NOW() - INTERVAL '11 days'),

('tester-1', 'aa000000-0004-4000-a000-000000000004', 'bb000000-0009-4000-a000-000000000009',
 'Die Schweiz übernimmt den Vorsitz der Genfer Abrüstungskonferenz für 2026.',
 'event', ARRAY['Schweiz', 'Genf'],
 'https://www.geneve.ch/actualites/communiques-presse', 'geneve.ch', 'Communiqués de presse - Genève',
 '{"city":"Genf","state":"Genève","country":"Schweiz","latitude":46.2044,"longitude":6.1432}'::jsonb,
 'Politik', _seed_embedding(3, 2), false, NULL, NOW() - INTERVAL '11 days'),

('tester-1', 'aa000000-0004-4000-a000-000000000004', 'bb000000-0009-4000-a000-000000000009',
 'Das IKRK eröffnet in Genf ein neues Zentrum für humanitäre Technologie und Innovation.',
 'event', ARRAY['IKRK', 'Genf'],
 'https://www.geneve.ch/actualites/communiques-presse', 'geneve.ch', 'Communiqués de presse - Genève',
 '{"city":"Genf","state":"Genève","country":"Schweiz","latitude":46.2044,"longitude":6.1432}'::jsonb,
 'Politik', _seed_embedding(3, 3), false, NULL, NOW() - INTERVAL '11 days'),

('tester-1', 'aa000000-0004-4000-a000-000000000004', 'bb000000-0009-4000-a000-000000000009',
 'Bundesrat Ignazio Cassis hat eine neue Initiative zur Stärkung des multilateralen Systems vorgestellt.',
 'event', ARRAY['Ignazio Cassis'],
 'https://www.geneve.ch/actualites/communiques-presse', 'geneve.ch', 'Communiqués de presse - Genève',
 '{"city":"Genf","state":"Genève","country":"Schweiz","latitude":46.2044,"longitude":6.1432}'::jsonb,
 'Politik', _seed_embedding(3, 4), false, NULL, NOW() - INTERVAL '11 days'),

-- ========== LUZERN / Stadtentwicklung (topic 4) ==========

-- E11: 3 units (u34-u36)
('tester-1', 'aa000000-0005-4000-a000-000000000005', 'bb000000-000b-4000-a000-00000000000b',
 'Die Tourismusregion Luzern-Vierwaldstättersee verzeichnet 2025 einen neuen Rekord mit 5,2 Millionen Übernachtungen.',
 'fact', ARRAY['Luzern-Vierwaldstättersee'],
 'https://www.stadtluzern.ch/aktuelles/newslist', 'stadtluzern.ch', 'Aktuelle Nachrichten Stadt Luzern',
 '{"city":"Luzern","state":"Luzern","country":"Schweiz","latitude":47.0502,"longitude":8.3093}'::jsonb,
 'Stadtentwicklung', _seed_embedding(4, 1), false, NULL, NOW() - INTERVAL '13 days'),

('tester-1', 'aa000000-0005-4000-a000-000000000005', 'bb000000-000b-4000-a000-00000000000b',
 'Die Rigi Bahnen AG investiert 45 Millionen Franken in die Modernisierung der Zahnradbahn.',
 'fact', ARRAY['Rigi Bahnen AG'],
 'https://www.stadtluzern.ch/aktuelles/newslist', 'stadtluzern.ch', 'Aktuelle Nachrichten Stadt Luzern',
 '{"city":"Luzern","state":"Luzern","country":"Schweiz","latitude":47.0502,"longitude":8.3093}'::jsonb,
 'Stadtentwicklung', _seed_embedding(4, 2), false, NULL, NOW() - INTERVAL '13 days'),

('tester-1', 'aa000000-0005-4000-a000-000000000005', 'bb000000-000b-4000-a000-00000000000b',
 'Die Stadt Luzern führt eine Tourismusabgabe von 3 Franken pro Übernachtung ein.',
 'event', ARRAY['Stadt Luzern'],
 'https://www.stadtluzern.ch/aktuelles/newslist', 'stadtluzern.ch', 'Aktuelle Nachrichten Stadt Luzern',
 '{"city":"Luzern","state":"Luzern","country":"Schweiz","latitude":47.0502,"longitude":8.3093}'::jsonb,
 'Stadtentwicklung', _seed_embedding(4, 3), false, NULL, NOW() - INTERVAL '13 days'),

-- E12: 3 units (u37-u39)
('tester-1', 'aa000000-0005-4000-a000-000000000005', 'bb000000-000c-4000-a000-00000000000c',
 'Das KKL Luzern verzeichnet eine Auslastung von 92 Prozent bei den Konzertveranstaltungen.',
 'fact', ARRAY['KKL Luzern'],
 'https://www.stadtluzern.ch/aktuelles/newslist', 'stadtluzern.ch', 'Aktuelle Nachrichten Stadt Luzern',
 '{"city":"Luzern","state":"Luzern","country":"Schweiz","latitude":47.0502,"longitude":8.3093}'::jsonb,
 'Stadtentwicklung', _seed_embedding(4, 4), false, NULL, NOW() - INTERVAL '5 days'),

('tester-1', 'aa000000-0005-4000-a000-000000000005', 'bb000000-000c-4000-a000-00000000000c',
 'Die Dampfschifffahrtsgesellschaft des Vierwaldstättersees (SGV) erweitert ihr Angebot um drei neue Abendfahrten.',
 'entity_update', ARRAY['SGV'],
 'https://www.stadtluzern.ch/aktuelles/newslist', 'stadtluzern.ch', 'Aktuelle Nachrichten Stadt Luzern',
 '{"city":"Luzern","state":"Luzern","country":"Schweiz","latitude":47.0502,"longitude":8.3093}'::jsonb,
 'Stadtentwicklung', _seed_embedding(4, 5), true, NOW() - INTERVAL '4 days', NOW() - INTERVAL '5 days'),

('tester-1', 'aa000000-0005-4000-a000-000000000005', 'bb000000-000c-4000-a000-00000000000c',
 'Der Luzerner Stadtrat plant die Fussgängerzone in der Altstadt bis 2027 zu verdoppeln.',
 'event', ARRAY['Luzerner Stadtrat'],
 'https://www.stadtluzern.ch/aktuelles/newslist', 'stadtluzern.ch', 'Aktuelle Nachrichten Stadt Luzern',
 '{"city":"Luzern","state":"Luzern","country":"Schweiz","latitude":47.0502,"longitude":8.3093}'::jsonb,
 'Stadtentwicklung', _seed_embedding(4, 6), false, NULL, NOW() - INTERVAL '5 days'),

-- ========== LAUSANNE / Technologie (topic 5) ==========

-- E14: 5 units (u40-u44)
('tester-1', 'aa000000-0006-4000-a000-000000000006', 'bb000000-000e-4000-a000-00000000000e',
 'Forscher der EPFL haben einen neuen Algorithmus für die Optimierung von Solarzelleneffizienz entwickelt.',
 'event', ARRAY['EPFL'],
 'https://www.epfl.ch/research/domains/m2c/news', 'epfl.ch', 'EPFL Research News',
 '{"city":"Lausanne","state":"Vaud","country":"Schweiz","latitude":46.5197,"longitude":6.6323}'::jsonb,
 'Technologie', _seed_embedding(5, 1), false, NULL, NOW() - INTERVAL '8 days'),

('tester-1', 'aa000000-0006-4000-a000-000000000006', 'bb000000-000e-4000-a000-00000000000e',
 'Das EPFL-Startup SwissQuant hat eine Serie-A-Finanzierung von 25 Millionen Franken erhalten.',
 'fact', ARRAY['SwissQuant', 'EPFL'],
 'https://www.epfl.ch/research/domains/m2c/news', 'epfl.ch', 'EPFL Research News',
 '{"city":"Lausanne","state":"Vaud","country":"Schweiz","latitude":46.5197,"longitude":6.6323}'::jsonb,
 'Technologie', _seed_embedding(5, 2), false, NULL, NOW() - INTERVAL '8 days'),

('tester-1', 'aa000000-0006-4000-a000-000000000006', 'bb000000-000e-4000-a000-00000000000e',
 'Die EPFL hat ein neues Institut für künstliche Intelligenz in der Medizin gegründet.',
 'event', ARRAY['EPFL'],
 'https://www.epfl.ch/research/domains/m2c/news', 'epfl.ch', 'EPFL Research News',
 '{"city":"Lausanne","state":"Vaud","country":"Schweiz","latitude":46.5197,"longitude":6.6323}'::jsonb,
 'Technologie', _seed_embedding(5, 3), false, NULL, NOW() - INTERVAL '8 days'),

('tester-1', 'aa000000-0006-4000-a000-000000000006', 'bb000000-000e-4000-a000-00000000000e',
 'Der Innovation Park der EPFL verzeichnet 2025 insgesamt 35 neue Firmengründungen.',
 'fact', ARRAY['Innovation Park', 'EPFL'],
 'https://www.epfl.ch/research/domains/m2c/news', 'epfl.ch', 'EPFL Research News',
 '{"city":"Lausanne","state":"Vaud","country":"Schweiz","latitude":46.5197,"longitude":6.6323}'::jsonb,
 'Technologie', _seed_embedding(5, 4), false, NULL, NOW() - INTERVAL '8 days'),

('tester-1', 'aa000000-0006-4000-a000-000000000006', 'bb000000-000e-4000-a000-00000000000e',
 'Das Swiss Plasma Center der EPFL meldet einen Durchbruch bei der Kernfusionsforschung.',
 'event', ARRAY['Swiss Plasma Center', 'EPFL'],
 'https://www.epfl.ch/research/domains/m2c/news', 'epfl.ch', 'EPFL Research News',
 '{"city":"Lausanne","state":"Vaud","country":"Schweiz","latitude":46.5197,"longitude":6.6323}'::jsonb,
 'Technologie', _seed_embedding(5, 5), true, NOW() - INTERVAL '7 days', NOW() - INTERVAL '8 days'),

-- ========== ST. GALLEN / Bildung (topic 6) ==========

-- E17: 3 units (u45-u47)
('tester-1', 'aa000000-0007-4000-a000-000000000007', 'bb000000-0011-4000-a000-000000000011',
 'Die Universität St. Gallen (HSG) führt ab Herbstsemester 2026 einen neuen Master in Datenwissenschaft ein.',
 'event', ARRAY['HSG', 'Universität St. Gallen'],
 'https://www.stadt.sg.ch/home/verwaltung-politik/newsroom-medienmitteilungen.html', 'stadt.sg.ch', 'Newsroom Stadt St. Gallen',
 '{"city":"St. Gallen","state":"St. Gallen","country":"Schweiz","latitude":47.4245,"longitude":9.3767}'::jsonb,
 'Bildung', _seed_embedding(6, 1), false, NULL, NOW() - INTERVAL '14 days'),

('tester-1', 'aa000000-0007-4000-a000-000000000007', 'bb000000-0011-4000-a000-000000000011',
 'Der Kanton St. Gallen investiert 120 Millionen Franken in die Sanierung der Berufsschulen.',
 'fact', ARRAY['Kanton St. Gallen'],
 'https://www.stadt.sg.ch/home/verwaltung-politik/newsroom-medienmitteilungen.html', 'stadt.sg.ch', 'Newsroom Stadt St. Gallen',
 '{"city":"St. Gallen","state":"St. Gallen","country":"Schweiz","latitude":47.4245,"longitude":9.3767}'::jsonb,
 'Bildung', _seed_embedding(6, 2), false, NULL, NOW() - INTERVAL '14 days'),

('tester-1', 'aa000000-0007-4000-a000-000000000007', 'bb000000-0011-4000-a000-000000000011',
 'Die Pädagogische Hochschule St. Gallen lanciert ein Pilotprojekt für KI-gestützten Unterricht.',
 'event', ARRAY['PHSG'],
 'https://www.stadt.sg.ch/home/verwaltung-politik/newsroom-medienmitteilungen.html', 'stadt.sg.ch', 'Newsroom Stadt St. Gallen',
 '{"city":"St. Gallen","state":"St. Gallen","country":"Schweiz","latitude":47.4245,"longitude":9.3767}'::jsonb,
 'Bildung', _seed_embedding(6, 3), false, NULL, NOW() - INTERVAL '14 days'),

-- ========== WINTERTHUR / Kultur (topic 7) ==========

-- E19: 3 units (u48-u50)
('tester-1', 'aa000000-0008-4000-a000-000000000008', 'bb000000-0013-4000-a000-000000000013',
 'Das Museum Oskar Reinhart in Winterthur erhält eine Schenkung von 200 Impressionisten-Werken.',
 'event', ARRAY['Museum Oskar Reinhart'],
 'https://www.stadt.winterthur.ch/themen/die-stadt/medien-und-kommunikation/medienmitteilungen-stadt-winterthur', 'stadt.winterthur.ch', 'Medienmitteilungen Stadt Winterthur',
 '{"city":"Winterthur","state":"Zürich","country":"Schweiz","latitude":47.5001,"longitude":8.7240}'::jsonb,
 'Kultur', _seed_embedding(7, 1), false, NULL, NOW() - INTERVAL '12 days'),

('tester-1', 'aa000000-0008-4000-a000-000000000008', 'bb000000-0013-4000-a000-000000000013',
 'Die Winterthurer Musikfestwochen werden 2026 erstmals auf drei Wochen ausgedehnt.',
 'event', ARRAY['Musikfestwochen Winterthur'],
 'https://www.stadt.winterthur.ch/themen/die-stadt/medien-und-kommunikation/medienmitteilungen-stadt-winterthur', 'stadt.winterthur.ch', 'Medienmitteilungen Stadt Winterthur',
 '{"city":"Winterthur","state":"Zürich","country":"Schweiz","latitude":47.5001,"longitude":8.7240}'::jsonb,
 'Kultur', _seed_embedding(7, 2), false, NULL, NOW() - INTERVAL '12 days'),

('tester-1', 'aa000000-0008-4000-a000-000000000008', 'bb000000-0013-4000-a000-000000000013',
 'Das Theater Winterthur hat eine Kooperation mit dem Schauspielhaus Zürich für die Saison 2026/27 vereinbart.',
 'event', ARRAY['Theater Winterthur', 'Schauspielhaus Zürich'],
 'https://www.stadt.winterthur.ch/themen/die-stadt/medien-und-kommunikation/medienmitteilungen-stadt-winterthur', 'stadt.winterthur.ch', 'Medienmitteilungen Stadt Winterthur',
 '{"city":"Winterthur","state":"Zürich","country":"Schweiz","latitude":47.5001,"longitude":8.7240}'::jsonb,
 'Kultur', _seed_embedding(7, 3), false, NULL, NOW() - INTERVAL '12 days');

-- ============================================================================
-- 6. CLEANUP — drop helper function
-- ============================================================================

DROP FUNCTION IF EXISTS _seed_embedding(INT, INT);
